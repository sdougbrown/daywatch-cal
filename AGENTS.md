# daywatch-cal Contributor Guide

`AGENTS.md` is the canonical repo-level instruction file for architecture and behavior constraints.

## Repo shape

- daywatch-cal is a headless calendar computation toolkit, not a UI component library.
- Root workspaces are `packages/*` plus `examples/sandbox`.
- Published packages include: `@daywatch/cal`, `@daywatch/cal-rules`, `@daywatch/cal-models`, `@daywatch/cal-react`, `@daywatch/cal-preact`, `@daywatch/cal-solid`, `@daywatch/ical`, `@daywatch/mcp`.

## Build and test

- Canonical command/workflow reference lives in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Quick root commands: `yarn build`, `yarn test`, `yarn typecheck`, `yarn lint`.
- Use Yarn wrappers; do not use `npm`.

## Architecture

- `@daywatch/cal` owns core range evaluation and calendar computation primitives.
- `@daywatch/cal-rules` owns ingress validation policy for `DateRange` inputs.
- `@daywatch/cal-models` owns framework-neutral derived models and controllers built on core.
- React/Preact/Solid packages are thin adapter layers over core/models.
- `@daywatch/ical` and `@daywatch/mcp` are ingestion/integration surfaces.

## Behavior to preserve

- Keep this library headless: no DOM, styling, or rendering assumptions in computation packages.
- Preserve `DateRange` semantics and recurrence behavior in `@daywatch/cal` unless a change is intentional and documented.
- Keep adapter packages thin and avoid re-implementing core logic in framework wrappers.
- Treat `@daywatch/cal-rules` as canonical input-validation policy, not per-consumer ad hoc checks.

## Contributor notes

- ESM-only TypeScript with `.js` import extensions in TS files.
- Use `import type` / `export type` where appropriate.
- Prefer narrow, package-scoped changes over cross-package refactors.
