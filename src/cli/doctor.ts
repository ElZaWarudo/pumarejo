import { doctorProject, formatDoctorReport } from "../installer/doctor.js";
import {
  doctorSelf,
  formatSelfDoctorReport,
} from "../installer/self-doctor.js";
import type { CliIo } from "./index.js";
import type { CliInvocation } from "./parse.js";

export async function runDoctorCommand(
  invocation: Extract<CliInvocation, { kind: "command" }>,
  channels: CliIo,
): Promise<void> {
  if (invocation.self === true) {
    const report = await doctorSelf();
    channels.stdout(
      invocation.json
        ? `${JSON.stringify(report)}\n`
        : formatSelfDoctorReport(report),
    );
    return;
  }
  const report = await doctorProject(invocation.project);
  channels.stdout(
    invocation.json
      ? `${JSON.stringify(report)}\n`
      : formatDoctorReport(report),
  );
}
