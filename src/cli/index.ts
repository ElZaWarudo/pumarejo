#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { serveMcpOverStdio } from "../mcp/server.js";
import { PumarejoError, toErrorEnvelope } from "../shared/errors.js";
import { VERSION } from "../version.js";
import { runDoctorCommand } from "./doctor.js";
import { runInitCommand } from "./init.js";
import { CliUsageError, parseCliArgs, type CliInvocation } from "./parse.js";
import { runRemoveCommand } from "./remove.js";

export { VERSION };

export const HELP_TEXT = `pumarejo

Usage:
  pumarejo init [--project <path>] [--dry-run]
  pumarejo doctor [--project <path>] [--json]
  pumarejo remove [--project <path>] [--dry-run]
  pumarejo mcp --project <path>
  pumarejo --version
  pumarejo --help`;

export type CommandHandler = (
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
) => Promise<void>;

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

const processIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

async function defaultHandler(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  if (invocation.command === "mcp") {
    await serveMcpOverStdio(invocation.project);
    return;
  }
  if (invocation.command === "init") {
    await runInitCommand(invocation, channels);
    return;
  }
  if (invocation.command === "remove") {
    await runRemoveCommand(invocation, channels);
    return;
  }
  if (invocation.command === "doctor") {
    await runDoctorCommand(invocation, channels);
    return;
  }
  throw new PumarejoError("INTEGRATION_INCOMPLETE");
}

export async function runCli(
  arguments_: readonly string[],
  handler: CommandHandler = defaultHandler,
  io: CliIo = processIo,
): Promise<number> {
  try {
    const invocation = parseCliArgs(arguments_);
    if (invocation.kind === "help") {
      io.stdout(`${HELP_TEXT}\n`);
      return 0;
    }
    if (invocation.kind === "version") {
      io.stdout(`${VERSION}\n`);
      return 0;
    }

    await handler(invocation, io);
    return 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(`${error.message}\n\n${HELP_TEXT}\n`);
      return 2;
    }

    const envelope = toErrorEnvelope(error);
    io.stderr(`${JSON.stringify(envelope)}\n`);
    return 1;
  }
}

const executablePath = process.argv[1];
if (executablePath && import.meta.url === pathToFileURL(executablePath).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
