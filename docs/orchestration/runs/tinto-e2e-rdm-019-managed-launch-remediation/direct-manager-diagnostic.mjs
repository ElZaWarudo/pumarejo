import { loadProjectConfig } from "../../../../dist/config/load.js";
import { readBuildDevUrl } from "../../../../dist/platform/mode-config.js";
import { prepareWindowsLaunch } from "../../../../dist/platform/windows/launch.js";
import { createWindowsProcessAdapter } from "../../../../dist/platform/windows/process.js";
import { SessionManager } from "../../../../dist/session/manager.js";

const project = "C:/Users/User/AppData/Local/Temp/pumarejo-tinto-rdm019-clean";
const loaded = await loadProjectConfig(project);
const devUrl = await readBuildDevUrl({ projectRoot: loaded.projectRoot, platform: "windows" });
const manager = new SessionManager({
  process: createWindowsProcessAdapter(),
  leaseRoot: `${loaded.projectRoot}/.pumarejo/sessions`,
  prepareLaunch: (options) =>
    prepareWindowsLaunch(
      loaded,
      options.mode,
      process.env,
      undefined,
      options.loopbackFamily,
    ),
});

try {
  const ready = await manager.launch({
    mode: "visible",
    platform: "windows",
    window: loaded.config.window,
    ...(devUrl === undefined ? {} : { devUrl }),
    ...(devUrl?.ok === true ? { loopbackFamily: devUrl.value.family } : {}),
    onPhase: (phase) => process.stdout.write(`${JSON.stringify({ phase })}\n`),
    onOutput: (stream, chunk) =>
      process.stdout.write(
        `${JSON.stringify({ stream, chunk: String(chunk).replace(/[A-Za-z]:\\[^\r\n]*/gu, "<windows-path>").slice(0, 512) })}\n`,
      ),
  });
  process.stdout.write(`${JSON.stringify({ ready: true, state: ready.state })}\n`);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ error: error?.code ?? error?.name, snapshot: manager.snapshot })}\n`,
  );
} finally {
  await manager.close().catch(() => undefined);
}
