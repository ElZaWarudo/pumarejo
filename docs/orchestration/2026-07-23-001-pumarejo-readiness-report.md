---
title: pumarejo Readiness Report
status: blocked
date: 2026-07-23
---

# pumarejo Readiness Report

## Context Found

| Source                              | Contribution                                                                                                                                                               | Confidence |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| User request and session attachment | Defines the product identity: an independent, reusable npm package (`pumarejo`) that instruments Tauri 2 applications and exposes observation and interaction through MCP. | High       |
| User request and session attachment | Proposes an initial architecture with a CLI (`init`, `doctor`, `remove`), MCP server, WebDriver client, Tauri process management, and installer.                           | High       |
| User request and session attachment | Proposes consumer integration using `tauri-plugin-wdio-webdriver`, debug-only registration, a capability permission, and `.pumarejo.json`.                                 | Medium     |
| User request and session attachment | Proposes the minimum MCP tools: `launch`, `snapshot`, `screenshot`, `click`, `type`, `press_key`, and `close`.                                                             | High       |
| Working directory                   | The directory is empty and is not yet a Git repository; there is no code, manifests, documentation, CI, or local conventions to verify.                                    | High       |

## Missing Context

- **Product intent:** Prioritized users/personas, canonical use cases, measurable first-version success criteria, and binding non-goals are missing.
- **Current system shape:** As a new project, there is no technical foundation; the proposed architecture still needs to become accepted decisions about modules, session lifecycle, the error model, and boundaries among CLI, MCP, WebDriver, and the Tauri process.
- **Technical execution context:** Supported Node.js, Tauri, Rust, and operating-system versions are missing, as are the package format, build strategy, version manager, lint/test/build commands, and compatibility policy.
- **Data/interface context:** Final CLI contracts, MCP tool input/output and error schemas, `ref` semantics and validity, multi-window behavior, configuration, and `.pumarejo.json` validation rules are missing.
- **Delivery context:** The Git repository, base branch, branch and PR conventions, CI, npm publication, available name/scope, versioning, changelog, and release policy are missing.
- **Existing scope context:** The attachment proposes a first version but does not distinguish mandatory requirements from candidate ideas or provide an accepted backlog with dependencies and acceptance criteria.

## Why Roadmap Generation Is Unsafe

- Choosing which tools and commands belong in the first increment without success criteria or non-goals would turn a technical proposal into invented product scope.
- The MCP contract determines session, snapshot, reference, and error architecture; planning modules and dependencies before fixing it could create disposable or incompatible work.
- The platform and version matrix changes the process, port, WebDriver, testing, and CI strategy, so it also changes roadmap order.
- Without a publication strategy and Git/CI workflow, it is unsafe to propose independently integrable branches, reviewable packages, and PRs.
- The `tauri-plugin-wdio-webdriver` integration is described as a technical recommendation but must be validated against target versions and platforms before becoming a product contract.

## Blocking Questions

- Who will use v1, and which three flows must work end to end?
- Which observable criteria determine that v1 is complete, and what is explicitly excluded?
- Which minimum Node.js, Tauri 2, and Rust versions and which platforms must be supported?
- What are the final contracts for CLI commands, MCP tools, configuration, sessions, references, and errors?
- How will the package be tested and published, and which Git/CI/release conventions must it follow?
- Which parts of the attachment are accepted requirements, and which remain hypotheses to validate?

## Recommended Documents

- Create `STRATEGY.md` with the problem, users, outcomes, success criteria, v1 scope, non-goals, and constraints.
- Create `docs/product-requirements.md` with canonical flows, functional and non-functional requirements, and acceptance criteria.
- Create `docs/architecture.md` with module boundaries, process and session lifecycle, ports, platforms and versions, and WebDriver decisions.
- Create `docs/contracts.md` with CLI, MCP, configuration, error, snapshot, reference, and multi-window contracts.
- Create `docs/delivery-workflow.md` with Git, CI, testing, npm publication, versioning, and releases.

## Exact Next Prompt

```text
Use compound-engineering:ce-brainstorm to draft pumarejo's STRATEGY.md from docs/orchestration/2026-07-23-001-pumarejo-readiness-report.md and the attached brief; resolve users, outcomes, success criteria, v1 scope, non-goals, platforms and versions, and constraints without implementing code.
```
