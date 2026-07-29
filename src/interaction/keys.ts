import { MODIFIER_KEYS, type PressKeyInput } from "../mcp/schemas.js";
import { PumarejoError } from "../shared/errors.js";

const WEBDRIVER_KEYS: Readonly<Record<PressKeyInput["key"], string>> = {
  ENTER: "\uE007",
  TAB: "\uE004",
  ESCAPE: "\uE00C",
  BACKSPACE: "\uE003",
  DELETE: "\uE017",
  ARROW_UP: "\uE013",
  ARROW_DOWN: "\uE015",
  ARROW_LEFT: "\uE012",
  ARROW_RIGHT: "\uE014",
  HOME: "\uE011",
  END: "\uE010",
  PAGE_UP: "\uE00E",
  PAGE_DOWN: "\uE00F",
  SPACE: "\uE00D",
  A: "a",
  B: "b",
  C: "c",
  D: "d",
  E: "e",
  F: "f",
  G: "g",
  H: "h",
  I: "i",
  J: "j",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  O: "o",
  P: "p",
  Q: "q",
  R: "r",
  S: "s",
  T: "t",
  U: "u",
  V: "v",
  W: "w",
  X: "x",
  Y: "y",
  Z: "z",
  F1: "\uE031",
  F2: "\uE032",
  F3: "\uE033",
  F4: "\uE034",
  F5: "\uE035",
  F6: "\uE036",
  F7: "\uE037",
  F8: "\uE038",
  F9: "\uE039",
  F10: "\uE03A",
  F11: "\uE03B",
  F12: "\uE03C",
  ALT: "\uE00A",
  CONTROL: "\uE009",
  SHIFT: "\uE008",
  META: "\uE03D",
};

export function webdriverKey(key: PressKeyInput["key"]): string {
  const value = WEBDRIVER_KEYS[key];
  if (value === undefined) throw new PumarejoError("UNSUPPORTED_KEY");
  return value;
}

export function webdriverModifiers(
  modifiers: PressKeyInput["modifiers"] = [],
): readonly string[] {
  return canonicalModifiers(modifiers).map(webdriverKey);
}

export function canonicalModifiers(
  modifiers: PressKeyInput["modifiers"] = [],
): NonNullable<PressKeyInput["modifiers"]> {
  const requested = new Set(modifiers);
  return MODIFIER_KEYS.filter((modifier) => requested.has(modifier));
}
