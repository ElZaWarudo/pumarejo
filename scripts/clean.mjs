import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(workspaceRoot, "dist");

if (outputDirectory === workspaceRoot || !outputDirectory.startsWith(workspaceRoot)) {
  throw new Error("Refusing to clean outside the workspace.");
}

await rm(outputDirectory, { recursive: true, force: true });
