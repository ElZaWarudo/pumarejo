import {
  runArtifactCleanup,
  type ArtifactCleanupResult,
} from "../artifacts/maintenance.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export function formatArtifactCleanupResult(
  result: ArtifactCleanupResult,
): string {
  return `[${result.decision.toUpperCase()}] artifact cleanup: ${
    result.reason ?? "validated"
  }. Files=${result.summary.files}, directories=${result.summary.directories}, bytes=${
    result.summary.bytes
  }. Attestation: ${result.attestationPath}.\n`;
}

export async function runCleanupArtifactsCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  if (
    invocation.manifestPath === undefined ||
    invocation.expectedWorkflowId === undefined
  ) {
    throw new Error("Artifact cleanup invocation is incomplete.");
  }
  const result = await runArtifactCleanup({
    projectRoot: invocation.project,
    manifestPath: invocation.manifestPath,
    expectedWorkflowId: invocation.expectedWorkflowId,
    ...(invocation.expectedSessionId === undefined
      ? {}
      : { expectedSessionId: invocation.expectedSessionId }),
    execute: invocation.execute === true,
  });
  channels.stdout(
    invocation.json
      ? `${JSON.stringify(result)}\n`
      : formatArtifactCleanupResult(result),
  );
}
