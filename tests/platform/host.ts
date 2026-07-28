import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

export type HostFacts = {
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  sessionType: string;
  display: string;
  webviewRuntime: string;
  product?: string;
  displayVersion?: string;
};

function windowsFacts(): Pick<
  HostFacts,
  "release" | "product" | "displayVersion"
> {
  try {
    const raw = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-ComputerInfo | Select WindowsProductName,OsBuildNumber,OsDisplayVersion | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    const value = JSON.parse(raw) as {
      WindowsProductName?: string;
      OsBuildNumber?: number;
      OsDisplayVersion?: string;
    };
    return {
      release: String(value.OsBuildNumber ?? "unknown"),
      product: value.WindowsProductName ?? "unknown",
      displayVersion: value.OsDisplayVersion ?? "unknown",
    };
  } catch {
    return { release: os.release() };
  }
}

function linuxFacts(): { release: string; sessionType: string } {
  try {
    const text = readFileSync("/etc/os-release", "utf8");
    const release = /^VERSION_ID="?([^"\n]+)"?/m.exec(text)?.[1] ?? "unknown";
    return {
      release,
      sessionType: process.env.XDG_SESSION_TYPE ?? "unknown",
    };
  } catch {
    return { release: os.release(), sessionType: "unknown" };
  }
}

export function hostFacts(): HostFacts {
  const platformFacts =
    process.platform === "win32" ? windowsFacts() : linuxFacts();
  return {
    platform: process.platform,
    release: platformFacts.release,
    arch: process.arch,
    sessionType:
      process.platform === "win32"
        ? (process.env.SESSIONNAME ?? "unknown")
        : ((platformFacts as { sessionType?: string }).sessionType ??
          "unknown"),
    display: process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY ?? "none",
    webviewRuntime: process.env.PUMAREJO_WEBVIEW_RUNTIME ?? "unknown",
    product: "product" in platformFacts ? platformFacts.product : undefined,
    displayVersion:
      "displayVersion" in platformFacts
        ? platformFacts.displayVersion
        : undefined,
  };
}

export function providerRunEnabled(): boolean {
  return process.env.PUMAREJO_RUN_PROVIDER === "1";
}

export function authoritativeHostRequested(): boolean {
  return process.env.PUMAREJO_REQUIRE_AUTH_HOST === "1";
}

export function nonstandardHostAccepted(): boolean {
  return (
    process.env.PUMAREJO_ACCEPT_NONSTANDARD_HOST === "1" &&
    process.env.PUMAREJO_HOST_EXCEPTION_ID === "USER-2026-07-27-WINDOWS-WSL"
  );
}

export function authoritativeHostValid(
  expected: "windows" | "ubuntu",
): boolean {
  const facts = hostFacts();
  if (expected === "windows") {
    if (nonstandardHostAccepted()) return facts.platform === "win32";
    return (
      facts.platform === "win32" &&
      facts.product?.startsWith("Windows 11") === true &&
      facts.displayVersion === "24H2"
    );
  }
  if (facts.platform !== "linux" || facts.release !== "24.04") return false;
  if (nonstandardHostAccepted()) {
    return facts.display !== "none";
  }
  try {
    if (
      readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return facts.display !== "none" && facts.sessionType !== "unknown";
}
