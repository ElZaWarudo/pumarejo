import {
  runLeaseRecovery,
  type LeaseRecoveryResult,
} from "../session/lease-recovery.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export function formatLeaseRecoveryResult(result: LeaseRecoveryResult): string {
  const heading = result.dryRun ? "Lease recovery dry-run" : "Lease recovery";
  const items = result.results.map(
    (item) =>
      `[${item.decision.toUpperCase()}] ${item.leaseId}: ${item.reason}${
        item.auditPath === undefined ? "" : ` Audit: ${item.auditPath}.`
      }`,
  );
  return `${heading}: ${result.status}.\n${items.length === 0 ? "No custody leases found." : items.join("\n")}\n`;
}

export async function runRecoverLeasesCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  const result = await runLeaseRecovery({
    projectRoot: invocation.project,
    action:
      invocation.upgradeBinding === true
        ? "upgrade-binding"
        : invocation.bindLegacy === true
          ? "bind-legacy"
          : "recover",
    execute: invocation.execute === true,
  });
  channels.stdout(
    invocation.json
      ? `${JSON.stringify(result)}\n`
      : formatLeaseRecoveryResult(result),
  );
}
