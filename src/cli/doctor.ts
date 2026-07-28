import { doctorProject, formatDoctorReport } from "../installer/doctor.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export async function runDoctorCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  const report = await doctorProject(invocation.project);
  channels.stdout(
    invocation.json
      ? `${JSON.stringify(report)}\n`
      : formatDoctorReport(report),
  );
}
