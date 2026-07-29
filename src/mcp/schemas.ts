import { z } from "zod";

const referenceSchema = z.string().min(1).max(128);
const actionObservationFields = {
  snapshotAfter: z.boolean().default(true),
  settleMs: z.number().int().min(0).max(2_000).default(250),
} as const;

export const launchInputSchema = z
  .object({
    mode: z.enum(["visible", "background"]).default("visible"),
    waitMs: z.number().int().min(0).max(30_000).default(5_000),
  })
  .strict();

export const emptyInputSchema = z.object({}).strict();

export const snapshotInputSchema = z
  .object({
    rootRef: referenceSchema.optional(),
    maxNodes: z.number().int().min(1).max(500).default(500),
    maxDepth: z.number().int().min(0).max(256).default(32),
    maxTextLength: z.number().int().min(1).max(65_536).default(4096),
    visibleOnly: z.boolean().default(true),
    includeNames: z.boolean().default(true),
    includeText: z.boolean().default(true),
    includeValues: z.boolean().default(true),
    roles: z.array(z.string().min(1).max(128)).min(1).max(32).optional(),
    name: z.string().min(1).max(256).optional(),
    types: z.array(z.string().min(1).max(128)).min(1).max(32).optional(),
  })
  .strict();

export const screenshotInputSchema = z
  .object({
    save: z.boolean().default(true),
  })
  .strict();

export const clickInputSchema = z
  .object({
    ref: referenceSchema,
    ...actionObservationFields,
  })
  .strict();

export const typeInputSchema = z
  .object({
    ref: referenceSchema,
    text: z.string().max(65_536),
    clear: z.boolean().default(true),
    ...actionObservationFields,
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
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "ALT",
  "CONTROL",
  "SHIFT",
  "META",
] as const;

export const MODIFIER_KEYS = ["CONTROL", "SHIFT", "ALT", "META"] as const;

export const pressKeyInputSchema = z
  .object({
    key: z.enum(SUPPORTED_KEYS),
    modifiers: z.array(z.enum(MODIFIER_KEYS)).max(4).default([]),
    ...actionObservationFields,
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.modifiers).size !== input.modifiers.length) {
      context.addIssue({
        code: "custom",
        path: ["modifiers"],
        message: "modifiers must be unique",
      });
    }
    if (
      MODIFIER_KEYS.includes(input.key as (typeof MODIFIER_KEYS)[number]) &&
      input.modifiers.includes(input.key as (typeof MODIFIER_KEYS)[number])
    ) {
      context.addIssue({
        code: "custom",
        path: ["modifiers"],
        message: "the dispatched modifier key cannot also be held",
      });
    }
  });

export const windowInputSchema = z
  .object({
    action: z.enum(["resize", "maximize", "restore"]),
    width: z.number().int().min(200).max(8_192).optional(),
    height: z.number().int().min(200).max(8_192).optional(),
    ...actionObservationFields,
  })
  .strict()
  .superRefine((input, context) => {
    const resizing = input.action === "resize";
    if (
      resizing !== (input.width !== undefined) ||
      resizing !== (input.height !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "resize requires width and height exclusively",
      });
    }
  });

export const pointerInputSchema = z
  .object({
    action: z.enum(["hover", "double_click", "context_menu"]),
    ref: referenceSchema,
    ...actionObservationFields,
  })
  .strict();

export const scrollInputSchema = z
  .object({
    ref: referenceSchema,
    deltaX: z.number().int().min(-10_000).max(10_000),
    deltaY: z.number().int().min(-10_000).max(10_000),
    ...actionObservationFields,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.deltaX === 0 && input.deltaY === 0) {
      context.addIssue({
        code: "custom",
        message: "at least one scroll delta must be non-zero",
      });
    }
  });

export const selectOptionInputSchema = z
  .object({
    ref: referenceSchema,
    ...actionObservationFields,
  })
  .strict();

export type LaunchInput = z.infer<typeof launchInputSchema>;
export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;
export type ClickInput = z.input<typeof clickInputSchema>;
export type TypeInput = z.input<typeof typeInputSchema>;
export type PressKeyInput = z.input<typeof pressKeyInputSchema>;
export type WindowInput = z.input<typeof windowInputSchema>;
export type PointerInput = z.input<typeof pointerInputSchema>;
export type ScrollInput = z.input<typeof scrollInputSchema>;
export type SelectOptionInput = z.input<typeof selectOptionInputSchema>;
