import { DiagnosticStore } from "../../../../dist/observability/diagnostics.js";
import { serveMcpOverStdio } from "../../../../dist/mcp/server.js";
import { SessionManager } from "../../../../dist/session/manager.js";

const sanitize = (value) =>
  String(value)
    .replace(/[A-Za-z]:\\[^\r\n]*/gu, "<windows-path>")
    .replace(/\/[A-Za-z0-9_.\-\/]+/gu, "<path>")
    .slice(0, 512);

const originalPhase = DiagnosticStore.prototype.recordPhase;
DiagnosticStore.prototype.recordPhase = function (phase) {
  process.stderr.write(`[phase] ${sanitize(phase)}\n`);
  return originalPhase.call(this, phase);
};

const originalProcess = DiagnosticStore.prototype.recordProcess;
DiagnosticStore.prototype.recordProcess = function (stream, message) {
  process.stderr.write(`[${stream}] ${sanitize(message)}\n`);
  return originalProcess.call(this, stream, message);
};

const originalRecord = DiagnosticStore.prototype.record;
DiagnosticStore.prototype.record = function (kind, value) {
  if (kind === "last_error" && typeof value?.code === "string") {
    process.stderr.write(`[diagnostic-code] ${sanitize(value.code)}\n`);
  }
  return originalRecord.call(this, kind, value);
};

const describeError = (error) => {
  const descriptions = [];
  const pending = [{ error, depth: 0, relation: "root" }];
  while (pending.length > 0 && descriptions.length < 16) {
    const { error: current, depth, relation } = pending.shift();
    if (!current || depth > 5) continue;
    descriptions.push({
      relation,
      name: sanitize(current?.name),
      code: sanitize(current?.code),
      message: sanitize(current?.message),
    });
    if (current?.cause) pending.push({ error: current.cause, depth: depth + 1, relation: "cause" });
    if (Array.isArray(current?.errors)) {
      current.errors.forEach((nested, index) => pending.push({
        error: nested,
        depth: depth + 1,
        relation: `aggregate[${index}]`,
      }));
    }
  }
  return descriptions;
};

const originalLaunch = SessionManager.prototype.launch;
SessionManager.prototype.launch = async function (options) {
  try {
    return await originalLaunch.call(this, options);
  } catch (error) {
    process.stderr.write(`[manager-error] ${JSON.stringify(describeError(error))}\n`);
    throw error;
  }
};

const originalClose = SessionManager.prototype.close;
SessionManager.prototype.close = async function (...args) {
  try {
    return await originalClose.apply(this, args);
  } catch (error) {
    process.stderr.write(`[manager-close-error] ${JSON.stringify(describeError(error))}\n`);
    process.stderr.write(`[manager-close-snapshot] ${JSON.stringify(this.snapshot)}\n`);
    throw error;
  }
};

await serveMcpOverStdio(
  "C:/Users/User/AppData/Local/Temp/pumarejo-tinto-rdm019-clean",
);
