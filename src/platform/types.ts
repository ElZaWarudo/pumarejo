import { createHash } from "node:crypto";

export interface ProcessIdentity {
  readonly pid: number;
  readonly startedAt: number;
  readonly commandHash: string;
  readonly sessionNonce: string;
}

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
}

export interface SpawnedApplication extends ProcessIdentity {
  waitUntilProviderReady(port: number, signal?: AbortSignal): Promise<void>;
}

export interface ProcessAdapter {
  spawn(request: SpawnRequest): Promise<SpawnedApplication>;
  inspect(pid: number): Promise<ProcessIdentity | undefined>;
  terminateTree(pid: number): Promise<void>;
  providerOwner(
    rootPid: number,
    providerPort: number,
  ): Promise<number | undefined>;
}

export function launchCommandHash(
  command: string,
  args: readonly string[],
): string {
  return createHash("sha256")
    .update(JSON.stringify([command, ...args]))
    .digest("hex");
}
