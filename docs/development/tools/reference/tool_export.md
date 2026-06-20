# tool_export

Atoms-based export of a section's records to a flat table (CSV / TSV / ODS / XLSX / HTML / preview / media), streamed over the export_tabulator NDJSON protocol.

## What it does / why & when to use it

`tool_export` turns the **whole current selection** of a section into a spreadsheet-style flat table — the user picks which components become columns, in what order, and how relations and hierarchies are flattened. Because Dédalo stores highly structured data (multi-language values, relations to lists and thesauri, hierarchies, dataframes), exporting is never a plain dump: the tool lets a person shape the output for the job at hand.

Concrete heritage scenario: a numismatics cataloguer has filtered the *Coins* section down to the issues of one mint and wants a report for a colleague. They open the tool on that filtered list, drag the *Inventory number*, *Weight*, *Diameter* and the related *Mint → name* into the active columns, choose **Breakdown / rows** so each linked type lands on its own row, tick **parents** on the type column to also get the term's ancestor chain, run the export, and download an XLSX. The same configuration can be saved as a named preset for the next batch.

A second, machine-facing use: the **Dédalo (Raw)** format produces cells wrapped as `{"dedalo_data":…}` that the [CSV import tool](tool_import_dedalo_csv.md) re-imports byte-for-byte (round-trip) — a practical way to back up a section or move data between installations.

Use it when: someone needs section data as a spreadsheet/report, a re-importable backup, or the media files referenced by a record set. Do not use it for single-record edits or for tabular *editing* — it is read-only export.

## How it works (server + client)

The pipeline is **atoms based**. Per record and per chosen column (ddo), each component returns a flat list of scalar export *atoms* whose structured paths carry column identity and relation-item indexes (`core/dd_grid/class.export_value.php`). `export_tabulator` (`tools/tool_export/class.export_tabulator.php`) converts those atoms into a flat table — a column manifest plus sparse, ordinal-keyed cell rows — emitted as NDJSON protocol lines that the client renders verbatim. CSV/TSV/preview all share the same flat data (WYSIWYG).

**Server** (`class.tool_export.php`):

- `get_export_grid(options)` is the single API entry point. It runs the read-permission gate, builds a `tool_export` instance, calls `setup()`, then either streams (`ndjson_stream:true`) or returns the whole grid.
- `setup()` normalizes options against allowlists (`data_format` → `value|grid_value|dedalo_raw`, falling back to `value`; `breakdown` → `default|rows|columns`), merges any saved session `filter` for the section's SQO, and **forces `sqo->limit = 'ALL'`, `offset = 0`** — the export deliberately serialises the entire filtered selection (subsetting is done via the SQO filter, not the page limit). This is safe because the read gate already ran and the stream clears caches + GCs every 100 records.
- `iterate_export_lines()` is the single source of the protocol lines (`meta`, `col*`, `row*`, `end`); `stream_export_grid()` echoes them as NDJSON, `build_export_grid()` drains them into one in-memory object, and tests consume the generator directly.
- `get_record_atoms()` resolves one record: for each direct-child column ddo it instantiates the component, passes the descendant ddo chain as an `export_context->ddo_map`, and calls `get_export_value()` (or `get_raw_export_value()` for `dedalo_raw`). Time-machine selections (`sqo->mode === 'tm'`) are handled by reading dd15 TM rows through `tm_record`.

**Client** (`tools/tool_export/js/`): `tool_export.js` is the instance; `render_tool_export.js` builds the three-pane UI (left = available components, center = active columns, right = config + preview); `drag_tool_export.js` is the drag-and-drop column model; `flat_table.js` accumulates the NDJSON lines into the live preview and produces the downloads; `export_user_presets.js` manages per-user presets (ontology section **dd1781**). The client fetches via `data_manager.request_fetch_stream` with `ndjson_stream:true` and resolves as soon as the `meta` line arrives, then keeps filling rows with a progress bar. The tool opens in its own window (`properties.open_as = "window"`).

## Actions & options

`API_ACTIONS = ['get_export_grid' => null]` — a single action, declared with a `null` gate (list-style membership) because the permission check is **imperative inside the method**: it must accept legacy `tipo` callers (`section_tipo ?? tipo`) and assert read permission both on the requested `section_tipo` **and** on every `section_tipo` named in the SQO, which the declarative map gate cannot express.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_export_grid` | imperative: `security::assert_section_permission(section_tipo, 1)` + `assert_section_array_permission(sqo->section_tipo, 1)` | no | see below |

Key options read by `get_export_grid` / `setup`:

| Option | Type | Meaning |
| --- | --- | --- |
| `section_tipo` | string (req.) | Target section to export. Falls back to `tipo` for legacy callers. Read-gated. |
| `model` | string | Element model; defaults to `'section'`. |
| `data_format` | string | `value` (default, one flat cell per column) \| `grid_value` (breakdown) \| `dedalo_raw` (round-trip wrapper). Unknown values fall back to `value`. |
| `breakdown` | string | Relation explosion for `grid_value`: `default` \| `rows` \| `columns`. Defaults to `default`. |
| `fill_the_gaps` | bool | Repeat spanning (record-level) values on each exploded row. Default `true`. |
| `value_with_parents` | bool | Add a sibling column with the ancestor chain of relation/hierarchical targets. Default `false`; can also be set per column via `current_ddo->value_with_parents`. N/A for `dedalo_raw`. |
| `ar_ddo_to_export` | array (req.) | The chosen columns, **in output order** (= the order of the *Active elements* list / the user's drag order). Stored internally as `ar_ddo_map`. |
| `sqo` | object (req.) | Search query object = the selection to export. Server forces `limit='ALL'`, `offset=0`. |
| `ndjson_stream` | bool | `true` → stream the NDJSON flat-table protocol and `exit()`; `false`/absent → return the whole grid in `response->result`. |

Response (non-stream): `{ result: {meta, columns, rows, end} | false, msg }`.

## How it is registered & surfaced

`tools/tool_export/register.json` is a **legacy v6** file (raw record dump with `components`/`relations` keys); it is auto-converted at registration by `tools_register` (the `components` key triggers the v6 converter). The essentials it carries:

- `dd1326` name = `tool_export`; `dd1327` version (`2.0.3`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer.
- `dd1330` affected_models = `["section"]` → the tool attaches to **sections**.
- `dd1331` show_in_inspector = `false` and `dd1332` show_in_component = `false` (it is a section-toolbar tool, not an inspector/inline-component button).
- `dd1335` properties = `{ "open_as": "window", "windowFeatures": null }` → opens in its own window.
- `dd1372` labels supply the localized UI strings for the `fill_the_gaps` and `show_tipo_in_label` options across project languages.

Surfacing (in `common::get_tools()`): because `affected_models` is `["section"]`, the **Export** button appears on sections in **list** mode. There is one core special-case worth noting — for the time-machine section (`DEDALO_TIME_MACHINE_SECTION_TIPO`, dd15) `tool_export` is the **only** tool allowed (`core/common/class.common.php`), which is what enables time-machine exports.

## Examples

Client-side `tool_request` (built by `tool_export.js::get_export_grid`, sent through `dd_tools_api`):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'get_export_grid'), // → tool_export::get_export_grid
    prevent_lock : true,
    options : {
        section_tipo       : 'rsc167',      // the section being exported
        model              : 'section',
        data_format        : 'grid_value',  // breakdown
        breakdown          : 'rows',        // one row per related item
        fill_the_gaps      : true,
        value_with_parents : true,          // add ancestor-chain columns
        ar_ddo_to_export   : [ /* chosen columns, in output order */ ],
        sqo                : self.sqo,       // the current filtered selection
        ndjson_stream      : true           // stream the NDJSON protocol
    }
}
const stream = await data_manager.request_fetch_stream({ body: rqo })
```

The server emits NDJSON, one JSON object per line, discriminated by `t`:

```text
{"t":"meta","section_tipo":"rsc167","total":128,"data_format":"grid_value","breakdown":"rows", ...}
{"t":"col","i":0,"key":"...","label":"Inventory number","cell_type":"text", ...}
{"t":"row","rec":12,"sub":0,"c":{"0":"NM-0001","1":"7.21"}}
{"t":"end","columns":[0,1,2],"rows":340,"records":128}
```

Raw round-trip cell shape (`data_format:'dedalo_raw'`), re-importable by the CSV import tool:

```json
{"dedalo_data":[{"value":"Hello","lang":"lg-eng","id":1}]}
```

## Related

- [Exporting data](../../../core/exporting_data.md) — the end-user + developer guide for this tool (UI walkthrough, formats, breakdown, presets, NDJSON protocol, component `get_export_value` contract).
- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) — consumes the `dedalo_raw` export for the round-trip; see [Importing data](../../../core/importing_data.md).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS`, gates and lifecycle this page builds on.
- Source: `tools/tool_export/class.tool_export.php`, `class.export_tabulator.php`, `core/dd_grid/class.export_*.php`, `tools/tool_export/js/{tool_export,render_tool_export,flat_table,drag_tool_export,export_user_presets}.js`.
