# WC-016 — `properties.css` reserved mode keys `list`/`search` (TS-only opt-in; PHP has no per-mode component css)

- **Date:** 2026-07-10 (user-approved alongside the PHP-parity port of the
  list-mode css strip).
- **Shape before (PHP):** `build_structure_context_core`
  (class.common.php:1801-1846) treats a component's `properties.css` as one
  opaque selector-fragment map: emitted whole in edit/search/tm, nulled in
  list (`remove_edit_css`). A component therefore CANNOT carry list-mode css
  of its own — list styling only exists on the section_list child node or via
  the section-node `properties.css->{tipo}` override.
- **Shape after (TS):** `resolveEmittedPropertiesAndCss` +
  `resolveCssModeKeys` (resolve/structure_context.ts) reserve the top-level
  keys `list` and `search` on any winning css object (own, section_list
  child's, or override). Bare keys keep PHP semantics verbatim; `css.list` is
  emitted (alone) in list mode despite the strip, `css.search` overrides the
  bare set in search mode, and reserved keys never leak into another mode's
  emission. An object whose bare set is emptied by reserved-key removal emits
  null, not `{}`. A section-node override is never list-stripped (PHP replaces
  the already-nulled css — an override is deliberate any-mode styling).
- **Why:** most css add-ons are edit-oriented (the strip is right), but the
  hard mode-based rule leaves no per-component list channel. The reserved keys
  give a declarative opt-in with zero client changes (the client applies
  whatever `context.css` arrives; server-side resolution keeps the context
  core cache pure — mode is already in its key).
- **Coexistence risk (why this is ledgered):** a PHP engine serving a
  mode-keyed row emits the RAW object in edit mode — the PHP client's
  `set_element_css` renders the reserved keys as garbage-but-inert selectors —
  and strips it entirely in list. The feature is TS-engine-only until PHP
  adopts the same resolution. `list`/`search` are reserved words: a css object
  cannot use them as selector fragments anymore.
- **Gate reconciliation:** no differential reds — MEASURED 2026-07-10: zero
  css objects in dd_ontology carry a `list`/`search` key, so every live css
  emits byte-identically to PHP (pinned by
  `component_list_css_strip_differential` + the `css` field now compared in
  `context_differential`). TS ground truth pinned in
  `test/unit/structure_context_css.test.ts` (the WC-016 describe block: list
  opt-in over the strip, search override, no cross-mode leaks, `{}`
  byte-pass-through for bare objects, mode keys inside overrides and
  section_list child css).
