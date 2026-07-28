---
title: pumarejo Delivery Workflow
date: 2026-07-23
release_policy: deferred-until-all-implementation-complete
---

# pumarejo Delivery Workflow

## Development posture

- Compound Master runs in full-delivery mode with serial implementation in the current workspace.
- Worktrees are avoided unless the user changes policy.
- Jira is optional and currently omitted because no project or configuration exists.
- Production posture remains unknown; all consumer instrumentation is debug-only.
- The workspace may remain without a remote during artifact and implementation phases.

## Quality gates

Every implementation unit must pass:

1. Targeted tests for its contract.
2. The natural affected unit/integration suite.
3. Type checking, linting, formatting verification, and build.
4. Code review at threshold P0-P2.
5. Security review when the unit touches command execution, project mutation, process ownership, path confinement, or local WebDriver exposure.
6. CI-equivalent verification on the available local platform, with Windows/Ubuntu gaps recorded until the platform matrix runs.

## Planned repository commands

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm check
```

`pnpm check` is the local release-prevention aggregate and must be green before final release handoff.

## Release policy

- No worker, reviewer, or intermediate review unit may commit, push, create a PR, publish npm, transition Jira, or merge.
- All review units are implemented and verified before the single final Release Marshal handoff.
- The final handoff shall include the complete change set, verification evidence, security findings, platform gaps, package/version proposal, and npm publication readiness.
- Repository initialization, integration base, remote, branch naming, PR strategy, npm scope availability, credentials, and publication remain Release Marshal decisions requiring the appropriate user authority.
- This deferred release policy changes shipping timing only; it does not remove per-unit review, verification, traceability, or reviewability gates.

## CI target

The implementation shall include a CI workflow with:

- Node.js 22 and 24 jobs for package checks.
- Windows 11 and Ubuntu LTS jobs for platform integration.
- A release-build fixture check proving debug-only WebDriver integration is absent.
- Artifact retention for failing screenshots and diagnostic reports only.

CI configuration is implementation scope; enabling external repository checks occurs only after the release phase establishes a remote.

## Versioning and publication

- Package contract follows semantic versioning.
- The initial publish target is `pumarejo`, subject to registry availability and authorization during release.
- The CLI binary name is `pumarejo`.
- The repository must be publishable with package contents limited to runtime output, templates, license, and user documentation.
- Publication uses provenance and two-factor-capable npm authentication when the final environment supports them.
