import { describe, expect, it } from "vitest";

import {
  resolvedLaunchEnvironment,
  resolvedLaunchEnvironmentResult,
  sanitizedLaunchEnvironment,
} from "../../src/platform/launch-environment.js";

describe("launch environment compatibility", () => {
  it("preserves the existing allowlist and precedence", () => {
    const environment = resolvedLaunchEnvironment(
      "windows",
      {
        PATH: "C:\\host",
        CARGO_HOME: "C:\\host-cargo",
        AWS_SECRET_ACCESS_KEY: "no",
      },
      {
        command: "pnpm",
        args: ["tauri", "dev", "--config", "{tauriConfig}"],
        pathPrepend: ["C:\\tools"],
        environment: { CARGO_HOME: "C:\\configured-cargo" },
      },
      { CARGO_HOME: "C:\\internal-cargo" },
    );
    expect(environment).toMatchObject({
      PATH: "C:\\tools;C:\\host",
      CARGO_HOME: "C:\\internal-cargo",
    });
    expect(environment).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
  });

  it("preserves Linux display and toolchain variables only", () => {
    expect(
      sanitizedLaunchEnvironment("linux", {
        PATH: "/tools",
        DISPLAY: ":0",
        HOME: "/home/dev",
        OPENAI_API_KEY: "secret",
      }),
    ).toEqual({ PATH: "/tools", DISPLAY: ":0", HOME: "/home/dev" });
  });

  it("reconstructs the Windows minimum through the additive result API", () => {
    const profile = {
      command: "pnpm",
      args: ["tauri", "dev", "--config", "{tauriConfig}"],
    };
    const result = resolvedLaunchEnvironmentResult(
      "windows",
      {},
      profile,
      {},
      {
        machine: {
          SystemRoot: "C:\\Windows",
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
          PATHEXT: ".EXE;.CMD",
          Path: "C:\\Windows\\System32",
          TEMP: "C:\\Temp",
          TMP: "C:\\Temp",
        },
        user: { USERPROFILE: "C:\\Users\\dev" },
      },
    );

    expect(result.status).toBe("complete");
    expect(result.missingRequiredKeys).toEqual([]);
    expect(result.environment.SystemRoot).toBe("C:\\Windows");
  });
});
