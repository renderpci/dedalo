# WC-034 — label catalog cleanup: renames to English keys, tool-local migration, unused removal

- **Date:** 2026-07-16 (follows WC-033 the same day; the catalogs are repo-owned,
  so this is a catalog content edit, not a serving-shape change).
- **Why:** the key list had grown organically for years: Spanish-named keys
  (`buscar`, `seccion`), typos (`erors_found`, `invalid_componet`,
  `rebuild_constraits`, `are_you_sure_to_delete_refrence`), singular/plural
  twins under two spellings (`anyo`/`year`), tool-specific strings parked in
  the global namespace, and a large dead tail (~35 `tool_*` display names
  duplicating the tools' own register labels, retired feature strings).
- **Shape after (TS):** master went 686 → 413 keys. THE MAP IS MACHINE-READABLE:
  `test/parity/wc034_label_cleanup.json` — 28 renames (references updated across
  client/src/tools/install; merges into existing English keys keep the target's
  translations and adopt the source's for missing langs), 21 tool-local
  migrations, 240 removals. The `get_label` wire SHAPE is unchanged; only the
  key census. The client mdcat widget now uses the same `year/years/month/...`
  keys as its server twin (`sum_dates.ts`), which already expected them.
- **Removal safety (how "unused" was proven):** a key was removed only if it had
  (1) no static reference anywhere in client/src/tools/install (`get_label.x`,
  `get_label['x']`, widget label rules, server `labels.x`); (2) no reachability
  from any of the 14 dynamic `get_label[expr]` sites — each was enumerated
  (tool_assistant `t()` literals, media_versions action names, tool_diffusion
  `add_button` keys, search `$and/$or`), and the two data-driven sites (state
  and calculation widgets) plus `search_operators.ts`'s wire {operator →
  label-key} map were covered by a full-DB scan (every matrix table +
  dd_ontology minus the inert `model='label'` rows themselves) — 22 DB-hit keys
  kept conservatively; (3) no other repo occurrence except confirmed word
  coincidences. Both data-driven sites degrade gracefully on foreign installs
  (`get_label[x] || x`).
- **Tool-local migration (21 keys, 9 tools):** keys used by exactly ONE tool and
  tool-specific in meaning (export column toggles, subtitles player controls,
  import-files naming modes, …) moved into that tool's `register.json`
  `misc.dd1372` labels (translations carried from the catalogs) and the tool JS
  switched `get_label.x` → `self.get_tool_label('x')`; every site keeps its
  English `|| 'literal'` fallback, so the change is safe even BEFORE an install
  re-runs the *Register tools* maintenance widget (required for the DB
  `matrix_tools` rows to pick the new labels up). Genuinely generic vocabulary
  used by one tool today (`error`, `print`, `upload`, `now`, …) stays global,
  as do `conform_headers`/`rotate` (reached via the media_versions dynamic
  action lookup on the GLOBAL dictionary).
- **Gate reconciliation:** `environment_differential` get_label asserts every
  ORACLE key is served with the oracle value, OR renamed per the map (new key
  asserted present), OR ledger-removed (and asserts a removed key is NOT
  served). The WC-033 dup-name fixes ride the same map
  (`no_hay_etiqueta_seleccionada` → `no_tag_selected`; `tool_watermark`
  removed). `labels_tripwire` unchanged and green — it enforces the cleaned
  census going forward.

## Addendum 2026-08-19 — two "unused" removals were live: `search_options`, `literal` RESTORED

- **What:** the removal proof (static reference scan) missed one DYNAMIC site —
  `src/core/search/search_operators.ts` resolves `search_options` (the tooltip
  heading) and `literal` (a `component_number` operator label) through the
  labels map at request time. Both keys were removed here as unused, so from
  2026-07-16 every search-mode component shipped
  `<b><mark>search_options</mark>:</b>` to the browser (PHP
  `decorate_untranslated` fallback). Measured 2026-08-18 as 8 red assertions in
  `section_elements_context_differential` (fixtures mode); invisible to the unit
  tier because `test/unit/search_operators.test.ts` hand-injected the key.
- **Shape after:** both keys are back in `master.json` and in every catalog that
  carried them before this WC (values recovered from commit `9bf8463882^`);
  removed from the machine-readable map's `removals` (240 → 238). Wire shape
  unchanged; the served VALUE of `search_options_title` is the translation again.
- **Gate:** `search_operators.test.ts` now carries a SERVED-CATALOG contract —
  every key the module resolves must exist in the master catalog, with
  `strict_different_from` as the one pinned parity exemption (PHP never had it
  either). Red without the restore, green with it.
