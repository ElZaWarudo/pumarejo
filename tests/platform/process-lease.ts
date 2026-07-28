import { createHash, randomBytes } from "node:crypto";

export type ProcessIdentity = {
  pid: number;
  startedAt: number;
  commandHash: string;
};

export type ProcessLease = ProcessIdentity & {
  providerPid: number;
  providerPort: number;
  proxyPort: number;
  nonce: string;
};

export function commandHash(command: string, args: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([command, ...args]))
    .digest("hex");
}

export function createProcessLease(
  identity: ProcessIdentity,
  ports: { providerPid?: number; providerPort: number; proxyPort: number },
  nonce = randomBytes(32).toString("hex"),
): ProcessLease {
  if (nonce.length < 32)
    throw new Error("nonce must be at least 32 characters");
  return {
    ...identity,
    providerPid: ports.providerPid ?? identity.pid,
    ...ports,
    nonce,
  };
}

export function leaseMatches(
  lease: ProcessLease,
  observed: ProcessIdentity | undefined,
): boolean {
  return (
    observed !== undefined &&
    lease.pid === observed.pid &&
    lease.startedAt === observed.startedAt &&
    lease.commandHash === observed.commandHash
  );
}

export async function terminateOwnedProcess(
  lease: ProcessLease,
  inspect: (pid: number) => Promise<ProcessIdentity | undefined>,
  terminate: (pid: number) => Promise<void>,
): Promise<boolean> {
  if (!leaseMatches(lease, await inspect(lease.pid))) return false;
  await terminate(lease.pid);
  return true;
}
