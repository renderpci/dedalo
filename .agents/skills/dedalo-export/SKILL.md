---
name: dedalo-export
description: The Dédalo v7 data export subsystem (tool_export) — the get_export_value atoms contract, the export_tabulator flat-table NDJSON protocol, the three data formats (value / grid_value / dedalo_raw) and breakdown modes, the value_with_parents / fill_the_gaps / show_tipo_in_label options, the client flat_table.js renderer + downloads, the drag-and-drop column model, and the per-user export presets (dd1781). Use when modifying tools/tool_export/ (class.tool_export.php, class.export_tabulator.php, js/render_tool_export.js, js/flat_table.js, js/drag_tool_export.js, js/export_user_presets.js, css/tool_export.less), core/dd_grid/class.export_*.php, any component get_export_value/get_raw_export_value, core/section/js/view_export_user_presets.js, or docs/core/exporting_data.md.
---

# Dédalo v7 data export

`tool_export` turns a section's filtered selection (the search SQO) into a flat
spreadsheet and streams it to the browser, where the same flat data drives a live
preview and the CSV / TSV / ODS / XLSX / HTML / media downloads. Three layers:
**atoms** (per-component data resolution) → **tabulator** (atoms → flat-table
NDJSON) → **flat_table.js** (accumulate + render + download).

The companion user/dev doc is `docs/core/exporting_data.md` — keep it in sync.

## Pipeline overview

1. Client builds `ar_ddo_to_export` (the chosen columns, **in user/DOM order**) and
   an export request; posts to `dd_tools_api` action `tool_request` →
   `tool_export::get_export_grid()`.
2. Server `setup()` validates options, then **forces `sqo->limit = 'ALL'`** so the
   export covers the whole filtered selection (the client gate
   `sanitize_client_sqo` otherwise clamps limits to `DEDALO_SEARCH_CLIENT_MAX_LIMIT`
   = 1000). This runs **after** the SEC-024 read-permission gate on `section_tipo`
   and every section_tipo in the sqo — not a gate bypass.
3. For each record, each selected ddo resolves to **export atoms** via
   `get_export_value()`; `export_tabulator` lays atoms onto stable columns and emits
   NDJSON lines.
4. `flat_table.js` accumulates lines, renders the preview `<table>` live as rows
   stream, and builds every download from the SAME accumulated data (WYSIWYG).

## The atoms contract (component layer)

`get_export_value(export_context) : export_value` — a flat list of `export_atom`
`{ path: export_path_segment[], value: scalar, cell_type }`. Relation components
recurse component-driven; the child's own segment carries `item_index` (the
traversed locator position), passed via `export_context->descend()`. Classes live
in `core/dd_grid/class.export_*.php` (loader-registered, NOT autoloaded).

- `get_raw_export_value()` is **final** — shares `build_raw_export_data()` with
  legacy `get_raw_value()` so the `dedalo_data` wire shape can't drift. **Never
  override it.**
- New components only need `get_export_value` if their shape differs from base.
- Flat-join parity reference is `export_value::to_flat_string()` (keeps the
  bug-for-bug `empty()` skipping); `get_value()` is now a `to_flat_string()` facade
  and base `get_grid_value()` an atoms→cell adapter.
- `cell_type` drives client rendering: `text` | `img` | `av` | `iri` |
  `section_id` | `json`.

## export_tabulator NDJSON protocol

`tools/tool_export/class.export_tabulator.php` is pure (label resolver injected;
`require_once`'d — tool dirs can't autoload siblings). Lines are discriminated by
field `t`:

- `meta` — `{t:'meta', v, data_format, breakdown, fill_the_gaps, section_tipo, total}`
- `col` — emitted on first use: `{t:'col', i (stable ordinal), key, group, path, label, ar_labels, cell_type, model, after (live-insert hint)}`. Labels are **server-resolved**.
- `row` — `{t:'row', rec (section_id/tm_id), sub (0..height-1), c:{ordinal:value,…}}` (sparse).
- `end` — `{t:'end', columns:[ordinal,…] (AUTHORITATIVE display order), rows, records}`.

Output column order = order the server encounters columns while processing
`ar_ddo_to_export`, so **client column order == ar_ddo_to_export order == user DOM
order**. `clean_text_value()` is the single text-cleanup chokepoint (was
client-side).

## Data formats (`data_format`, allowlisted; unknown → `value`)

- **`value`** (Standard): one flat value per cell; relation multi-values joined
  with the records separator.
- **`grid_value`** (Breakdown): relation items exploded into extra rows and/or
  `|n`-suffixed columns per the breakdown mode.
- **`dedalo_raw`** (Dédalo raw): each cell is the `get_raw_export_value()` payload
  `{"dedalo_data":<dato>}` (or `{dato,dataframe}` for dataframe-bearing values) —
  the **round-trip** format re-importable by `tool_import_dedalo_csv` (see
  [[dedalo-data-wrapper]], [[dedalo-import-data]]). `value_with_parents` is N/A here.

## Breakdown modes (`breakdown`, only meaningful for `grid_value`)

- **`default`** — first relation level → rows, deeper → `|n` columns (legacy parity).
- **`rows`** — max-aligned sibling axes; one extra row per relation item;
  `fill_the_gaps` repeats spanning (parent) values down the exploded rows (server-side).
- **`columns`** — per-segment `|n` suffixes, collision-free; one row per record.

## Options

- **`fill_the_gaps`** (default true) — repeat spanning values on exploded
  breakdown rows. Server-side.
- **`value_with_parents`** (default false; N/A for `dedalo_raw`) — relation
  components emit each locator target's **ancestor chain** as a sibling `#parents`
  sub-column (segment `sub_id='parents'`, ` > ` join) via
  `component_relation_common::get_locator_value(show_parents, include_self=false)` →
  `get_parents_recursive` + `ts_object::get_term_by_locator`. **Two granularities**:
  a global checkbox (all relation columns) OR a per-component checkbox on each
  selected export item (sets `value_with_parents` on that ddo). **Effective =
  global || ddo flag**, resolved in `get_record_atoms`. The per-item checkbox
  renders for the models in the JS `relation_models`/`PARENTS_MODEL` gate in
  `render_tool_export.js` (a mirror of `get_components_with_relations`; this gate is
  product-tunable — e.g. it has been narrowed to hierarchical autocomplete only).
- **`show_tipo_in_label`** — **client-only** label decoration (appends the ontology
  tipo to column headers in `flat_table.js`); not sent to the server.

## Client tool UI (`js/render_tool_export.js`, `js/drag_tool_export.js`)

- Layout (`get_content_data_edit`): left **components list** (draggable section
  components, nested relations expandable) → middle **`user_selection_list`** (the
  chosen columns, `self.user_selection_list`) → right **config column**
  (presets, format/breakdown selects, option checkboxes, Export button, download
  bar, preview).
- **Column model = DOM is the single source of truth.** Every add / sort / remove
  mutates the DOM, then calls `self.sync_ar_ddo_to_export()` which rebuilds
  `ar_ddo_to_export` from the DOM order of `.export_component` nodes (each node
  carries its `.ddo`). Do NOT reintroduce parallel index-math splices — that was the
  source of column-order drift (off-by-one in the insert-before path, stale/async
  indices across the four drop handlers). The method is on `render_tool_export`'s
  prototype and wired in `tool_export.js`.
- Working-state persistence: `ar_ddo_to_export` is cached per `target_section_tipo`
  in **IndexedDB** under id `tool_export_config` (`update_local_db_data`, restored in
  `get_content_data_edit`); `data_format` / `breakdown` live in **localStorage**
  (`selected_data_format_export`, `selected_breakdown_export`).
- Streaming: `data_manager.request_fetch_stream` → split on `\n` → `flat_table.process_line`. Resolve on `meta`; progress bar advances on `row` with `sub===0`.

## flat_table.js (client renderer)

Accumulates `{meta, cols:Map, order:[], rows:[], end}`. `render_table()` builds the
`<table class="export_flat_table">` (header `tr.row_header > th`, body `tr` / `tr.sub_row`).
Cells by `cell_type`: `img`/`av` → `<img class="export_media_thumb">` (multi joined by ` | `),
`iri` → `<a>`, else text. Downloads from the same data: `to_delimited(';',true)` (CSV,
RFC-quoted), `to_delimited('\t',false)` (TSV), `render_table({plain:true})` → sheetjs
(ODS/XLSX), HTML clone, media ZIP (`lib/client-zip`, quality picker per media model).

## Per-user export presets (mirrors search presets)

DB-backed named export configs, per user. Section **`dd1781`** reuses `dd623`'s
components: `dd624` name, `dd625` json (the config blob), `dd640` public, `dd641`
default, `dd642` section_tipo (preset scope), `dd654` user (→ `dd128`).

- `tools/tool_export/js/export_user_presets.js` — CRUD via `data_manager`
  (`build_export_config`/`apply_export_preset`, `load`/`create`/`save`/`delete`).
  The `dd625` blob = `{ ar_ddo_to_export, data_format, breakdown, fill_the_gaps,
  value_with_parents, show_tipo_in_label }`.
- `core/section/js/view_export_user_presets.js` — the list view (Apply / Edit /
  Delete), registered as case `export_user_presets` in `render_list_section.js`.
- **Gotcha**: `component_json` stores each entry **wrapped** as `{id, value:<config>}`.
  `load_export_preset` must **unwrap `.value`** (tolerating an already-unwrapped
  entry) — reading `entries[0]` directly yields the wrapper and applies an empty
  config (0 columns). Saving uses `set_data` with `[{value: config}]` (monovalue,
  no duplication). Working-state stays in IndexedDB; only named presets go to DB.
- No new PHP/API — all preset CRUD rides standard `data_manager` actions + normal
  section/component permissions. See [[search-architecture-sqo]] for the search
  preset twin (`dd623`/`dd655`).

## CSS

`tools/tool_export/css/tool_export.css` is a **committed clean-css artifact** with a
LESS→`var(--token)` pipeline; a project watcher recompiles `.less` on save. Edit the
`.less` only and let the watcher rebuild `.css`/`.css.map` (the old clean-css version
is not byte-reproducible by hand). Theme-aware rule: the grey scale **inverts** under
`:root[data-theme="dark"]` (`grey_16` light↔dark, `grey_4` dark↔light), so pair
`@color_grey_16` (surface) with `@color_grey_4` (text) for both themes. The result
table uses a sticky purple header, a frozen first (id) column (`position:sticky;left:0`
with opaque cell backgrounds so zebra/hover still mask), zebra striping, and the tool
accent `--tool_export: #7152a5`. Minifier caveat: avoid negative-margin shorthands —
clean-css mangled `margin:0 -1em …` to invalid `margin:0-1em`.

## API surface

`tool_export::API_ACTIONS = ['get_export_grid' => null]` (SEC-024 allowlist).
Request fields: `section_tipo`, `model:'section'`, `data_format`, `breakdown`,
`fill_the_gaps`, `value_with_parents`, `ar_ddo_to_export`, `sqo`, `ndjson_stream`.
Returns the flat table (non-stream) or streams NDJSON.

## Key files

- `tools/tool_export/class.tool_export.php` — `setup`, `get_export_grid`, `get_records`, `get_record_atoms`, streaming.
- `tools/tool_export/class.export_tabulator.php` — atoms → NDJSON, breakdown logic, `clean_text_value`.
- `core/dd_grid/class.export_*.php` — `export_value`, `export_atom`, `export_path_segment`, `export_context`.
- `tools/tool_export/js/{tool_export,render_tool_export,drag_tool_export,flat_table,export_user_presets}.js`, `css/tool_export.less`.
- `core/section/js/view_export_user_presets.js`, `render_list_section.js` (view registration).

## Gotchas

- Column order bugs = parallel index math drifting from DOM. Always derive
  `ar_ddo_to_export` from the DOM (`sync_ar_ddo_to_export`).
- `build_export_component` is `async` with a synchronous body; sequential drops keep
  order via microtask FIFO, but don't rely on `.then` ordering for correctness — sync
  from the DOM after the mutation.
- `dedalo_raw` cells must NOT wrap `component_section_id` (plain int, the record key)
  nor null datos; the wrapper is recognized only when `dedalo_data` is the SOLE key.
- Export presets: unwrap the `component_json` `{id,value}` entry on load.
- Edit the `.less`, never the `.css` directly (watcher artifact).

## Tests

- `test/server/tools/tool_export_Test.php`, `export_tabulator_Test.php`,
  `test/server/components/export_value_parity_Test.php` (atoms flat-join parity),
  `test/server/dd_grid/grid_value_snapshot_Test.php` (self-priming JSON snapshots —
  delete to re-baseline intentionally). `test3` is thesaurus-shaped; reset
  `ts_object::$term_by_locator_data_cache` after seeding terms.
- Round-trip invariant lives in import tests
  (`test_import_files_raw_export_round_trip`): a `dedalo_raw` export re-imported must
  reproduce the exact datos. Run: `vendor/bin/phpunit -c test/server/phpunit.xml test/server/tools`.
