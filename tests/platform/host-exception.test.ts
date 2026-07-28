import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nonstandardHostAccepted } from "./host.js";

const originalFlag = process.env.TAURI_AGENT_ACCEPT_NONSTANDARD_HOST;
const originalId = process.env.TAURI_AGENT_HOST_EXCEPTION_ID;

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.TAURI_AGENT_ACCEPT_NONSTANDARD_HOST;
  } else {
    process.env.TAURI_AGENT_ACCEPT_NONSTANDARD_HOST = originalFlag;
  }
  if (originalId === undefined) {
    delete process.env.TAURI_AGENT_HOST_EXCEPTION_ID;
  } else {
    process.env.TAURI_AGENT_HOST_EXCEPTION_ID = originalId;
  }
});

describe("nonstandard host exception", () => {
  it("accepts only the explicit flag paired with the audited id", () => {
    process.env.TAURI_AGENT_ACCEPT_NONSTANDARD_HOST = "1";
    process.env.TAURI_AGENT_HOST_EXCEPTION_ID = "USER-2026-07-27-WINDOWS-WSL";
    expect(nonstandardHostAccepted()).toBe(true);

    process.env.TAURI_AGENT_HOST_EXCEPTION_ID = "unrecognized";
    expect(nonstandardHostAccepted()).toBe(false);

    delete process.env.TAURI_AGENT_ACCEPT_NONSTANDARD_HOST;
    process.env.TAURI_AGENT_HOST_EXCEPTION_ID = "USER-2026-07-27-WINDOWS-WSL";
    expect(nonstandardHostAccepted()).toBe(false);
  });

  it("fails the executable gate before platform checks for an unknown id", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("tests/platform/gate.mjs"), "windows"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TAURI_AGENT_RUN_PROVIDER: "1",
          TAURI_AGENT_REQUIRE_AUTH_HOST: "1",
          TAURI_AGENT_RUN_CARGO: "1",
          TAURI_AGENT_ACCEPT_NONSTANDARD_HOST: "1",
          TAURI_AGENT_HOST_EXCEPTION_ID: "unrecognized",
        },
      },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "recognized nonstandard-host exception id is required",
    );
  });
});
