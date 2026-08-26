import { createHash } from "node:crypto";

import type { LoopbackFamily } from "./loopback.js";

export interface ProcessIdentity {
  readonly pid: number;
  readonly startedAt: number;
  readonly commandHash: string;
  readonly sessionNonce: string;
  /** Internal host identity hash used for crash-resumable reattachment. */
  readonly systemHash?: string;
}

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
  readonly onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
}

export interface SpawnedApplication extends ProcessIdentity {
  /** Internal launch-bound custody, present when the native platform created
   * and assigned the boundary before resuming the target. */
  readonly custodyAttachment?: ProcessCustodyAttachment;
  waitUntilProviderReady(
    port: number,
    signal?: AbortSignal,
    family?: LoopbackFamily,
  ): Promise<void>;
}

/**
 * Internal process-custody facts. These values never cross the MCP boundary;
 * they are retained only long enough to revalidate a destructive operation.
 */
export type ProcessCustodyMechanism =
  | "windows_job_object"
  | "windows_validated_tree"
  | "posix_process_group";

export interface ProcessCustodyCapability {
  readonly mechanism: ProcessCustodyMechanism;
  readonly state: "supported" | "unavailable";
  readonly code: string;
  readonly killOnClose: boolean;
}

export interface ProcessCustodyAttachment {
  readonly mechanism: ProcessCustodyMechanism;
  readonly opaqueHandle?: unknown;
  readonly groupId?: number;
  readonly sessionId?: number;
}

export interface ProcessCustodyInspection {
  readonly identity: ProcessIdentity;
  readonly mechanism: ProcessCustodyMechanism;
  readonly groupId?: number;
  readonly sessionId?: number;
  /** True only when the adapter has enumerated the complete owned tree. */
  readonly descendantsComplete: boolean;
}

export interface ProcessCustodyTermination {
  readonly state: "terminated" | "already-exited" | "retryable";
  readonly escalated: boolean;
}

export interface ProcessCustodyAdapter {
  capability(): Promise<ProcessCustodyCapability>;
  attach(identity: ProcessIdentity): Promise<ProcessCustodyAttachment>;
  inspect(
    identity: ProcessIdentity,
    attachment: ProcessCustodyAttachment,
  ): Promise<ProcessCustodyInspection | undefined>;
  terminate(
    identity: ProcessIdentity,
    attachment: ProcessCustodyAttachment,
    options?: {
      readonly graceMs?: number;
      readonly pollMs?: number;
    },
  ): Promise<ProcessCustodyTermination>;
  release(attachment: ProcessCustodyAttachment): Promise<void>;
}

export interface ProcessAdapter {
  spawn(request: SpawnRequest): Promise<SpawnedApplication>;
  inspect(pid: number): Promise<ProcessIdentity | undefined>;
  terminateTree(pid: number): Promise<void>;
  providerOwner(
    rootPid: number,
    providerPort: number,
    family?: LoopbackFamily,
    signal?: AbortSignal,
  ): Promise<number | undefined>;
  /** Optional internal custody boundary; no public MCP operation depends on it. */
  readonly custody?: ProcessCustodyAdapter;
}

export function launchCommandHash(
  command: string,
  args: readonly string[],
): string {
  return createHash("sha256")
    .update(JSON.stringify([command, ...args]))
    .digest("hex");
}
