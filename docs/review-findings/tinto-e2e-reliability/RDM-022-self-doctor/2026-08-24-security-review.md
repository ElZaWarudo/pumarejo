# RDM-022 security review

Status: pass; no P0-P2 security-relevant findings.

- `doctor --self` performs no `PATH` resolution, process launch, install,
  repair, lifecycle, cleanup, or package import.
- Filesystem access remains root-confined, no-follow, byte/entry/depth bounded,
  and identity checked around verified reads. Windows inability to prove handle
  identity remains `warn`/unknown.
- Resolver evidence is accepted only as bounded structured data. Versions and
  sources are runtime-allowlisted; paths, environment, arguments, stderr, and
  raw fields are not serialized. An adversarial source is redacted.
- Bun lockfiles cannot become ready through text markers. Pnpm requires bounded
  verified `lockfileVersion` and `importers` metadata.
- Missing/unsafe required objects override uncertainty; limits emit an explicit
  `self.report.bounds` error.
