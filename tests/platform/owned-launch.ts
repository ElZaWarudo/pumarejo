import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  startAuthenticatedProxy,
  type AuthenticatedProxy,
} from "./authenticated-proxy.js";
import { createModeOverlay, type LaunchMode } from "./mode-overlay.js";
import {
  commandHash,
  createProcessLease,
  terminateOwnedProcess,
  type ProcessIdentity,
  type ProcessLease,
} from "./process-lease.js";

export type SpawnRequest = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
};

export type SpawnedFixture = ProcessIdentity & {
  waitUntilReady(port: number): Promise<void>;
};

export type OwnedLaunchDependencies = {
  spawn(request: SpawnRequest): Promise<SpawnedFixture>;
  inspect(pid: number): Promise<ProcessIdentity | undefined>;
  terminate(pid: number): Promise<void>;
  providerOwner(rootPid: number, port: number): Promise<number | undefined>;
  startProxy(options: {
    providerPort: number;
    nonce: string;
    providerNonce: string;
  }): Promise<AuthenticatedProxy>;
  portReleased(port: number): Promise<boolean>;
};

export type OwnedLaunch = {
  lease: ProcessLease;
  overlayPath: string;
  cleanup(deleteSession?: () => Promise<unknown>): Promise<void>;
};

async function waitForPortsReleased(
  ports: number[],
  released: (port: number) => Promise<boolean>,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await Promise.all(ports.map(released))).every(Boolean)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function launchOwnedProvider(
  options: {
    mode: LaunchMode;
    providerPort: number;
    fixtureDir?: string;
    command?: string;
  },
  dependencies: OwnedLaunchDependencies,
): Promise<OwnedLaunch> {
  const fixtureDir = resolve(options.fixtureDir ?? "tests/fixtures/tauri-app");
  const temporaryDir = await mkdtemp(join(tmpdir(), "pumarejo-proof-"));
  const overlayPath = join(temporaryDir, "mode-overlay.json");
  await writeFile(
    overlayPath,
    `${JSON.stringify(createModeOverlay(options.mode), null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  const command = options.command ?? "pnpm";
  const args = [
    "tauri",
    "dev",
    "--features",
    "pumarejo",
    "--config",
    overlayPath,
  ];
  const nonce = randomBytes(32).toString("hex");
  const providerNonce = randomBytes(32).toString("hex");
  let spawned: SpawnedFixture | undefined;
  let proxy: AuthenticatedProxy | undefined;
  try {
    spawned = await dependencies.spawn({
      command,
      args,
      cwd: fixtureDir,
      env: {
        ...process.env,
        CARGO_TARGET_DIR:
          process.env.PUMAREJO_LIVE_TARGET_DIR ??
          resolve(
            fixtureDir,
            "..",
            "..",
            "..",
            ".proof-target",
            "provider-live",
          ),
        DISPLAY:
          options.mode === "background" &&
          process.env.PUMAREJO_BACKGROUND_DISPLAY
            ? process.env.PUMAREJO_BACKGROUND_DISPLAY
            : process.env.DISPLAY,
        WAYLAND_DISPLAY:
          options.mode === "background" &&
          process.env.PUMAREJO_BACKGROUND_DISPLAY
            ? undefined
            : process.env.WAYLAND_DISPLAY,
        TAURI_WEBDRIVER_NONCE: providerNonce,
        TAURI_WEBDRIVER_PORT: String(options.providerPort),
      },
      shell: false,
    });
    if (
      spawned.commandHash !== commandHash(command, args) ||
      spawned.pid <= 0 ||
      spawned.startedAt <= 0
    ) {
      throw new Error("spawn adapter returned an invalid process identity");
    }
    await spawned.waitUntilReady(options.providerPort);
    const providerPid = await dependencies.providerOwner(
      spawned.pid,
      options.providerPort,
    );
    if (!providerPid) {
      throw new Error("provider port is not owned by the spawned fixture");
    }
    proxy = await dependencies.startProxy({
      providerPort: options.providerPort,
      nonce,
      providerNonce,
    });
    const lease = createProcessLease(
      spawned,
      {
        providerPid,
        providerPort: options.providerPort,
        proxyPort: proxy.port,
      },
      nonce,
    );
    let cleaned = false;
    return {
      lease,
      overlayPath,
      async cleanup(deleteSession) {
        if (cleaned) return;
        cleaned = true;
        let firstError: unknown;
        try {
          await deleteSession?.();
        } catch (error) {
          firstError = error;
        }
        try {
          await proxy?.close();
        } catch (error) {
          firstError ??= error;
        }
        try {
          const terminated = await terminateOwnedProcess(
            lease,
            dependencies.inspect,
            dependencies.terminate,
          );
          if (!terminated) throw new Error("process lease no longer matches");
        } catch (error) {
          firstError ??= error;
        }
        await rm(temporaryDir, { recursive: true, force: true });
        const released = await waitForPortsReleased(
          [lease.providerPort, lease.proxyPort],
          dependencies.portReleased,
        );
        if (!released) {
          firstError ??= new Error("provider or proxy port was not released");
        }
        if (firstError) throw firstError;
      },
    };
  } catch (error) {
    await proxy?.close().catch(() => undefined);
    if (spawned) {
      const provisional = createProcessLease(
        spawned,
        { providerPort: options.providerPort, proxyPort: proxy?.port ?? 0 },
        nonce,
      );
      await terminateOwnedProcess(
        provisional,
        dependencies.inspect,
        dependencies.terminate,
      ).catch(() => false);
    }
    await rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

export const defaultProxyStarter = startAuthenticatedProxy;
