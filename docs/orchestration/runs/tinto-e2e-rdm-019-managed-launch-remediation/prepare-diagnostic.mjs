import { loadProjectConfig, materializeLaunchProfile } from "../../../../dist/config/load.js";
import { createRuntimeOverlay, readBuildDevUrl } from "../../../../dist/platform/mode-config.js";
import { resolvedLaunchEnvironmentResult } from "../../../../dist/platform/launch-environment.js";
import { resolveProjectTauriCommand } from "../../../../dist/platform/tauri-command.js";
import { prepareWindowsLaunch, resolveWindowsLaunch } from "../../../../dist/platform/windows/launch.js";
import { reserveProviderPort } from "../../../../dist/session/endpoint.js";

const project = "C:/Users/User/AppData/Local/Temp/pumarejo-tinto-rdm019-clean";
const loaded = await loadProjectConfig(project);
const devUrl = await readBuildDevUrl({ projectRoot: loaded.projectRoot, platform: "windows" });
const requestedFamily = devUrl?.ok === true ? devUrl.value.family : "ipv4";
const reservation = await reserveProviderPort(undefined, requestedFamily);
const preparedDirect = await prepareWindowsLaunch(
  loaded,
  "visible",
  process.env,
  undefined,
  requestedFamily,
);
const overlay = await createRuntimeOverlay({
  projectRoot: loaded.projectRoot,
  platform: "windows",
  mode: "visible",
  windowLabel: loaded.config.window,
});
try {
  const environment = resolvedLaunchEnvironmentResult(
    "windows",
    process.env,
    loaded.config.launch,
    {},
    { values: process.env, available: true },
  );
  const profile = materializeLaunchProfile(
    loaded.config.launch,
    overlay.path,
    loaded.projectRoot,
  );
  const projectCommand = await resolveProjectTauriCommand(
    profile.command,
    profile.args,
    loaded.projectRoot,
  );
  const fallback =
    projectCommand ??
    (environment.status === "complete"
      ? await resolveWindowsLaunch(
          profile.command,
          profile.args,
          loaded.projectRoot,
          environment.environment,
        ).catch((error) => ({ error: error?.code ?? error?.name }))
      : null);
  process.stdout.write(
    `${JSON.stringify({
      environmentStatus: environment.status,
      reservedPort: reservation.port > 0,
      requestedFamily,
      devUrlStatus: devUrl?.ok === true ? "ok" : devUrl?.code ?? "absent",
      preparedDevUrlMatches: JSON.stringify(preparedDirect.devUrl) === JSON.stringify(devUrl),
      missing: environment.status === "complete" ? [] : environment.missing,
      rejected: environment.rejected,
      profileCommand: profile.command,
      projectCommand: projectCommand === undefined ? null : "resolved",
      fallback: fallback === null ? null : "resolved",
    })}\n`,
  );
} finally {
  await overlay.cleanup();
  await preparedDirect.cleanup();
  await reservation.release();
}
