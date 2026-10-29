---
'@daywatch/ical': patch
---

Resolve `rrulestr` through whichever export the runtime provides, so `RRULE`s with `INTERVAL` > 1 load under both Node ESM (named export only on the CJS interop default) and Bun strict resolution (named export on the namespace, including `bun build --compile`).
