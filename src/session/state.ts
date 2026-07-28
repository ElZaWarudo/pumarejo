import type { WebDriverClient } from "../webdriver/client.js";

export type SessionState =
  | "idle"
  | "starting"
  | "ready"
  | "cleaning"
  | "failed";

export type RuntimeMode = "visible" | "background";

export interface SessionSnapshot {
  readonly state: SessionState;
  readonly mode?: RuntimeMode;
  readonly platform?: "windows" | "linux";
  readonly window?: string;
  readonly webdriverPort?: number;
}

export interface ReadySession extends SessionSnapshot {
  readonly state: "ready";
  readonly mode: RuntimeMode;
  readonly platform: "windows" | "linux";
  readonly window: string;
  readonly webdriverPort: number;
  readonly webdriver: WebDriverClient;
}
