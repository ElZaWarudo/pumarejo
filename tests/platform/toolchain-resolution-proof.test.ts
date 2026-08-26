import { posix, win32 } from "node:path";

import { describe, expect, it } from "vitest";

import { projectToolchainEvidence } from "../../src/platform/toolchain-evidence.js";
import {
  resolveToolchain,
  type ToolchainFileSystem,
} from "../../src/platform/toolchain-resolver.js";

describe("cross-platform toolchain proof fixtures", () => {
  it.each(["windows", "linux"] as const)(
    "keeps %s fixture output normalized",
    async (platform) => {
      const api = platform === "windows" ? win32 : posix;
      const directory = platform === "windows" ? "C:\\tool" : "/tool";
      const command = api.join(
        directory,
        platform === "windows" ? "cargo.exe" : "cargo",
      );
      const fileSystem: ToolchainFileSystem = {
        async lstat(candidate) {
          if (candidate !== command) return { kind: "missing" };
          return platform === "windows"
            ? { kind: "reparse-point" }
            : { kind: "regular-file", executable: false };
        },
        async realpath(candidate) {
          return candidate;
        },
        async readFile() {
          return "";
        },
      };
      const resolution = await resolveToolchain("cargo", {
        platform,
        environment: { PATH: directory },
        fileSystem,
        probeRunner: {
          run: async () => {
            throw new Error("unsafe candidate must not be probed");
          },
        },
      });
      const event = projectToolchainEvidence(
        { cargo: resolution },
        { sessionId: `fixture-${platform}` },
      )[0];
      expect(event?.kind).toBe("cargo");
      expect(event?.outcome).toBe("unavailable");
      const expectedRejection =
        platform === "windows" ? "reparse-uncertain" : "not-executable";
      expect(
        event?.candidates.find(
          (candidate) => candidate.rejection === expectedRejection,
        ),
      ).toMatchObject({
        source: "child-path",
        accepted: false,
        rejection: expectedRejection,
      });
      expect(JSON.stringify(event)).not.toMatch(/[A-Z]:\\|\/tool\//u);
    },
  );
});
