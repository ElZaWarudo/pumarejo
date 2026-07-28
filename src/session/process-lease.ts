import type { ProcessAdapter, ProcessIdentity } from "../platform/types.js";

export interface ProcessLease extends ProcessIdentity {
  readonly providerPid: number;
  readonly providerPort: number;
  readonly proxyPort: number;
}

export function processIdentityMatches(
  lease: ProcessIdentity,
  observed: ProcessIdentity | undefined,
): boolean {
  return (
    observed !== undefined &&
    observed.pid === lease.pid &&
    observed.startedAt === lease.startedAt &&
    observed.commandHash === lease.commandHash &&
    observed.sessionNonce === lease.sessionNonce
  );
}

export async function terminateProcessLease(
  lease: ProcessLease,
  adapter: ProcessAdapter,
): Promise<"terminated" | "already-exited"> {
  const observed = await adapter.inspect(lease.pid);
  if (!processIdentityMatches(lease, observed)) {
    return "already-exited";
  }
  await adapter.terminateTree(lease.pid);
  return "terminated";
}
