export type CliCommandName =
  | "init"
  | "doctor"
  | "remove"
  | "mcp"
  | "recover-leases"
  | "cleanup-artifacts";
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
      readonly self?: boolean;
      readonly subcommand?: "print-config";
      readonly host?: McpHost;
      readonly execute?: boolean;
      readonly bindLegacy?: boolean;
      readonly upgradeBinding?: boolean;
      readonly manifestPath?: string;
      readonly expectedWorkflowId?: string;
      readonly expectedSessionId?: string;
    };

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const COMMANDS = new Set<CliCommandName>([
  "init",
  "doctor",
  "remove",
  "mcp",
  "recover-leases",
  "cleanup-artifacts",
]);
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
    throw new CliUsageError(
      "Expected init, doctor, remove, mcp, recover-leases, or cleanup-artifacts.",
    );
  }

  let project = ".";
  let projectProvided = false;
  let dryRun = command === "recover-leases" || command === "cleanup-artifacts";
  let json = false;
  let self = false;
  let execute = false;
  let bindLegacy = false;
  let upgradeBinding = false;
  let dryRunProvided = false;
  let manifestPath: string | undefined;
  let expectedWorkflowId: string | undefined;
  let expectedSessionId: string | undefined;
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
        if (
          command !== "init" &&
          command !== "remove" &&
          command !== "recover-leases" &&
          command !== "cleanup-artifacts"
        ) {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        dryRun = true;
        dryRunProvided = true;
        break;
      case "--execute":
        if (command !== "recover-leases" && command !== "cleanup-artifacts") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        execute = true;
        dryRun = false;
        break;
      case "--bind-legacy":
        if (command !== "recover-leases") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        bindLegacy = true;
        break;
      case "--upgrade-binding":
        if (command !== "recover-leases") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        upgradeBinding = true;
        break;
      case "--manifest": {
        if (command !== "cleanup-artifacts") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        const value = arguments_[index + 1];
        if (
          !value ||
          value.startsWith("-") ||
          value.length > MAX_PROJECT_PATH_LENGTH ||
          value.includes("\0")
        ) {
          throw new CliUsageError("--manifest requires a valid path.");
        }
        manifestPath = value;
        index += 1;
        break;
      }
      case "--workflow": {
        if (command !== "cleanup-artifacts") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        const value = arguments_[index + 1];
        if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
          throw new CliUsageError("--workflow requires a bounded identifier.");
        }
        expectedWorkflowId = value;
        index += 1;
        break;
      }
      case "--session": {
        if (command !== "cleanup-artifacts") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        const value = arguments_[index + 1];
        if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
          throw new CliUsageError("--session requires a bounded identifier.");
        }
        expectedSessionId = value;
        index += 1;
        break;
      }
      case "--json":
        if (
          command !== "doctor" &&
          command !== "recover-leases" &&
          command !== "cleanup-artifacts"
        ) {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        json = true;
        break;
      case "--self":
        if (command !== "doctor") {
          throw new CliUsageError(`Unknown option ${option} for ${command}.`);
        }
        self = true;
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
  if (self && projectProvided) {
    throw new CliUsageError("--self cannot be combined with --project.");
  }
  if (dryRunProvided && execute) {
    throw new CliUsageError("--dry-run cannot be combined with --execute.");
  }
  if (bindLegacy && upgradeBinding) {
    throw new CliUsageError(
      "--bind-legacy cannot be combined with --upgrade-binding.",
    );
  }
  if (command === "cleanup-artifacts" && manifestPath === undefined) {
    throw new CliUsageError("cleanup-artifacts requires --manifest <path>.");
  }
  if (command === "cleanup-artifacts" && expectedWorkflowId === undefined) {
    throw new CliUsageError("cleanup-artifacts requires --workflow <id>.");
  }

  return {
    kind: "command",
    command,
    project,
    dryRun,
    json,
    ...(self ? { self: true } : {}),
    ...(subcommand === undefined ? {} : { subcommand }),
    ...(host === undefined ? {} : { host }),
    ...(execute ? { execute: true } : {}),
    ...(bindLegacy ? { bindLegacy: true } : {}),
    ...(upgradeBinding ? { upgradeBinding: true } : {}),
    ...(manifestPath === undefined ? {} : { manifestPath }),
    ...(expectedWorkflowId === undefined ? {} : { expectedWorkflowId }),
    ...(expectedSessionId === undefined ? {} : { expectedSessionId }),
  };
}
