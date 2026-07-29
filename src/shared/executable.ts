import { win32 } from "node:path";

export function executableBasename(command: string): string {
  return win32.basename(command) || "<unknown>";
}
