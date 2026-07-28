import { describe, expect, it } from "vitest";

import { err, ok } from "../../src/shared/result.js";

describe("result helpers", () => {
  it("creates discriminated success and failure values", () => {
    expect(ok("ready")).toEqual({ ok: true, value: "ready" });
    expect(err("failed")).toEqual({ ok: false, error: "failed" });
  });
});
