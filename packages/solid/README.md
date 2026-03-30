# @neo-reckoning/solid

Reactive Solid primitives for calendar state management. Built on [@neo-reckoning/core](https://www.npmjs.com/package/@neo-reckoning/core) and [@neo-reckoning/models](https://www.npmjs.com/package/@neo-reckoning/models).

This package exposes idiomatic `create*` helpers backed by Solid's reactive system.

## Install

```
npm install @neo-reckoning/solid @neo-reckoning/core solid-js
```

If you want framework-neutral derived helpers without reactive wrappers, use `@neo-reckoning/models` directly.

This package also includes `createDateSelection` and `createTimeSelection` for controlled date-range and time-block interactions.

See [examples/solid/](../../examples/solid/) for complete reference components built from those primitives.
