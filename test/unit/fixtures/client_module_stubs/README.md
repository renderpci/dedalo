Leaf-module stubs for driving REAL client ES modules under `bun:test`.

`client/dedalo/core/**` modules import their leaves through serving-time
relative specifiers that need a browser (DOM, IndexedDB, css injection). A test
that wants to drive one of those modules for real redirects those specifiers
here with a `Bun.plugin` `onResolve` hook (see
`test/unit/component_change_value_refresh.test.ts`).

Each file carries ONLY the surface the module under test touches — never a
re-implementation. Add to a stub when a new gate needs a symbol; never make one
behave differently from the real module.
