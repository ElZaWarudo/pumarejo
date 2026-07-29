# pumarejo v1 delivery index

The executable work packages are organized one-to-one with the reviewed roadmap:

1. `RDM-001-isolated-control/2026-07-23-001-isolated-control-work-package.md`
2. `RDM-002-package-contract/2026-07-23-002-package-contract-work-package.md`
3. `RDM-003-project-integration/2026-07-23-003-project-integration-work-package.md`
4. `RDM-004-runtime-lifecycle/2026-07-23-004-runtime-lifecycle-work-package.md`
5. `RDM-005-semantic-observation/2026-07-23-005-semantic-observation-work-package.md`
6. `RDM-006-component-interaction/2026-07-23-006-component-interaction-work-package.md`
7. `RDM-007-mcp-workflow/2026-07-23-007-mcp-workflow-work-package.md`
8. `RDM-008-certification/2026-07-23-008-certification-work-package.md`

Execution is serial in roadmap dependency order. Local implementation and review do not create branches, commits, PRs, Jira work, or a package release; those actions remain one final Release Marshal phase after every package passes.

## Real-usage hardening increment

The accepted usage audit in `docs/audits/2026-07-28-pumarejo-usage-feedback.md` is planned through:

9. `RDM-009-bounded-observation/2026-07-28-009-bounded-observation-work-package.md`
10. `RDM-010-observable-lifecycle/2026-07-28-010-observable-lifecycle-work-package.md`
11. `RDM-011-verifiable-interactions/2026-07-28-011-verifiable-interactions-work-package.md`
12. `RDM-012-actionable-setup-certification/2026-07-28-012-actionable-setup-certification-work-package.md`

RDM-009 and RDM-010 are independently plannable, but implementation remains serial under the current delivery policy. RDM-011 requires RDM-009; RDM-012 requires all three preceding hardening packages.
