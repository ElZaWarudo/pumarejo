export type JsonObject = Record<string, unknown>;

export interface WindowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
export const W3C_SHADOW_KEY = "shadow-6066-11e4-a52e-4f735466cecf";

export function jsonObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export function responseValue(body: JsonObject): unknown {
  return body.value;
}

export function elementIdFrom(value: unknown): string | undefined {
  const object = jsonObject(value);
  const id = object?.[W3C_ELEMENT_KEY] ?? object?.ELEMENT;
  return typeof id === "string" && id.length > 0 && id.length <= 4_096
    ? id
    : undefined;
}
