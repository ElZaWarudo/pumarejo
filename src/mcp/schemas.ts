import { z } from "zod";

const referenceSchema = z.string().min(1).max(128);

export const launchInputSchema = z
  .object({
    mode: z.enum(["visible", "background"]).default("visible"),
  })
  .strict();

export const emptyInputSchema = z.object({}).strict();

export const screenshotInputSchema = z
  .object({
    save: z.boolean().default(true),
  })
  .strict();

export const clickInputSchema = z
  .object({
    ref: referenceSchema,
  })
  .strict();

export const typeInputSchema = z
  .object({
    ref: referenceSchema,
    text: z.string().max(65_536),
    clear: z.boolean().default(true),
  })
  .strict();

export const SUPPORTED_KEYS = [
  "ENTER",
  "TAB",
  "ESCAPE",
  "BACKSPACE",
  "DELETE",
  "ARROW_UP",
  "ARROW_DOWN",
  "ARROW_LEFT",
  "ARROW_RIGHT",
  "HOME",
  "END",
  "PAGE_UP",
  "PAGE_DOWN",
  "SPACE",
] as const;

export const pressKeyInputSchema = z
  .object({
    key: z.enum(SUPPORTED_KEYS),
  })
  .strict();

export type LaunchInput = z.infer<typeof launchInputSchema>;
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;
export type ClickInput = z.infer<typeof clickInputSchema>;
export type TypeInput = z.infer<typeof typeInputSchema>;
export type PressKeyInput = z.infer<typeof pressKeyInputSchema>;
