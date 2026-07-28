import type { JsonObject } from "./protocol.js";

export function createWryCapabilities(): JsonObject {
  return {
    capabilities: {
      alwaysMatch: { browserName: "wry" },
      firstMatch: [{}],
    },
  };
}
