import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const expected = process.argv[2];
const acceptNonstandard = process.env.PUMAREJO_ACCEPT_NONSTANDARD_HOST === "1";
const fail = (message) => {
  console.error(`RU1 authoritative gate blocked: ${message}`);
  process.exit(2);
};

if (process.env.PUMAREJO_RUN_PROVIDER !== "1")
  fail("PUMAREJO_RUN_PROVIDER=1 is required");
if (process.env.PUMAREJO_REQUIRE_AUTH_HOST !== "1")
  fail("PUMAREJO_REQUIRE_AUTH_HOST=1 is required");
if (process.env.PUMAREJO_RUN_CARGO !== "1")
  fail("PUMAREJO_RUN_CARGO=1 is required");
if (
  acceptNonstandard &&
  process.env.PUMAREJO_HOST_EXCEPTION_ID !== "USER-2026-07-27-WINDOWS-WSL"
)
  fail("recognized nonstandard-host exception id is required");

if (expected === "windows") {
  if (process.platform !== "win32") fail("Windows proof must run on Windows");
  let facts;
  try {
    facts = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-ComputerInfo | Select WindowsProductName,OsDisplayVersion | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", timeout: 5_000 },
      ),
    );
  } catch {
    fail("cannot read Windows product/version facts");
  }
  if (
    (!acceptNonstandard &&
      !String(facts.WindowsProductName ?? "").startsWith("Windows 11")) ||
    (!acceptNonstandard && facts.OsDisplayVersion !== "24H2")
  )
    fail("Windows 11 24H2 is required");
} else if (expected === "ubuntu") {
  if (process.platform !== "linux") fail("Ubuntu proof must run on Linux");
  const release = readFileSync("/etc/os-release", "utf8");
  if (!/^ID=ubuntu$/m.test(release) || !/^VERSION_ID="?24\.04"?/m.test(release))
    fail("Ubuntu 24.04 LTS is required");
  if (
    !acceptNonstandard &&
    readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft")
  )
    fail("WSL is not authoritative for this gate");
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
    fail("graphical session is required");
} else {
  fail(`unknown expected host ${expected}`);
}
