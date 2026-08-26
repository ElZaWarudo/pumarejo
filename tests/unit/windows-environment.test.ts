import { describe, expect, it } from "vitest";

import {
  buildChildEnvironment,
  compareLaunchEnvironments,
} from "../../src/platform/launch-environment.js";
import {
  expandWindowsPortableEnvironment,
  WINDOWS_MINIMUM_ENVIRONMENT_KEYS,
} from "../../src/platform/windows/environment.js";

describe("portable Windows child environment", () => {
  it("merges proven OS, host, profile, path, and internal sources", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      osSource: {
        machine: {
          SystemRoot: "C:\\Windows",
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
          PATHEXT: ".EXE;.CMD",
          TEMP: "C:\\Temp",
          TMP: "C:\\Temp",
        },
        user: { USERPROFILE: "C:\\Users\\dev", Path: "C:\\machine" },
      },
      host: { Path: "C:\\host", OPENAI_API_KEY: "must-not-pass" },
      profile: {
        pathPrepend: ["%TEMP%\\tools"],
        environment: { CARGO_HOME: "C:\\cargo" },
      },
      internalOverlay: { PUMAREJO_PROVIDER_READY_TIMEOUT_MS: "1000" },
    });

    expect(result.environment.Path ?? result.environment.PATH).toContain(
      "C:\\host",
    );
    expect(result.environment.CARGO_HOME).toBe("C:\\cargo");
    expect(result.environment.OPENAI_API_KEY).toBeUndefined();
    expect(result.missingRequiredKeys).toEqual([]);
    expect(
      result.comparison.categories.map((entry) => entry.category),
    ).toContain("source-reconstructed");
  });

  it("rejects unresolved, cyclic, NUL, oversized, and secret inputs without mutation", () => {
    const source = {
      Root: "C:\\tools",
      Good: "%Root%\\bin",
      Leaked: "%OPENAI_API_KEY%",
      Missing: "%Unknown%",
      A: "%B%",
      B: "%A%",
      PATH: "%PATH%",
      Nul: "ok\0bad",
      Oversized: "1234567890123",
      ExpandedOversized: "%Root%%Root%",
      OPENAI_API_KEY: "secret",
    };
    const copy = structuredClone(source);
    const result = expandWindowsPortableEnvironment(source, {
      maxPasses: 4,
      maxValueLength: 12,
    });
    expect(source).toEqual(copy);
    expect(result.environment.Good).toBe("C:\\tools\\bin");
    expect(result.environment.Missing).toBeUndefined();
    expect(result.environment.Leaked).toBeUndefined();
    expect(result.environment.OPENAI_API_KEY).toBeUndefined();
    expect(result.rejected.map((entry) => entry.key)).toEqual(
      expect.arrayContaining([
        "Missing",
        "A",
        "PATH",
        "Leaked",
        "Nul",
        "Oversized",
        "ExpandedOversized",
        "OPENAI_API_KEY",
      ]),
    );
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { key: "Oversized", code: "portable-expansion-too-large" },
        {
          key: "ExpandedOversized",
          code: "portable-expansion-too-large",
        },
      ]),
    );
  });

  it("expands and validates the internal overlay in the final pass", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {
        SystemRoot: "C:\\Windows",
        Path: "C:\\Windows\\System32",
        TEMP: "C:\\Temp",
        USERPROFILE: "C:\\Users\\dev",
      },
      internalOverlay: {
        CARGO_HOME: "%USERPROFILE%\\cargo",
        RUSTUP_HOME: "Bearer internal-secret",
        PUMAREJO_PROVIDER_READY_TIMEOUT_MS: "%MISSING_INTERNAL%",
      },
    });

    expect(result.environment.CARGO_HOME).toBe("C:\\Users\\dev\\cargo");
    expect(result.provenance.CARGO_HOME).toEqual({
      source: "portable-expanded",
      expandedFrom: "internal-overlay",
    });
    expect(result.environment.RUSTUP_HOME).toBeUndefined();
    expect(
      result.environment.PUMAREJO_PROVIDER_READY_TIMEOUT_MS,
    ).toBeUndefined();
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { key: "RUSTUP_HOME", code: "environment-value-secret" },
        {
          key: "PUMAREJO_PROVIDER_READY_TIMEOUT_MS",
          code: "portable-expansion-unresolved",
        },
      ]),
    );
  });

  it("rejects a final token-free replacement that exceeds the value bound", () => {
    const result = expandWindowsPortableEnvironment(
      { R: "12345", Final: "%R%X" },
      { maxPasses: 1, maxValueLength: 5 },
    );

    expect(result.environment.R).toBe("12345");
    expect(result.environment.Final).toBeUndefined();
    expect(result.rejected).toContainEqual({
      key: "Final",
      code: "portable-expansion-too-large",
    });
  });

  it("reports an exact incomplete minimum-key result for partial OS sources", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {},
      osSource: { machine: { SystemRoot: "C:\\Windows" }, available: true },
    });

    expect(result.status).toBe("incomplete");
    expect(result.missingRequiredKeys).toEqual([
      "Path",
      "TEMP",
      "TMP",
      "USERPROFILE",
    ]);
  });

  it("reconstructs the fixed minimum from a restricted stdio snapshot", () => {
    const restricted = {
      SystemRoot: "C:\\Windows",
      Path: "C:\\Windows\\System32;C:\\tools",
      TEMP: "C:\\Temp",
      USERPROFILE: "C:\\Users\\dev",
    };

    const result = buildChildEnvironment({
      platform: "windows",
      host: restricted,
      osSource: { values: restricted, available: true },
    });

    expect(result.status).toBe("complete");
    expect(result.environment).toMatchObject({
      SystemRoot: "C:\\Windows",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      TMP: "C:\\Temp",
    });
    expect(result.provenance.ComSpec).toEqual({ source: "safe-default" });
    expect(result.provenance.PATHEXT).toEqual({ source: "safe-default" });
    expect(result.provenance.TMP).toEqual({ source: "safe-default" });
  });

  it("expands proven nested Windows sources before deriving safe defaults", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {
        SystemDrive: "C:",
        SystemRoot: "%SystemDrive%\\Windows",
        Path: "C:\\Windows\\System32",
        TEMP: "%SystemRoot%\\Temp",
        USERPROFILE: "C:\\Users\\dev",
      },
    });

    expect(result.status).toBe("complete");
    expect(result.environment).toMatchObject({
      SystemRoot: "C:\\Windows",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      TEMP: "C:\\Windows\\Temp",
      TMP: "C:\\Windows\\Temp",
    });
    expect(result.provenance.ComSpec).toEqual({ source: "safe-default" });
    expect(result.provenance.TMP).toEqual({ source: "safe-default" });
  });

  it("rejects local minimum defaults for non-local or variable-bearing paths", () => {
    const unsafePaths = [
      "\\\\server\\share\\Windows",
      "\\\\?\\C:\\Windows",
      "\\\\.\\pipe\\Windows",
      "relative\\Windows",
      "C:\\Windows\\..\\Other",
      "C:\\Windows\\\u0001",
      "%SystemDrive%\\Windows",
    ];

    for (const path of unsafePaths) {
      const result = buildChildEnvironment({
        platform: "windows",
        host: {
          SystemRoot: path,
          Path: "C:\\Windows\\System32",
          TEMP: path,
          USERPROFILE: "C:\\Users\\dev",
        },
      });

      expect(result.status).toBe("incomplete");
      expect(result.environment.ComSpec).toBeUndefined();
      expect(result.environment.TMP).toBeUndefined();
    }
  });

  it("fails closed for unsafe minimum sources instead of deriving launch values", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {
        SystemRoot: "%UNRESOLVED%",
        Path: "C:\\Windows\\System32",
        TEMP: "relative-temp",
        USERPROFILE: "C:\\Users\\dev",
      },
      osSource: { values: {}, available: true },
    });

    expect(result.status).toBe("incomplete");
    expect(result.missingRequiredKeys).toEqual([
      "SystemRoot",
      "ComSpec",
      "TMP",
    ]);
    expect(result.environment.ComSpec).toBeUndefined();
    expect(result.environment.TMP).toBeUndefined();
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        { key: "ComSpec", code: "environment-path-unsafe" },
        { key: "TMP", code: "environment-path-unsafe" },
      ]),
    );
  });

  it("rejects conflicting case-insensitive minimum keys", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {
        SystemRoot: "C:\\Windows",
        Path: "C:\\one",
        PATH: "C:\\two",
        TEMP: "C:\\Temp",
        USERPROFILE: "C:\\Users\\dev",
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.missingRequiredKeys).toContain("Path");
    expect(result.rejected).toContainEqual({
      key: "PATH",
      code: "environment-key-conflict",
    });
  });

  it("treats empty and whitespace-only required Windows values as missing", () => {
    const result = buildChildEnvironment({
      platform: "windows",
      host: {
        SystemRoot: " ",
        ComSpec: "",
        PATHEXT: ".EXE",
        Path: "C:\\tools",
        TEMP: "C:\\Temp",
        TMP: "C:\\Temp",
        USERPROFILE: "C:\\Users\\dev",
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.missingRequiredKeys).toEqual(["SystemRoot", "ComSpec"]);
  });

  it("keeps comparison output bounded and value-free", () => {
    const comparison = compareLaunchEnvironments(
      "windows",
      { Path: "C:\\one;C:\\two", TEMP: "C:\\a" },
      { PATH: "C:\\two;C:\\one", TEMP: "C:\\b", SystemRoot: "C:\\Windows" },
    );
    expect(comparison.categories).toEqual(
      expect.arrayContaining([
        { category: "changed", count: 2 },
        { category: "added-to-child", count: 1 },
        { category: "path-order-changed", count: 1 },
      ]),
    );
    expect(JSON.stringify(comparison)).not.toContain("C:\\");
  });

  it("documents the fixed minimum key set", () => {
    expect(WINDOWS_MINIMUM_ENVIRONMENT_KEYS).toEqual(
      expect.arrayContaining(["SystemRoot", "ComSpec", "PATHEXT", "Path"]),
    );
  });
});
