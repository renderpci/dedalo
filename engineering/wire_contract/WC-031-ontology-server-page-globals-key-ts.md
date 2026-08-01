# WC-031 — `is_ontology_server` page_globals key (TS-only) drives the ontology-master client skin

- **Date:** 2026-07-16.
- **Shape:** `buildPageGlobals` (`src/core/resolve/environment.ts`) emits a new
  boolean `is_ontology_server` (from `config.ontologyIo.isOntologyServer`,
  i.e. the `IS_AN_ONTOLOGY_SERVER` install flag). PHP `get_page_globals` has
  NO twin — the flag was server-only in the oracle (fail-closed manifest gates,
  never surfaced to the UI). Emitted UNCONDITIONALLY (like `maintenance_mode`
  and the `DEVELOPMENT_SERVER` plain_var), so the pre-auth login form is marked
  too; it is not reconnaissance-sensitive (reveals only "this install is an
  ontology master", not DB name / engine version).
- **Client effect:** `page.js` `set_custom_css()` adds `body.is_ontology_server`
  when the flag is truthy; `page/css/layout/ontology_server.less` (imported by
  `main.less`) then skins the whole app in the existing ontology teal
  (`--color_green_ontology`, `#276f67`): a fixed top edge band, a persistent
  `ONTOLOGY SERVER` corner badge, and a tinted menu bar (activating the
  dormant `.menu > .content_data.master` intent that never had a JS wire). No
  server HTML change — the index.html shell stays byte-static (client_serving).
- **Gate reconciliation:** `test/parity/environment_differential.test.ts`
  (page_globals key-set test) asserts the key is present TS-side / absent
  PHP-side, then deletes it from the TS copy before the exact key-set compare —
  the WC-003 (`DEDALO_DIFFUSION_API_URL`) pattern.
