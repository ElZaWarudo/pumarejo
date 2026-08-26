import { describe, expect, it, vi } from "vitest";

import {
  DialogGrantStore,
  NativeDialogSession,
  providerCapabilitiesFrom,
  sanitizeDialog,
  type DialogBinding,
} from "../../src/webdriver/native-control.js";

const binding: DialogBinding = {
  sessionId: "a".repeat(32),
  processId: "71",
  nonce: "b".repeat(64),
  surfaceRef: "surface-1",
  generation: 3,
};

describe("native control boundaries", () => {
  it("normalizes capability states and keeps evidence bounded", () => {
    const capabilities = providerCapabilitiesFrom({
      window: {
        resize: {
          state: "supported",
          code: "provider_resize_supported",
        },
        maximize: {
          state: "denied",
          code: "provider_maximize_denied",
          evidence: "x".repeat(1_000),
        },
      },
    });

    expect(capabilities.resize).toEqual({
      state: "supported",
      code: "provider_resize_supported",
    });
    expect(capabilities.maximize).toMatchObject({
      state: "denied",
      code: "provider_maximize_denied",
    });
    expect(capabilities.maximize.evidence?.length).toBe(256);
    expect(capabilities.restore.state).toBe("unavailable");
  });

  it("sanitizes and bounds dialog metadata before evidence", () => {
    const sanitized = sanitizeDialog({
      instanceId: "private-provider-id",
      title: "\u0000Confirm access",
      message: "x".repeat(10_000),
      buttons: ["Accept", "Cancel", "\u0001"],
      surfaceRef: "surface-1",
    });

    expect(sanitized).toMatchObject({
      title: "Confirm access",
      buttons: ["Accept", "Cancel"],
    });
    expect(sanitized).not.toHaveProperty("surfaceRef");
    expect(sanitized.message).toHaveLength(4_096);
    expect(JSON.stringify(sanitized)).not.toMatch(
      /private-provider-id|surface-1/,
    );
  });

  it("binds grants to the launch and consumes the action once", () => {
    const store = new DialogGrantStore();
    const grant = store.issue(binding, ["accept"]);

    expect(JSON.stringify(grant)).not.toContain(binding.nonce);
    expect(store.consume(grant, binding, "cancel", "dialog-1")).toBe(false);
    expect(
      store.consume(grant, { ...binding, generation: 4 }, "accept", "dialog-1"),
    ).toBe(false);
    expect(
      store.consume(
        grant,
        { ...binding, sessionId: "c".repeat(32) },
        "accept",
        "dialog-1",
      ),
    ).toBe(false);
    expect(
      store.consume(
        grant,
        { ...binding, processId: "72" },
        "accept",
        "dialog-1",
      ),
    ).toBe(false);
    expect(
      store.consume(
        grant,
        { ...binding, nonce: "d".repeat(64) },
        "accept",
        "dialog-1",
      ),
    ).toBe(false);
    expect(
      store.consume(
        grant,
        { ...binding, surfaceRef: "surface-2" },
        "accept",
        "dialog-1",
      ),
    ).toBe(false);
    expect(store.consume(grant, binding, "accept", "dialog-1")).toBe(true);
    expect(store.consume(grant, binding, "accept", "dialog-1")).toBe(false);
  });

  it("requires provider proof and fails closed for an unsupported dialog", async () => {
    const webdriver = {
      detectNativeDialog: vi.fn(async () => ({
        state: "unsupported" as const,
        code: "provider_dialog_boundary_unsupported",
      })),
      decideNativeDialog: vi.fn(),
    };
    const session = new NativeDialogSession({
      webdriver,
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });

    await expect(session.detect()).resolves.toEqual({
      state: "unsupported",
      code: "provider_dialog_boundary_unsupported",
    });
    expect(
      session.authorize("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).toBeUndefined();
    await expect(
      session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).resolves.toMatchObject({
      state: "unavailable",
      code: "provider_dialog_not_detected",
    });
    expect(webdriver.decideNativeDialog).not.toHaveBeenCalled();
  });

  it("verifies a supported decision and rejects replay", async () => {
    let present = true;
    const webdriver = {
      detectNativeDialog: vi.fn(async () =>
        present
          ? {
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-1",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
              },
            }
          : {
              state: "unavailable" as const,
              code: "provider_dialog_absent",
            },
      ),
      decideNativeDialog: vi.fn(async () => {
        present = false;
        return {
          state: "supported" as const,
          code: "provider_dialog_decided",
          action: "accept" as const,
        };
      }),
    };
    const session = new NativeDialogSession({
      webdriver,
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });

    await session.detect();
    session.authorize("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    const verified = await session.decide("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    expect(verified).toMatchObject({
      state: "supported",
      code: "dialog_decision_verified",
    });
    expect(JSON.stringify(verified)).not.toMatch(/surface-1|dialog-1/);
    await expect(
      session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).resolves.toMatchObject({ state: "unavailable" });
    expect(webdriver.decideNativeDialog).toHaveBeenCalledOnce();
  });

  it("does not authorize a dialog instance replaced after detection", async () => {
    let instanceId = "dialog-1";
    const webdriver = {
      detectNativeDialog: vi.fn(async () => ({
        state: "supported" as const,
        code: "provider_dialog_supported",
        providerDialog: {
          instanceId,
          title: "Access",
          message: "Allow?",
          buttons: ["Accept", "Cancel"],
          surfaceRef: binding.surfaceRef,
        },
        dialog: {
          title: "Access",
          message: "Allow?",
          buttons: ["Accept", "Cancel"],
          surfaceRef: binding.surfaceRef,
        },
      })),
      decideNativeDialog: vi.fn(),
    };
    const session = new NativeDialogSession({
      webdriver,
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });

    await session.detect();
    session.authorize("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    instanceId = "dialog-2";
    await expect(
      session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).resolves.toMatchObject({
      state: "denied",
      code: "dialog_grant_denied",
    });
    expect(webdriver.decideNativeDialog).not.toHaveBeenCalled();
  });

  it("clears authority after a failed re-detection and rejects stale grant reuse", async () => {
    let phase: "present" | "unsupported" = "present";
    const webdriver = {
      detectNativeDialog: vi.fn(async () =>
        phase === "present"
          ? {
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-1",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
              },
            }
          : {
              state: "unsupported" as const,
              code: "provider_dialog_boundary_unsupported",
            },
      ),
      decideNativeDialog: vi.fn(async () => ({
        state: "supported" as const,
        code: "provider_dialog_decided",
        action: "accept" as const,
      })),
    };
    const session = new NativeDialogSession({
      webdriver,
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });

    await session.detect();
    session.authorize("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    phase = "unsupported";
    await expect(
      session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).resolves.toMatchObject({
      state: "unavailable",
      code: "provider_dialog_not_detected",
    });

    phase = "present";
    await session.detect();
    await expect(
      session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).resolves.toMatchObject({
      state: "denied",
      code: "dialog_grant_denied",
    });
    expect(webdriver.decideNativeDialog).not.toHaveBeenCalled();
  });

  it("rejects contradictory provider state and missing private surface proof", async () => {
    const contradictory = new NativeDialogSession({
      webdriver: {
        detectNativeDialog: vi.fn(async () => ({
          state: "supported" as const,
          code: "provider_dialog_supported",
          providerDialog: {
            instanceId: "dialog-1",
            title: "Access",
            message: "Allow?",
            buttons: ["Accept", "Cancel"],
            surfaceRef: binding.surfaceRef,
          },
        })),
        decideNativeDialog: vi.fn(),
      },
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });
    await expect(contradictory.detect()).resolves.toEqual({
      state: "failed",
      code: "provider_dialog_invalid_metadata",
    });
    expect(
      contradictory.authorize("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      }),
    ).toBeUndefined();

    const missingSurface = new NativeDialogSession({
      webdriver: {
        detectNativeDialog: vi.fn(async () => ({
          state: "supported" as const,
          code: "provider_dialog_supported",
          providerDialog: {
            instanceId: "dialog-1",
            title: "Access",
            message: "Allow?",
            buttons: ["Accept", "Cancel"],
            surfaceRef: "",
          },
          dialog: {
            title: "Access",
            message: "Allow?",
            buttons: ["Accept", "Cancel"],
          },
        })),
        decideNativeDialog: vi.fn(),
      },
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });
    await expect(missingSurface.detect()).resolves.toEqual({
      state: "failed",
      code: "provider_dialog_invalid_metadata",
    });
  });

  it("allowlists session projections and strips adapter fields", async () => {
    let present = true;
    const webdriver = {
      detectNativeDialog: vi.fn(async () =>
        present
          ? ({
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-1",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
                privateSecret: "never-public",
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
                adapterLeak: "never-public",
              },
            } as never)
          : ({
              state: "unavailable" as const,
              code: "provider_dialog_absent",
            } as never),
      ),
      decideNativeDialog: vi.fn(async () => {
        present = false;
        return {
          state: "supported" as const,
          code: "provider_dialog_decided",
          action: "accept" as const,
          providerLeak: "never-public",
        } as never;
      }),
    };
    const session = new NativeDialogSession({
      webdriver,
      sessionId: binding.sessionId,
      processId: 71,
      nonce: binding.nonce,
    });
    const detected = await session.detect();
    expect(detected).toEqual({
      state: "supported",
      code: "provider_dialog_supported",
      dialog: {
        title: "Access",
        message: "Allow?",
        buttons: ["Accept", "Cancel"],
      },
    });
    expect(JSON.stringify(detected)).not.toMatch(
      /surfaceRef|adapterLeak|privateSecret/,
    );

    session.authorize("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    const result = await session.decide("accept", {
      surfaceRef: binding.surfaceRef,
      generation: binding.generation,
    });
    expect(result).toEqual({
      state: "supported",
      code: "dialog_decision_verified",
      action: "accept",
      dialog: {
        title: "Access",
        message: "Allow?",
        buttons: ["Accept", "Cancel"],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /surfaceRef|adapterLeak|privateSecret|providerLeak/,
    );
  });

  it.each([
    ["unsupported", "provider_dialog_unsupported"],
    ["failed", "provider_dialog_failed"],
    ["malformed", "provider_dialog_malformed"],
    ["other unavailable", "provider_dialog_timeout"],
    ["unchanged", "provider_dialog_supported"],
    ["replaced", "provider_dialog_supported"],
    ["canonical", "provider_dialog_absent"],
  ] as const)(
    "requires canonical absence after a supported decision (%s)",
    async (label, code) => {
      let detectCount = 0;
      const webdriver = {
        detectNativeDialog: vi.fn(async () => {
          detectCount += 1;
          if (detectCount === 1) {
            return {
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-1",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
              },
            };
          }
          if (detectCount === 2 || label === "unchanged") {
            return {
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-1",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
              },
            };
          }
          if (label === "replaced") {
            return {
              state: "supported" as const,
              code: "provider_dialog_supported",
              providerDialog: {
                instanceId: "dialog-2",
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
                surfaceRef: binding.surfaceRef,
              },
              dialog: {
                title: "Access",
                message: "Allow?",
                buttons: ["Accept", "Cancel"],
              },
            };
          }
          if (label === "unsupported") {
            return {
              state: "unsupported" as const,
              code,
            };
          }
          if (label === "failed" || label === "malformed") {
            return {
              state: "failed" as const,
              code,
            };
          }
          return {
            state: "unavailable" as const,
            code,
          };
        }),
        decideNativeDialog: vi.fn(async () => ({
          state: "supported" as const,
          code: "provider_dialog_decided",
          action: "accept" as const,
        })),
      };
      const session = new NativeDialogSession({
        webdriver,
        sessionId: binding.sessionId,
        processId: 71,
        nonce: binding.nonce,
      });
      await session.detect();
      session.authorize("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      });
      const result = await session.decide("accept", {
        surfaceRef: binding.surfaceRef,
        generation: binding.generation,
      });
      if (label === "canonical") {
        expect(result).toMatchObject({
          state: "supported",
          code: "dialog_decision_verified",
          action: "accept",
        });
      } else {
        expect(result).toMatchObject({
          state: "failed",
          code: "provider_dialog_postcondition_failed",
          action: "accept",
        });
      }
      expect(JSON.stringify(result)).not.toMatch(
        /surfaceRef|dialog-1|dialog-2/,
      );
    },
  );
});
