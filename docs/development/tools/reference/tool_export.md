# tool_export

Atoms-based export of a section's records to a flat table (CSV / TSV / ODS / XLSX / HTML / preview / media), streamed over the export_tabulator NDJSON protocol.

## What it does / why & when to use it

`tool_export` turns the **whole current selection** of a section into a spreadsheet-style flat table — the user picks which components become columns, in what order, and how relations and hierarchies are flattened. Because Dédalo stores highly structured data (multi-language values, relations to lists and thesauri, hierarchies, dataframes), exporting is never a plain dump: the tool lets a person shape the output for the job at hand.

Concrete heritage scenario: a numismatics cataloguer has filtered the *Coins* section down to the issues of one mint and wants a report for a colleague. They open the tool on that filtered list, drag the *Inventory number*, *Weight*, *Diameter* and the related *Mint → name* into the active columns, choose **Breakdown / rows** so each linked type lands on its own row, tick **parents** on the type column to also get the term's ancestor chain, run the export, and download an XLSX. The same configuration can be saved as a named preset for the next batch.

A second, machine-facing use: the **Dédalo (Raw)** format produces cells wrapped as `{"dedalo_data":…}` that the [CSV import tool](tool_import_dedalo_csv.md) re-imports byte-for-byte (round-trip) — a practical way to back up a section or move data between installations.

Use it when: someone needs section data as a spreadsheet/report, a re-importable backup, or the media files referenced by a record set. Do not use it for single-record edits or for tabular *editing* — it is read-only export.

## How it works (server + client)

The export pipeline resolves each cell through the **list-mode leaf-value contract**: `get_export_grid` (`tools/tool_export/server/{index,tool_export}.ts`) delegates to `exportGridUnified` (`src/diffusion/export/index.ts`), whose column resolution (`src/diffusion/export/atoms.ts`) calls `resolveCellValue` (`src/core/resolve/relation_list.ts`) — the same accessor the relation-list panel uses — rather than a dedicated per-component export method. This reaches full parity across `value`/`grid_value`/`dedalo_raw` data formats, all three breakdown modes, `ndjson_stream`, multi-hop export paths, and media cells; the coverage is byte-parity gated.

**Server:**

- `get_export_grid` is the single API entry point, declaratively gated `permission: 'section', minLevel: 1` on `section_tipo`. Records are then resolved through the standard search assembler (`buildSearchSql`) with the caller's `principal` — for non-admins this applies the same project-scoped ACL (Layer-2) every other search-backed read goes through.
- Options are normalized against fixed allowlists (`data_format` → `value|grid_value|dedalo_raw`, falling back to `value`; `breakdown` → `default|rows|columns`) and the SQO is **forced to the whole filtered selection** (`limit: null`/ALL, `offset: 0`) — the export deliberately serializes the entire filtered selection; subsetting is done via the SQO filter, not a page limit.
- The protocol lines (`meta`, `col*`, `row*`, `end`) are built from one shared resolution path for both the streamed (`ndjson_stream:true`) and whole-grid response shapes.

**Client** (`tools/tool_export/js/`): `tool_export.js` is the instance; `render_tool_export.js` builds the three-pane UI (left = available components, center = active columns, right = config + preview); `drag_tool_export.js` is the drag-and-drop column model; `flat_table.js` accumulates the NDJSON lines into the live preview and produces the downloads; `export_user_presets.js` manages per-user presets (ontology section **dd1781**). The client fetches via `data_manager.request_fetch_stream` with `ndjson_stream:true` and resolves as soon as the `meta` line arrives, then keeps filling rows with a progress bar. The tool opens in its own window (`properties.open_as = "window"`). None of this client code changed for the TS rewrite.

## Actions & options

`apiActions = { get_export_grid: { permission: 'section', minLevel: 1, handler: toolExportGetExportGrid } }` — a single, **declaratively** gated action. The handler accepts `options.section_tipo ?? options.tipo` as a fallback for legacy callers still sending `tipo`.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_export_grid` | declarative: `permission: 'section', minLevel: 1` on `section_tipo`; every SQO section is additionally covered by the standard project-scoped search ACL applied when building the record query | no | see below |

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

`tools/tool_export/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_export`; `dd1327` version (`2.0.3`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer.
- `dd1330` affected_models = `["section"]` → the tool attaches to **sections**.
- `dd1331` show_in_inspector = `false` and `dd1332` show_in_component = `false` (it is a section-toolbar tool, not an inspector/inline-component button).
- `dd1335` properties = `{ "open_as": "window", "windowFeatures": null }` → opens in its own window.
- `dd1372` labels supply the localized UI strings for the `fill_the_gaps` and `show_tipo_in_label` options across project languages.

Surfacing (in `getElementTools`, `src/core/tools/registry.ts`): because `affected_models` is `["section"]`, the **Export** button appears on sections in **list** mode. There is no rule restricting the time-machine section (dd15) to `tool_export` alone: `registry.ts`'s hardcoded `NO_TOOLS_MODELS` set only covers `component_section_id`/`component_info`, and no dd15-specific rule exists anywhere in the section/tool-filter path. On a TS-served install, dd15 shows whatever tools its `affected_models`/`affected_tipos` normally match, the same as any other section.

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
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, gates and lifecycle this page builds on.
- Source: `tools/tool_export/server/{index,tool_export}.ts`, `tools/tool_export/register.json`, `tools/tool_export/js/{tool_export,render_tool_export,flat_table,drag_tool_export,export_user_presets}.js`; the reused resolution core: `src/core/resolve/relation_list.ts`.
