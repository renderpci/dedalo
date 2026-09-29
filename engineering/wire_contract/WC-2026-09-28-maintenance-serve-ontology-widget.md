# WC-2026-09-28-maintenance-serve-ontology-widget — `serve_ontology` split out of `update_ontology` (TS-only widget; `update_ontology` panel loses `serving`)

- **Date:** 2026-09-28.
- **Shape before (TS):** the `update_ontology` `get_widget_value` panel carried
  `serving: { enabled, has_server_code, cors_enabled, url }` beside `servers`,
  `current_ontology`, … (a TS-only key; PHP never had it). The client rendered it
  as a collapsed note inside the pull panel.
- **Shape after (TS):**
  - `update_ontology` panel: `serving` is GONE; every other key unchanged.
  - the maintenance catalog gains `id: 'serve_ontology'`, category `config`,
    label key `serve_ontology`, right after `update_ontology` in
    `CORE_WIDGET_MODULES`. Its `get_widget_value` panel is exactly the old
    `serving` object at the top of `data`:
    `{ enabled, has_server_code, cors_enabled, url }`. The access code is never
    echoed, only whether one is set.
- **Reason:** pulling (consumer, destructive) and serving (provider, read-only
  configuration) are different roles for different installations. On a master the
  serving readout — its primary concern — sat folded under an overwrite action it
  never runs. One widget per role; one home for the readout.
- **DISPLAY-ONLY:** no `apiActions`; nothing new reachable from the wire,
  `update_ownership_tripwire` has nothing to classify.
- **Gate reconciliation** (the WC-018 / WC-035 TS-only pattern):
  - `test/parity/widgets_differential.test.ts` — `serve_ontology` joins
    `TS_ONLY_WIDGET_IDS`.
  - `test/parity/dedalo_files_differential.test.ts` — the client tree
    `/dedalo/core/area_maintenance/widgets/serve_ontology/` joins `isTsOnlyEntry`.
  - TS ground truth: `test/unit/serve_ontology_widget.test.ts` (renamed from
    `update_ontology_panel_serving.test.ts`) — registration, display-only, each
    flag tracks its key in a real subprocess boot, the code is never echoed, and
    the `update_ontology` panel no longer carries `serving`.
- **Labels:** `update_ontology_serve_*`, `update_ontology_state_*` and
  `update_ontology_endpoint_register` renamed to `serve_ontology_*` (translations
  carried); `serve_ontology_body` drops the old "This panel PULLS…" lead sentence.
- **Fixture interaction (DEC-14b):** NO re-harvest; the frozen PHP-side fixtures
  never contained `serving` nor this id.
