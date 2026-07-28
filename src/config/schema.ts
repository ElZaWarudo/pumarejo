import { z } from "zod";

const MAX_ARGUMENT_COUNT = 128;
const MAX_ARGUMENT_LENGTH = 8_192;
const MAX_COMMAND_LENGTH = 260;
const MAX_PATH_LENGTH = 4_096;
const MODE_CONFIG_PLACEHOLDER = "{tauriConfig}";

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
