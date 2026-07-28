import { describe, expect, it, vi } from "vitest";

import {
  parsePng,
  ScreenshotService,
} from "../../src/observation/screenshot.js";
import { TauriAgentError } from "../../src/shared/errors.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function crc32(bytes: Buffer, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe("PNG screenshot validation", () => {
  it("extracts dimensions from a structurally complete PNG", () => {
    expect(parsePng(PNG)).toMatchObject({ width: 1, height: 1 });
  });

  it.each([
    "",
    "not base64",
    Buffer.from("not png").toString("base64"),
    PNG.slice(0, -16),
    `${PNG}AAAA`,
    (() => {
      const corrupt = Buffer.from(PNG, "base64");
      corrupt[corrupt.length - 5] ^= 1;
      return corrupt.toString("base64");
    })(),
  ])("rejects malformed provider data", (encoded) => {
    expect(() => parsePng(encoded)).toThrowError(TauriAgentError);
  });

  it("rejects a valid-CRC PNG whose dimensions exceed the decoded pixel budget", () => {
    const oversized = Buffer.from(PNG, "base64");
    oversized.writeUInt32BE(8_192, 16);
    oversized.writeUInt32BE(8_192, 20);
    oversized.writeUInt32BE(crc32(oversized, 12, 29), 29);

    expect(() => parsePng(oversized.toString("base64"))).toThrowError(
      TauriAgentError,
    );
  });
});

describe("ScreenshotService", () => {
  it("returns current generation metadata without writing when save is false", async () => {
    const writePng = vi.fn();
    const service = new ScreenshotService({
      webdriver: { screenshot: vi.fn(async () => PNG) },
      generation: () => 7,
      artifacts: { writePng },
      now: () => new Date("2026-07-27T10:00:00.000Z"),
    });

    await expect(service.capture(false)).resolves.toEqual({
      metadata: {
        generation: 7,
        observedAt: "2026-07-27T10:00:00.000Z",
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      image: { data: PNG, mimeType: "image/png" },
    });
    expect(writePng).not.toHaveBeenCalled();
  });

  it("writes validated bytes and publishes only the confined path", async () => {
    const writePng = vi.fn(async () => ({
      projectRelativePath:
        ".tauri-agent/artifacts/session-safe/screenshot-0001.png",
    }));
    const service = new ScreenshotService({
      webdriver: { screenshot: vi.fn(async () => PNG) },
      generation: () => 3,
      artifacts: { writePng },
    });

    const result = await service.capture(true);

    expect(writePng).toHaveBeenCalledWith(Buffer.from(PNG, "base64"));
    expect(result.metadata).toMatchObject({
      generation: 3,
      path: ".tauri-agent/artifacts/session-safe/screenshot-0001.png",
      width: 1,
      height: 1,
    });
  });

  it("fails closed when persistence was requested without an artifact store", async () => {
    const service = new ScreenshotService({
      webdriver: { screenshot: vi.fn(async () => PNG) },
      generation: () => 0,
    });

    await expect(service.capture(true)).rejects.toMatchObject({
      code: "SCREENSHOT_FAILED",
    });
  });
});
