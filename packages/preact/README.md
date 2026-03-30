# @neo-reckoning/preact

Headless Preact hooks for calendar state management. Built on [@neo-reckoning/core](https://www.npmjs.com/package/@neo-reckoning/core) and [@neo-reckoning/models](https://www.npmjs.com/package/@neo-reckoning/models).

All hooks return data structures only. No DOM, no components, no CSS.

## Install

```
npm install @neo-reckoning/preact @neo-reckoning/core preact
```

If you want framework-neutral derived helpers without hooks, use `@neo-reckoning/models` directly.

This package also includes controlled selection hooks: `useDateSelection` for date-range picking and `useTimeSelection` for time-block picking.

See [examples/preact/](../../examples/preact/) for complete reference components built from those hooks.
