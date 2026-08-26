import { describe, expect, it } from "vitest";

import {
  filterDiscoveryEntries,
  shouldExcludeBeforeEnumeration,
  validateExplicitFixture,
} from "../../src/artifacts/discovery.js";

describe("artifact discovery policy", () => {
  it("excludes default and owned roots before enumeration", () => {
    const root = "/workspace/project";
    expect(
      shouldExcludeBeforeEnumeration(`${root}/node_modules`, { root }),
    ).toBe(true);
    expect(
      shouldExcludeBeforeEnumeration(`${root}/src/.git/objects`, { root }),
    ).toBe(true);
    expect(shouldExcludeBeforeEnumeration(`${root}/src/node_modules/pkg`)).toBe(
      true,
    );
    expect(
      shouldExcludeBeforeEnumeration(`${root}/runtime-copy/file`, {
        root,
        ownedRoots: [`${root}/runtime-copy`],
      }),
    ).toBe(true);
    expect(
      shouldExcludeBeforeEnumeration(`${root}/src/components`, { root }),
    ).toBe(false);
    expect(
      filterDiscoveryEntries(
        [
          { path: `${root}/src` },
          { path: `${root}/.pumarejo` },
          { path: `${root}/tests` },
        ],
        { root },
      ).map((entry) => entry.path),
    ).toEqual([`${root}/src`, `${root}/tests`]);
  });

  it("keeps exclusion matching deterministic for the host case policy", () => {
    const root = "/workspace/project";
    expect(
      shouldExcludeBeforeEnumeration(`${root}/NODE_MODULES`, { root }),
    ).toBe(false);
    expect(
      shouldExcludeBeforeEnumeration("C:\\Project\\NODE_MODULES", {
        root: "C:\\Project",
        platform: "win32",
      }),
    ).toBe(true);
  });

  it("allows a validated explicit fixture even when its name is excluded", () => {
    expect(
      validateExplicitFixture({
        requestedPath: "/workspace/project/.pumarejo/fixture.json",
        allowedRoot: "/workspace/project",
        canonicalRoot: "/workspace/project",
        canonicalPath: "/workspace/project/.pumarejo/fixture.json",
        kind: "file",
        isSymbolicLink: false,
        revalidated: true,
      }),
    ).toMatchObject({ accepted: true, kind: "file" });
  });

  it("rejects a canonical root that is outside the configured root", () => {
    expect(
      validateExplicitFixture({
        requestedPath: "/workspace/project/fixture.json",
        allowedRoot: "/workspace/project",
        canonicalRoot: "/workspace/other",
        canonicalPath: "/workspace/other/fixture.json",
        kind: "file",
        isSymbolicLink: false,
        revalidated: true,
      }),
    ).toEqual({ accepted: false, reason: "canonical-escape" });
  });

  it.each([
    [
      "path escape",
      { requestedPath: "/workspace/other/file" },
      "outside-allowed-root",
    ],
    [
      "canonical escape",
      { canonicalPath: "/workspace/other/file" },
      "canonical-escape",
    ],
    ["symlink", { isSymbolicLink: true }, "linked"],
    [
      "race",
      { revalidatedCanonicalPath: "/workspace/project/replaced" },
      "replacement-race",
    ],
    ["not revalidated", { revalidated: false }, "not-revalidated"],
    ["non regular", { kind: "other" }, "not-regular"],
  ] as const)(
    "rejects unsafe explicit fixture: %s",
    (_label, overrides, reason) => {
      const result = validateExplicitFixture({
        requestedPath: "/workspace/project/fixture.json",
        allowedRoot: "/workspace/project",
        canonicalRoot: "/workspace/project",
        canonicalPath: "/workspace/project/fixture.json",
        kind: "file",
        isSymbolicLink: false,
        revalidated: true,
        ...overrides,
      });
      expect(result).toEqual({ accepted: false, reason });
    },
  );

  it("binds the normalized requested path to repeated canonical identity", () => {
    const base = {
      requestedPath: "/workspace/project/fixture.json",
      allowedRoot: "/workspace/project",
      canonicalRoot: "/workspace/project",
      canonicalPath: "/workspace/project/fixture.json",
      kind: "file" as const,
      isSymbolicLink: false,
      revalidated: true,
    };
    expect(
      validateExplicitFixture({
        ...base,
        canonicalPath: "/workspace/project/replacement.json",
      }),
    ).toEqual({ accepted: false, reason: "replacement-race" });
    expect(
      validateExplicitFixture({ ...base, parentIsSymbolicLink: true }),
    ).toEqual({ accepted: false, reason: "linked" });
    expect(
      validateExplicitFixture({
        ...base,
        revalidatedRequestedPath: "/workspace/project/replacement.json",
      }),
    ).toEqual({ accepted: false, reason: "replacement-race" });
  });
});
