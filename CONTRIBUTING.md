# Contributing to daywatch-cal

Thanks for contributing! This guide covers setup, commands, and workflow conventions.

> For agents: this is the canonical command reference for repo workflows.

## Prerequisites

- Node 20+
- Yarn 4 (pinned via `packageManager`)

This repo uses `nodeLinker: node-modules` in `.yarnrc.yml`.

## Build and test

Always run commands from the repo root through Yarn wrappers.

| Task | Command |
|---|---|
| Build everything | `yarn build` |
| Run all tests | `yarn test` |
| Typecheck everything | `yarn typecheck` |
| Lint everything | `yarn lint` |

### Single-package iteration

Use package scripts via `yarn workspace`:

| Need | Command |
|---|---|
| Core tests | `yarn workspace @daywatch/cal test` |
| Models tests | `yarn workspace @daywatch/cal-models test` |
| Rules tests | `yarn workspace @daywatch/cal-rules test` |
| React adapter tests | `yarn workspace @daywatch/cal-react test` |
| Preact adapter tests | `yarn workspace @daywatch/cal-preact test` |
| Solid adapter tests | `yarn workspace @daywatch/cal-solid test` |
| iCal adapter tests | `yarn workspace @daywatch/ical test` |
| MCP server tests | `yarn workspace @daywatch/mcp test` |

## Never

- Do not use `npm` in this repo.
- Do not invoke bare `turbo` in normal workflows; use `yarn build/test/typecheck/lint`.
- Prefer `yarn workspace ... test` over direct `vitest` invocation for package work.

## Commit conventions

Commits in this repo use an emoji-prefixed summary (check `git log` for current style).

Common prefixes:

- ✨ feature
- 🐛 bug fix
- ♻️ refactor
- 🧹 chore
- 📝 docs
- ✅ tests
- 🔧 config/tooling
