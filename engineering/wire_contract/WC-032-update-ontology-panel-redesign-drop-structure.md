# WC-032 — `update_ontology` panel redesign: drop `structure_from_server`, fold the dead client surfaces, JSON-body probe

- **Date:** 2026-07-16 (post-cutover; PHP is decommissioned dead code).
- **Why:** the panel had accreted dead weight. `STRUCTURE_FROM_SERVER` is a
  legacy config flag nothing reads; two sub-panels (`rebuild_lang_files`,
  `export_to_translate`) are `engineDenied` in v7 (no generated JS lang files —
  labels are DB-derived; the CSV workflow is unported); and the response area
  dumped the whole envelope twice.
- **Shape after (TS):** the `update_ontology` `get_value` envelope DROPS the
  `structure_from_server` key. Remaining keys: `servers` (probed),
  `current_ontology`, `active_ontology_tlds`, `body`, `confirm_text`. This
  SUPERSEDES the `structure_from_server` entry in the WC-023 / WC-028 byte
  lists. No frozen parity fixture ever carried `structure_from_server`, so the
  pinned oracle-harvest store is untouched.
- **Probe/manifest transport:** `checkRemoteServer` now POSTs a JSON body (the
  TS API parses `request.json()` and 400s a form body, matching the vendored
  client's `data_manager.request`). PHP's `check_remote_server` posted
  `rqo=`-form-encoded because the PHP server read `$_POST['rqo']`; against a TS
  master that made the readiness probe read back "Invalid JSON body", so the
  panel disabled every TS master's radio. This is a deliberate divergence from
  the PHP form encoding.
- **Client (TS-owned, same commit):** `render_update_ontology.js` rebuilt around
  the one working action (master pull → overwrite), on the shared `widget_kit`
  vocabulary. It no longer renders the `STRUCTURE_FROM_SERVER` /
  `ACTIVE_ONTOLOGY_TLDS` "Config" grid (WC-028's config-grid row is GONE; the
  active-TLDs value survives only as the form input's default), the raw
  current-ontology JSON dump, the duplicated response, or the always-open JSON
  envelope, and it drops the `rebuild_lang_files` / `export_to_translate`
  panels. Those two REMAIN `engineDenied` server actions — the wire is
  unchanged, only the UI stopped surfacing dead buttons.
- **Gates:** `test/unit/ontology_ingest.test.ts` (the JSON-body probe
  regression + the recovery-snapshot / counter `\copy`/`-c` interpolation
  regressions); `test/unit/engine_denied_boundary.test.ts` (the two folded
  actions stay denied server-side). The panel `get_value` shape has no automated
  fixture (no live oracle post-cutover); the drop is verified by absence — no
  test or fixture asserts `structure_from_server`.
