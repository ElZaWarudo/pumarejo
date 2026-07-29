export type CliCommandName = "init" | "doctor" | "remove" | "mcp";
export type McpHost = "codex" | "claude-code" | "cursor";

export type CliInvocation =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | {
      readonly kind: "command";
      readonly command: CliCommandName;
      readonly project: string;
      readonly dryRun: boolean;
      readonly json: boolean;
      readonly subcommand?: "print-config";
      readonly host?: McpHost;
    };

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const COMMANDS = new Set<CliCommandName>(["init", "doctor", "remove", "mcp"]);
const MAX_CLI_ARGUMENTS = 32;
const MAX_PROJECT_PATH_LENGTH = 4_096;

export function parseCliArgs(arguments_: readonly string[]): CliInvocation {
  if (arguments_.length > MAX_CLI_ARGUMENTS) {
    throw new CliUsageError("Too many CLI arguments.");
  }
  if (
    arguments_.length === 1 &&
    ["--help", "-h"].includes(arguments_[0] ?? "")
  ) {
    return { kind: "help" };
  }
  if (
    arguments_.length === 1 &&
    ["--version", "-v"].includes(arguments_[0] ?? "")
  ) {
    return { kind: "version" };
  }

  const command = arguments_[0] as CliCommandName | undefined;
  if (!command || !COMMANDS.has(command)) {
    throw new CliUsageError("Expected init, doctor, remove, or mcp.");
  }

  let project = ".";
  let projectProvided = false;
  let dryRun = false;
  let json = false;
  let subcommand: "print-config" | undefined;
  let host: McpHost | undefined;

  let optionStart = 1;
  if (command === "mcp" && arguments_[1] === "print-config") {
    subcommand = "print-config";
    optionStart = 2;
  }

  for (let index = optionStart; index < arguments_.length; index += 1) {
    const option = arguments_[index];
    switch (option) {
      case "--project": {
        const value = arguments_[index + 1];
        if (!value || value.startsWith("-")) {
          throw new CliUsageError("--project requires a path.");
        }
        if (value.length > MAX_PROJECT_PATH_LENGTH || value.includes("\0")) {
          throw new CliUsageError("--project contains an invalid path.");
        }
        project = value;
        projectProvided = true;
        index += 1;
        break;
      }
      case "--dry-run":
        if (command !== "init" && command !== "remove") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        dryRun = true;
        break;
      case "--json":
        if (command !== "doctor") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        json = true;
        break;
      case "--host": {
        if (command !== "mcp" || subcommand !== "print-config") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        const value = arguments_[index + 1];
        if (
          value !== "codex" &&
          value !== "claude-code" &&
          value !== "cursor"
        ) {
          throw new CliUsageError(
            "--host requires codex, claude-code, or cursor.",
          );
        }
        host = value;
        index += 1;
        break;
      }
      default:
        throw new CliUsageError(`Unknown option ${String(option)}.`);
    }
  }

  if (command === "mcp" && !projectProvided) {
    throw new CliUsageError("mcp requires --project <path>.");
  }
  if (subcommand === "print-config" && host === undefined) {
    throw new CliUsageError("mcp print-config requires --host.");
  }

  return {
    kind: "command",
    command,
    project,
    dryRun,
    json,
    ...(subcommand === undefined ? {} : { subcommand }),
    ...(host === undefined ? {} : { host }),
  };
}
