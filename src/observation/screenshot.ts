import { PumarejoError } from "../shared/errors.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { WebDriverClient } from "../webdriver/client.js";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const MAX_PNG_BYTES = 24 * 1024 * 1024;
const MAX_DIMENSION = 32_768;
const MAX_PIXELS = 36_000_000;
const VALID_BIT_DEPTHS = new Map<number, ReadonlySet<number>>([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);

export interface ScreenshotMetadata {
  readonly generation: number;
  readonly observedAt: string;
  readonly path?: string;
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
}

export interface ScreenshotResult {
  readonly metadata: ScreenshotMetadata;
  readonly image: {
    readonly data: string;
    readonly mimeType: "image/png";
  };
}

export interface ScreenshotServiceOptions {
  readonly webdriver: Pick<WebDriverClient, "screenshot">;
  readonly generation: () => number;
  readonly artifacts?: Pick<ArtifactStore, "writePng">;
  readonly now?: () => Date;
}

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

export function parsePng(encoded: string): {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
} {
  if (
    encoded.length === 0 ||
    encoded.length > Math.ceil((MAX_PNG_BYTES * 4) / 3) + 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)
  ) {
    throw new PumarejoError("SCREENSHOT_FAILED");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length > MAX_PNG_BYTES ||
    bytes.toString("base64") !== encoded ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new PumarejoError("SCREENSHOT_FAILED");
  }

  let offset = PNG_SIGNATURE.length;
  let width: number | undefined;
  let height: number | undefined;
  let sawImageData = false;
  let sawEnd = false;
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12 || chunkCount >= 65_536) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length || chunkEnd < offset) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/u.test(type)) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes, offset + 4, offset + 8 + length) !== expectedCrc) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    if (chunkCount === 0) {
      if (type !== "IHDR" || length !== 13) {
        throw new PumarejoError("SCREENSHOT_FAILED");
      }
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      if (
        width === 0 ||
        height === 0 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION ||
        width * height > MAX_PIXELS
      ) {
        throw new PumarejoError("SCREENSHOT_FAILED");
      }
      const bitDepth = bytes[offset + 16]!;
      const colorType = bytes[offset + 17]!;
      if (
        !VALID_BIT_DEPTHS.get(colorType)?.has(bitDepth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        ![0, 1].includes(bytes[offset + 20]!)
      ) {
        throw new PumarejoError("SCREENSHOT_FAILED");
      }
    } else if (type === "IHDR") {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    if (
      type[0] === type[0]?.toUpperCase() &&
      !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)
    ) {
      throw new PumarejoError("SCREENSHOT_FAILED");
    }
    if (type === "IDAT") sawImageData = true;
    if (type === "IEND") {
      if (length !== 0 || chunkEnd !== bytes.length) {
        throw new PumarejoError("SCREENSHOT_FAILED");
      }
      sawEnd = true;
    }
    offset = chunkEnd;
    chunkCount += 1;
  }
  if (width === undefined || height === undefined || !sawImageData || !sawEnd) {
    throw new PumarejoError("SCREENSHOT_FAILED");
  }
  return { bytes, width, height };
}

export class ScreenshotService {
  readonly #webdriver: Pick<WebDriverClient, "screenshot">;
  readonly #generation: () => number;
  readonly #artifacts: Pick<ArtifactStore, "writePng"> | undefined;
  readonly #now: () => Date;

  constructor(options: ScreenshotServiceOptions) {
    this.#webdriver = options.webdriver;
    this.#generation = options.generation;
    this.#artifacts = options.artifacts;
    this.#now = options.now ?? (() => new Date());
  }

  async capture(
    save: boolean,
    signal?: AbortSignal,
  ): Promise<ScreenshotResult> {
    try {
      signal?.throwIfAborted();
      const encoded = await this.#webdriver.screenshot(signal);
      const png = parsePng(encoded);
      const stored =
        save && this.#artifacts !== undefined
          ? await this.#artifacts.writePng(png.bytes)
          : undefined;
      if (save && stored === undefined) {
        throw new PumarejoError("SCREENSHOT_FAILED");
      }
      return {
        metadata: {
          generation: this.#generation(),
          observedAt: this.#now().toISOString(),
          ...(stored === undefined ? {} : { path: stored.projectRelativePath }),
          mimeType: "image/png",
          width: png.width,
          height: png.height,
        },
        image: { data: encoded, mimeType: "image/png" },
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (
        error instanceof PumarejoError &&
        error.code === "SCREENSHOT_FAILED"
      ) {
        throw error;
      }
      throw new PumarejoError("SCREENSHOT_FAILED", { cause: error });
    }
  }
}
