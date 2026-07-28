import { removeIntegration } from "../installer/remove.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export async function runRemoveCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  const result = await removeIntegration(invocation.project, {
    dryRun: invocation.dryRun,
  });
  channels.stdout(`${JSON.stringify(result)}\n`);
}
