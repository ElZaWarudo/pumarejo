import type { PressKeyInput } from "../mcp/schemas.js";
import { TauriAgentError } from "../shared/errors.js";

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
};

export function webdriverKey(key: PressKeyInput["key"]): string {
  const value = WEBDRIVER_KEYS[key];
  if (value === undefined) throw new TauriAgentError("UNSUPPORTED_KEY");
  return value;
}
