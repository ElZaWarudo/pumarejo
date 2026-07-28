import { projectConfigSchema, type ProjectConfig } from "./schema.js";
import type { DetectedTauriProject } from "../installer/project.js";

export function generateProjectConfig(
  project: Pick<DetectedTauriProject, "launch" | "primaryWindowLabel">,
): ProjectConfig {
  return projectConfigSchema.parse({
    version: 1,
    launch: project.launch,
    window: project.primaryWindowLabel,
    artifactsDirectory: ".pumarejo/artifacts",
    retainArtifacts: false,
  });
}
