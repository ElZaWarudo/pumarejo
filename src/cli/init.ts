import { initializeProject } from "../installer/plan.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export async function runInitCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  const result = await initializeProject(invocation.project, {
    dryRun: invocation.dryRun,
  });
  channels.stdout(`${JSON.stringify(result)}\n`);
}
