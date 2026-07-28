import { readFile } from "node:fs/promises";

let cachedScript: Promise<string> | undefined;
let cachedIdentityScript: Promise<string> | undefined;
const SCRIPT_SUFFIX =
  '\nif(TauriAgentSnapshot.SNAPSHOT_SCRIPT_VERSION!==1){throw new Error("snapshot script version mismatch");}return TauriAgentSnapshot.collectSnapshot(arguments[0]);';
const IDENTITY_SCRIPT_SUFFIX =
  '\nif(TauriAgentSnapshot.SNAPSHOT_SCRIPT_VERSION!==1){throw new Error("snapshot script version mismatch");}return TauriAgentSnapshot.collectIdentity(arguments[0]);';
const MAX_INJECTED_SCRIPT_BYTES = 1024 * 1024;

async function readBundle(): Promise<string> {
  const adjacent = new URL("./snapshot-browser.js", import.meta.url);
  const sourceTreeBuild = new URL(
    "../../dist/observation/snapshot-browser.js",
    import.meta.url,
  );
  let contents: Buffer;
  try {
    contents = await readFile(adjacent);
  } catch {
    contents = await readFile(sourceTreeBuild);
  }
  if (
    contents.byteLength + Buffer.byteLength(SCRIPT_SUFFIX) >
    MAX_INJECTED_SCRIPT_BYTES
  ) {
    throw new Error("snapshot browser bundle exceeds the fixed size limit");
  }
  return contents.toString("utf8");
}

export function loadSnapshotScript(): Promise<string> {
  cachedScript ??= readBundle().then((bundle) => `${bundle}${SCRIPT_SUFFIX}`);
  return cachedScript;
}

export function loadIdentityScript(): Promise<string> {
  cachedIdentityScript ??= readBundle().then((bundle) => {
    if (
      Buffer.byteLength(bundle) + Buffer.byteLength(IDENTITY_SCRIPT_SUFFIX) >
      MAX_INJECTED_SCRIPT_BYTES
    ) {
      throw new Error("identity browser bundle exceeds the fixed size limit");
    }
    return `${bundle}${IDENTITY_SCRIPT_SUFFIX}`;
  });
  return cachedIdentityScript;
}
