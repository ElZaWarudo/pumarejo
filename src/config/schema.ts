import { z } from "zod";

import { executableBasename } from "../shared/executable.js";

const MAX_ARGUMENT_COUNT = 128;
const MAX_ARGUMENT_LENGTH = 8_192;
const MAX_COMMAND_LENGTH = 260;
const MAX_PATH_LENGTH = 4_096;
const MODE_CONFIG_PLACEHOLDER = "{tauriConfig}";
const ABSOLUTE_RUNTIME_PATH = /^(?:[A-Za-z]:[\\/]|\/)/u;

const APPROVED_LAUNCH_COMMANDS = new Set([
  "pnpm",
  "pnpm.cmd",
  "npm",
  "npm.cmd",
  "yarn",
  "yarn.cmd",
  "bun",
  "bun.exe",
  "deno",
  "deno.exe",
  "cargo",
  "cargo.exe",
]);

export const launchProfileSchema = z
  .strictObject({
    command: z
      .string()
      .min(1)
      .max(MAX_COMMAND_LENGTH)
      .refine(
        (command) => APPROVED_LAUNCH_COMMANDS.has(command.toLowerCase()),
        "launch command must be an approved project-derived executable",
      ),
    args: z
      .array(
        z
          .string()
          .max(MAX_ARGUMENT_LENGTH)
          .refine((value) => !value.includes("\0"), {
            message: "launch arguments may not contain NUL bytes",
          }),
      )
      .max(MAX_ARGUMENT_COUNT),
    executablePath: z
      .string()
      .min(1)
      .max(MAX_PATH_LENGTH)
      .refine((value) => ABSOLUTE_RUNTIME_PATH.test(value), {
        message: "launch executablePath must be absolute",
      })
      .optional(),
    pathPrepend: z
      .array(
        z
          .string()
          .min(1)
          .max(MAX_PATH_LENGTH)
          .refine((value) => ABSOLUTE_RUNTIME_PATH.test(value), {
            message: "launch pathPrepend entries must be absolute",
          }),
      )
      .max(16)
      .optional(),
    environment: z
      .strictObject({
        CARGO_HOME: z.string().max(MAX_PATH_LENGTH).optional(),
        CARGO_TARGET_DIR: z.string().max(MAX_PATH_LENGTH).optional(),
        CC: z.string().max(MAX_PATH_LENGTH).optional(),
        CXX: z.string().max(MAX_PATH_LENGTH).optional(),
        PKG_CONFIG_PATH: z.string().max(MAX_PATH_LENGTH).optional(),
        RUSTC_WRAPPER: z.string().max(MAX_PATH_LENGTH).optional(),
        RUSTFLAGS: z.string().max(MAX_ARGUMENT_LENGTH).optional(),
        RUSTUP_HOME: z.string().max(MAX_PATH_LENGTH).optional(),
        RUSTUP_TOOLCHAIN: z.string().max(128).optional(),
      })
      .optional(),
  })
  .superRefine((profile, context) => {
    const occurrences = profile.args.reduce(
      (count, argument) =>
        count + argument.split(MODE_CONFIG_PLACEHOLDER).length - 1,
      0,
    );
    if (occurrences !== 1) {
      context.addIssue({
        code: "custom",
        path: ["args"],
        message: `launch args must contain exactly one ${MODE_CONFIG_PLACEHOLDER} placeholder`,
      });
    }
    if (profile.executablePath !== undefined) {
      const configured = profile.command
        .toLowerCase()
        .replace(/\.(?:cmd|exe)$/u, "");
      const executable = executableBasename(profile.executablePath)
        .toLowerCase()
        .replace(/\.(?:cmd|exe)$/u, "");
      if (configured !== executable) {
        context.addIssue({
          code: "custom",
          path: ["executablePath"],
          message: "launch executablePath must match launch command",
        });
      }
    }
  });

export const projectConfigSchema = z.strictObject({
  version: z.literal(1),
  launch: launchProfileSchema,
  webdriverPort: z.number().int().min(1024).max(65535).optional(),
  window: z.string().trim().min(1).max(128),
  artifactsDirectory: z.string().trim().min(1).max(MAX_PATH_LENGTH),
  retainArtifacts: z.boolean().default(false),
});

export type LaunchProfile = z.infer<typeof launchProfileSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export { MODE_CONFIG_PLACEHOLDER };
