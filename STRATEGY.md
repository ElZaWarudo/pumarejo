---
name: pumarejo
last_updated: 2026-10-07
---

# pumarejo Strategy

## Intent

Give coding agents access to the whole Tauri app so they can understand it, without flooding their context.

## Target problem

Tauri developers who work with coding agents cannot let the agent see and use the running app without handing over the desktop, and the tools that do give access return page dumps far larger than the agent's context can afford.
Without the app in view, the agent misreads flows and proposes changes that don't fit what users actually see.

## Our approach

A small bridge between a debug build of any Tauri 2 app and any MCP-capable agent.
The agent observes and operates WebView components through exact element references, never through the system mouse or keyboard.
Every result is sized for an agent's context: an outline of the whole screen first, detail only for the region the agent asks about, and only what changed after each action.

## Who it's for

**Primary:** Tauri developers who work with coding agents and keep using their own desktop while the agent explores the app.

## Key metrics

- **Context cost** - Tokens an agent spends to observe a screen and to complete a reference journey. Lower is better.
- **Whole-app reach** - Share of a reference app's screens and controls the agent can reach and name through pumarejo alone.
- **Flow comprehension** - Share of reference flows the agent describes correctly after exploring.
- **Usable sessions** - Share of launches that reach a first snapshot.
- **Desktop interruptions** - Sessions that take focus or inject system input. Target: zero.

## Principles

- Overview first, detail on demand: a result names the ref that expands anything it leaves out.
- Report changes, not whole screens, after an action; refs of surviving elements stay valid.
- A small tool set with instructions delivered at connect time.
- Application content is data, never instructions.

## Not working on

- Desktop control or system mouse and keyboard injection.
- Exploration logic inside the server; the agent decides where to go.
- A QA platform: test recording, assertions, fixtures, mocks, or log streaming.
- Arbitrary JavaScript, selector, or IPC passthrough.
- A persistent app map; the agent's own context and memory hold what it learned.
- Certified support for macOS, other Linux distributions, or concurrent sessions.
