# WC-063 — TS-native core client files absent from the frozen oracle census (2026-07-29)

ADDITIVE, no PHP counterpart. Five `client/dedalo/core/` files exist only in the
TS `get_dedalo_files` census:

- `core/page/js/design.js` + `core/page/js/design-init.js` — the design-line
  toggle (classic / redesign), a TS-era client feature;
- `core/common/js/session_expiry.js` — the idle-session countdown client
  (behaviour ledgered under WC-051; the FILE is censused here);
- `core/search/js/preset_scope.js` — the search-preset scope panel (dd623
  presets, a TS-era feature);
- `core/search/js/render_semantic.js` — the semantic-search (RAG) results
  rendering, TS-native by definition.

Handled like WC-013/WC-019: `isTsNativeCoreFileEntry` in
`test/parity/dedalo_files_differential.test.ts` filters them from BOTH sides of
the set compare; the every-TS-url-resolves gate still proves they serve.
