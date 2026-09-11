// Controller-only. Never run against the host of active repair work.
// Requires a complete patched dist and a prepared disposable native Tinto session.
// Usage: node <this-file> --run-disposable-native <Tinto-project> [evidence-dir] [--daily-use]
// --daily-use requires controller JSON setup receipts on stdin and readable local Codex rollout evidence.
// Native setup and unsupported/WSL routes are explicitly not public capability proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [flag, projectArgument, outputArgument, dailyFlag] = process.argv.slice(2);
assert.ok(dailyFlag === undefined || dailyFlag === "--daily-use");
const dailyUse = dailyFlag === "--daily-use";
if (flag !== "--run-disposable-native" || !projectArgument) {
  throw new Error(
    "Usage: node <script> --run-disposable-native <Tinto-project> [evidence-dir]; save active work and prepare the separate acceptance launch first.",
  );
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const project = resolve(projectArgument);
const output = resolve(
  outputArgument ??
    resolve(tmpdir(), `pumarejo-native-cancellation-${Date.now()}`),
);
mkdirSync(output, { recursive: true });
const serialize = (value) =>
  JSON.stringify(
    value,
    (_key, item) =>
      item instanceof Error
        ? Object.fromEntries(
            [
              ...new Set([
                "name",
                "message",
                "stack",
                "code",
                "data",
                "cause",
                ...Object.getOwnPropertyNames(item),
              ]),
            ].map((key) => [key, item[key]]),
          )
        : item,
    2,
  );
const save = (name, value) =>
  writeFileSync(resolve(output, `${name}.json`), serialize(value));
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
// Fail before connecting if the build is incomplete.
save("build", {
  at: new Date().toISOString(),
  root,
  project,
  node: process.execPath,
  nodeVersion: process.version,
  runtimeSha256: hash(resolve(root, "dist/mcp/runtime.js")),
  browserSha256: hash(resolve(root, "dist/observation/snapshot-browser.js")),
  package: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")),
  launchConfig: readFileSync(resolve(project, ".pumarejo.json"), "utf8"),
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(root, "dist/cli/index.js"), "mcp", "--project", project],
  cwd: root,
  env: Object.fromEntries(
    Object.entries(process.env).filter(
      ([, value]) => typeof value === "string",
    ),
  ),
  stderr: "pipe",
});
let cancellationSent = false;
const wireMessages = [];
const send = transport.send.bind(transport);
transport.send = async (message, options) => {
  wireMessages.push({ at: new Date().toISOString(), message });
  if (message.method === "notifications/cancelled") cancellationSent = true;
  appendFileSync(
    resolve(output, "client-wire.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), message }) + "\n",
  );
  return await send(message, options);
};
const client = new Client({
  name: "pumarejo-cancellation-acceptance",
  version: "1.0.0",
});
let sequence = 0;
const call = async (name, args = {}, timeout = 65000) => {
  const label = `${String(++sequence).padStart(3, "0")}-${name}`;
  const startedAt = new Date().toISOString();
  try {
    // Third argument is SDK request options; timeout sends notifications/cancelled.
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout,
    });
    save(label, {
      startedAt,
      endedAt: new Date().toISOString(),
      timeout,
      args,
      result,
    });
    assert.notEqual(result.isError, true, `${name} returned an MCP tool error`);
    return result.structuredContent;
  } catch (error) {
    save(`${label}-error`, {
      startedAt,
      endedAt: new Date().toISOString(),
      timeout,
      args,
      error,
    });
    throw error;
  }
};
let connected = false;
let launchAttempted = false;
let failure;
let ownedProcesses = [];
const processInventory = () => {
  const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{n='CreatedUtc';e={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress"],
  { encoding: "utf8", windowsHide: true });
  return JSON.parse(raw || "[]");
};
const rememberOwned = (rootPid) => {
  const inventory = processInventory();
  const ids = new Set([rootPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const p of inventory) if (ids.has(p.ParentProcessId) && !ids.has(p.ProcessId)) {
      ids.add(p.ProcessId); changed = true;
    }
  }
  const current = inventory.filter(p => ids.has(p.ProcessId));
  assert.ok(current.some(p => p.ProcessId === rootPid), "owned root missing from OS inventory");
  for (const p of current) if (!ownedProcesses.some(old => old.ProcessId === p.ProcessId && old.CreatedUtc === p.CreatedUtc)) ownedProcesses.push(p);
  save("owned-processes", ownedProcesses);
  return current;
};
const sameProcesses = (before, after) => {
  for (const p of before) assert.ok(after.some(q => q.ProcessId === p.ProcessId && q.CreatedUtc === p.CreatedUtc), `process identity changed: ${p.Name} ${p.ProcessId}`);
};
// Native minimization is acceptance setup/fallback. Restore itself uses the public SDK.
const nativeWindow = (pid, minimize = false) => {
  assert.ok(Number.isInteger(pid) && pid > 0);
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public struct WindowRect { public int Left,Top,Right,Bottom; } public class WindowProbe { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out WindowRect r); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int n); }'; $p=Get-Process -Id ${pid}; $h=$p.MainWindowHandle; if($h -eq 0){throw 'No owned window'}; ${minimize ? "[void][WindowProbe]::ShowWindowAsync($h,6); Start-Sleep -Milliseconds 200;" : ""} $r=New-Object WindowRect; if(-not [WindowProbe]::GetWindowRect($h,[ref]$r)){throw 'No native geometry'}; @{pid=$p.Id;handle=$h.ToInt64();width=($r.Right-$r.Left);height=($r.Bottom-$r.Top);minimized=[WindowProbe]::IsIconic($h);maximized=[WindowProbe]::IsZoomed($h)} | ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true }));
};
const controllerReceipt = async (prompt) => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try { return JSON.parse(await terminal.question(prompt + "\nJSON> ", { signal: AbortSignal.timeout(120000) })); }
  finally { terminal.close(); }
};
const timeoutOnce = async (name, args) => {
  const offset = wireMessages.length;
  let timedOut = false;
  try { await call(name, args, 100); }
  catch (error) { if (error.code !== -32001) throw error; timedOut = true; }
  const messages = wireMessages.slice(offset);
  const requests = messages.filter(e => e.message.method === "tools/call" && e.message.params?.name === name);
  assert.equal(requests.length, 1, "client must not replay an uncertain request");
  assert.ok(timedOut && messages.some(e => e.message.method === "notifications/cancelled" && e.message.params.requestId === requests[0].message.id), "exact request timeout/cancellation was not induced");
  return { requestId: requests[0].message.id, startedAt: requests[0].at, timedOut };
};
const taskEvidence = (setup) => {
  const db = new DatabaseSync(resolve(setup.journalPath), { readOnly: true });
  let session, journalProgress;
  try {
    session = db.prepare("SELECT id,provider_session_id,status,ended_at_ms FROM agent_sessions WHERE id = ?").get(setup.tintoSessionId);
    journalProgress = db.prepare("SELECT id,timestamp_ms FROM agent_events WHERE session_id = ? AND kind IN ('agent_message','agent_progress') AND instr(payload_json, ?) > 0 ORDER BY seq").all(setup.tintoSessionId, 'TINTO_ACCEPT_');
  }
  finally { db.close(); }
  assert.equal(session?.provider_session_id, setup.providerThreadId);
  assert.equal(session.ended_at_ms, null, "Tinto session was archived or exited");
  const bytes = readFileSync(resolve(setup.providerRolloutPath));
  const lines = bytes.toString("utf8").split("\n");
  let providerThreadId, turnId, startedAt, completedAt, finalText = "";
  const progress = new Map();
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let row;
    try { row = JSON.parse(lines[index]); }
    catch (error) { if (index === lines.length - 1) break; throw error; }
    const p = row.payload ?? {};
    if (row.type === "session_meta") providerThreadId = p.id ?? p.session_id;
    if (row.type === "event_msg" && p.type === "task_started") {
      turnId = p.turn_id;
      if (turnId === setup.providerTurnId) startedAt = row.timestamp;
    }
    if (turnId !== setup.providerTurnId) continue;
    const text = row.type === "response_item" && p.type === "message" && p.role === "assistant"
      ? (p.content ?? []).map(c => c.text ?? "").join("\n")
      : row.type === "event_msg" && p.type === "agent_message" ? p.message ?? "" : "";
    for (let n = 1; n <= 6; n++) if (text.includes(`TINTO_ACCEPT_${n} sha256=${setup.expectedSha256}`)) progress.set(n, row.timestamp);
    if (row.type === "event_msg" && p.type === "task_complete" && p.turn_id === setup.providerTurnId) {
      completedAt = row.timestamp; finalText = p.last_agent_message ?? "";
    }
  }
  assert.equal(providerThreadId, setup.providerThreadId);
  assert.ok(startedAt, "exact provider task_started event absent; copied history is not dispatch proof");
  return { session, journalProgress, providerThreadId, providerTurnId: setup.providerTurnId, startedAt, completedAt,
    progress: [...progress.keys()].sort(), progressAt: Object.fromEntries(progress), completionMatches: finalText.includes(`TINTO_ACCEPT_DONE count=6 sha256=${setup.expectedSha256}`),
    rolloutBytes: bytes.length, rolloutSha256: createHash("sha256").update(bytes).digest("hex") };
};
const dailyAcceptance = async (before, diagnosticsBefore) => {
  assert.ok(JSON.parse(readFileSync(resolve(project, ".pumarejo.json"), "utf8")).launch.args.includes("--no-watch"));
  const processes = rememberOwned(before.ownedPid);
  const apps = processes.filter(p => p.Name.toLowerCase() === "tinto.exe");
  assert.equal(apps.length, 1);
  const identity = apps[0];
  save("restore-native-setup", { route: "native-setup-fallback", window: nativeWindow(identity.ProcessId, true) });
  assert.equal(nativeWindow(identity.ProcessId).minimized, true);
  const restored = await call("tauri_window", { action: "restore", settleMs: 0, snapshotAfter: false });
  const window = nativeWindow(identity.ProcessId);
  assert.equal(window.minimized, false); assert.equal(window.maximized, false);
  assert.ok(window.width > 0 && window.height > 0, "native restore requires usable geometry");
  sameProcesses([identity], rememberOwned(before.ownedPid));
  save("public-restore", { passed: true, restored, window, setupRoute: "native-setup-fallback" });
  await call("tauri_screenshot");
  await call("tauri_snapshot", { maxDepth: 4, maxNodes: 64 });
  const focus = await controllerReceipt('Make a harmless search/filter textbox visible (never an Agent composer or command field). The SDK will focus it. Return {"harmlessEnterConfirmed":true,"controlName":"exact accessible name","setupRoute":"pumarejo or native-fallback"}.');
  assert.equal(focus.harmlessEnterConfirmed, true);
  assert.ok(typeof focus.controlName === "string" && focus.controlName.length > 0);
  assert.ok(!/mensaje|message|command|comando|terminal/i.test(focus.controlName));
  const snapshot = await call("tauri_snapshot", { roles: ["textbox"], maxDepth: 50, maxNodes: 64 });
  const targets = snapshot.nodes.filter(n => n.enabled && n.visible && n.name === focus.controlName);
  assert.equal(targets.length, 1, "harmless textbox must be unique");
  await call("tauri_click", { ref: targets[0].ref, settleMs: 0, snapshotAfter: false });
  const focused = await call("tauri_snapshot", { roles: ["textbox"], maxDepth: 50, maxNodes: 64 });
  assert.equal(focused.nodes.filter(n => n.focused && n.enabled && n.visible && n.name === focus.controlName).length, 1, "harmless focus must be observed, not assumed");
  save("enter-focus-setup", focus);
  const cancelledEnter = await timeoutOnce("tauri_press_key", { key: "ENTER", settleMs: 2000, snapshotAfter: false });
  const afterEnter = await call("tauri_status");
  assert.equal(afterEnter.state, "ready"); assert.equal(afterEnter.ownedPid, before.ownedPid);
  assert.deepEqual(afterEnter.lastCancellation, { action: "pressKey", outcome: "uncertain" });
  const enterDiagnostics = await call("tauri_diagnostics", { maxRecords: 128 });
  assert.equal(enterDiagnostics.sessionId, diagnosticsBefore.sessionId);
  await call("tauri_snapshot", { maxDepth: 4, maxNodes: 64 });
  save("public-enter-cancellation", { passed: true, cancelledEnter, afterEnter, enterDiagnostics,
    limitation: "One SDK ENTER request, no client replay. Native dispatch attribution still requires the matching provider receipt." });
  const setup = await controllerReceipt('Controller: through Tinto, start one bounded read-only task: read the same package.json SHA-256 six times, emit TINTO_ACCEPT_N sha256=HASH (N=1..6), spaced about five seconds apart, then TINTO_ACCEPT_DONE count=6 sha256=HASH. No edits/Agents. Once two progress messages exist, return exact IDs and accessible evidence paths: {"tintoSessionId":"...","providerThreadId":"...","providerTurnId":"...","providerPid":123,"providerCreatedUtc":"exact OS creation time","journalPath":"...","providerRolloutPath":"...","expectedSha256":"...","setupRoute":"pumarejo or native-fallback"}. Native submission is fallback, never Pum task-submission proof.');
  assert.match(setup.expectedSha256, /^[a-f0-9]{64}$/);
  save("task-setup", setup);
  const taskBefore = taskEvidence(setup);
  assert.ok(taskBefore.progress.length >= 2 && taskBefore.progress.length < 6 && !taskBefore.completedAt, "task must be active with two progress messages");
  assert.ok(taskBefore.journalProgress.length > 0, "current Tinto session must record task progress");
  const currentOwned = rememberOwned(before.ownedPid);
  const providerIdentity = currentOwned.find(p => p.ProcessId === setup.providerPid && p.CreatedUtc === setup.providerCreatedUtc);
  assert.ok(providerIdentity, "exact owned Windows provider PID+creation required; WSL Linux provider identity is unsupported here");
  const taskProcesses = [identity, providerIdentity];
  const cancelledSnapshot = await timeoutOnce("tauri_snapshot", { maxDepth: 100, maxNodes: 64 });
  const deadline = Date.now() + 120000;
  let taskAfter;
  do {
    taskAfter = taskEvidence(setup);
    if (taskAfter.completedAt) break;
    await new Promise(done => setTimeout(done, 1000));
  } while (Date.now() < deadline);
  save("active-task-continuity", { taskBefore, taskAfter, cancelledSnapshot, setupRoute: setup.setupRoute });
  assert.ok(taskAfter.completedAt && taskAfter.completionMatches, "exact provider turn completion absent");
  assert.equal(taskAfter.startedAt, taskBefore.startedAt);
  assert.deepEqual(taskAfter.progress, [1, 2, 3, 4, 5, 6]);
  assert.ok(taskAfter.progress.some(n => !taskBefore.progress.includes(n) && Date.parse(taskAfter.progressAt[n]) > Date.parse(cancelledSnapshot.startedAt)), "later progress from the same provider turn is required");
  assert.ok(taskAfter.journalProgress.some(e => e.timestamp_ms > Date.parse(cancelledSnapshot.startedAt)), "later task progress must also reach the same Tinto journal session");
  assert.equal(wireMessages.filter(e => e.message.method === "tools/call" && e.message.params?.name === "tauri_press_key").length, 1, "ENTER must never be replayed later");
  assert.ok(Date.parse(taskAfter.completedAt) > Date.parse(cancelledSnapshot.startedAt));
  const after = await call("tauri_status");
  assert.equal(after.state, "ready"); assert.equal(after.ownedPid, before.ownedPid);
  assert.equal((await call("tauri_diagnostics", { maxRecords: 128 })).sessionId, diagnosticsBefore.sessionId);
  sameProcesses(taskProcesses, rememberOwned(before.ownedPid));
  await call("tauri_snapshot", { maxDepth: 4, maxNodes: 64 });
  save("daily-use-checks", { passed: true, identities: setup, limitation: "Native setup/submission is fallback. WSL Linux descendant cleanup and active provider-dispatch attribution need separate receipts; Windows PID+creation cleanup follows explicit close." });
};
try {
  await client.connect(transport);
  connected = true;
  transport.stderr?.on("data", (chunk) =>
    appendFileSync(resolve(output, "server-stderr.log"), chunk),
  );
  assert.equal((await call("tauri_status")).state, "idle");
  launchAttempted = true;
  await call("tauri_launch", { mode: "visible", waitMs: 30000 });
  const deadline = Date.now() + 120000;
  let before;
  do {
    before = await call("tauri_status");
    if (before.state !== "launching") break;
    await new Promise((done) => setTimeout(done, 500));
  } while (Date.now() < deadline);
  assert.equal(before.state, "ready");
  assert.ok(Number.isInteger(before.ownedPid) && before.ownedPid > 0);
  rememberOwned(before.ownedPid);
  const diagnosticsBefore = await call("tauri_diagnostics", {
    maxRecords: 128,
  });
  if (dailyUse) await dailyAcceptance(before, diagnosticsBefore);
  let timedOut = false;
  try {
    await call(
      "tauri_snapshot",
      { maxDepth: 100, maxNodes: 64, maxTextLength: 2000, roles: ["status"] },
      100,
    );
  } catch (error) {
    if (error.code !== -32001) throw error;
    timedOut = true;
  }
  const after = await call("tauri_status");
  const diagnosticsAfter = await call("tauri_diagnostics", { maxRecords: 128 });
  const fresh = await call("tauri_snapshot", {
    maxDepth: 4,
    maxNodes: 64,
    maxTextLength: 2000,
  });
  const afterFresh = await call("tauri_status");
  save("continuity", {
    timedOut,
    cancellationSent,
    before,
    after,
    afterFresh,
    diagnosticsBefore,
    diagnosticsAfter,
    fresh,
  });
  assert.ok(
    timedOut && cancellationSent,
    "Timeout/cancellation not induced; do not claim acceptance",
  );
  assert.equal(after.state, "ready");
  assert.equal(after.ownedPid, before.ownedPid);
  assert.equal(afterFresh.state, "ready");
  assert.equal(afterFresh.ownedPid, before.ownedPid);
  assert.ok(diagnosticsBefore.sessionId);
  assert.equal(diagnosticsAfter.sessionId, diagnosticsBefore.sessionId);
  assert.ok(Number.isInteger(fresh.generation));
  save("protocol-checks", {
    passed: true,
    manualReviewRequired:
      "Confirm cancellation reached an active observation, actual Tinto/provider process identity, and same Agent session/thread task completion without archival/resume. Public runtime readiness alone does not prove these.",
  });
} catch (error) {
  failure = error;
  save("acceptance-error", error);
} finally {
  // Explicit cleanup is authorized only for this separate disposable session.
  if (connected && launchAttempted) {
    try {
      await call("tauri_close");
      const idle = await call("tauri_status");
      assert.equal(idle.state, "idle");
      assert.equal(idle.ownedPid, undefined);
      const deadline = Date.now() + 10000;
      let remaining;
      do {
        const inventory = processInventory();
        remaining = ownedProcesses.filter(p => inventory.some(q => p.ProcessId === q.ProcessId && p.CreatedUtc === q.CreatedUtc));
        if (!remaining.length) break;
        await new Promise(done => setTimeout(done, 500));
      } while (Date.now() < deadline);
      save("owned-process-cleanup", { passed: remaining.length === 0, remaining, ownedProcesses,
        scope: "Observed Windows-owned descendants by PID and creation time; WSL Linux processes are not proven by this check." });
      assert.equal(remaining.length, 0, "owned Windows process identities survived explicit close");
      save("explicit-close", {
        passed: true,
        idle,
        manualReviewRequired: "Verify resources outside the captured Windows process tree, including WSL Linux processes when used.",
      });
    } catch (error) {
      failure ??= error;
      save("close-error", error);
    }
  }
  await client.close().catch((error) => {
    failure ??= error;
    save("transport-close-error", error);
  });
  process.exitCode = failure ? 1 : 0;
  console.log(`Acceptance evidence: ${output}; exit ${process.exitCode}`);
}
