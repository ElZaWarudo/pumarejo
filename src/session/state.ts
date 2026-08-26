import type { WebDriverClient } from "../webdriver/client.js";
import type {
  InitialWindowEvidence,
  WindowCapabilities,
} from "../webdriver/native-control.js";
export type {
  InitialWindowEvidence,
  WindowCapabilities,
} from "../webdriver/native-control.js";
import type { CleanupLabel } from "./cleanup.js";

export type SessionState =
  | "idle"
  | "starting"
  | "ready"
  | "cleaning"
  | "failed";

export type RuntimeMode = "visible" | "background";

export type LaunchPhase =
  | "resolving_command"
  | "preparing_runtime"
  | "starting_process"
  | "waiting_provider"
  | "starting_proxy"
  | "creating_session"
  | "selecting_window"
  | "capturing_first_snapshot";

export interface SessionSnapshot {
  readonly state: SessionState;
  readonly cleanupPending?: readonly CleanupLabel[];
  readonly mode?: RuntimeMode;
  readonly platform?: "windows" | "linux";
  readonly window?: string;
  readonly webdriverPort?: number;
  readonly ownedPid?: number;
  readonly windowCapabilities?: WindowCapabilities;
  readonly initialWindow?: InitialWindowEvidence;
}

export interface ReadySession extends SessionSnapshot {
  readonly state: "ready";
  readonly mode: RuntimeMode;
  readonly platform: "windows" | "linux";
  readonly window: string;
  readonly webdriverPort: number;
  readonly webdriver: WebDriverClient;
  readonly windowCapabilities?: WindowCapabilities;
  readonly initialWindow?: InitialWindowEvidence;
}
