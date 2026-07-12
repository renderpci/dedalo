# tool_import_dedalo_csv

Imports CSV files into Dédalo sections — notably the round-trip of `tool_export` `dedalo_raw` exports — conforming each cell per-component, with multi-language support and time-machine tracking.

## What it does / why & when to use it

`tool_import_dedalo_csv` ingests a CSV file where the first row is a header of component ontology tipos (plus a mandatory `section_id` column) and every following row is a record. For each cell it asks the target component to *conform* the raw text into stored v7 data, then creates or updates the matching record.

It is the import counterpart of [`tool_export`](tool_export.md): a section exported in the `dedalo_raw` format (cells wrapped as `{"dedalo_data": <dato>}`) re-imports unchanged, so the tool is the backbone of export → edit → re-import workflows. It also accepts hand-authored CSVs using canonical v7 dato, legacy v6 arrays, lang-keyed objects, or simple flat strings — see [Importing data](../../../core/importing_data.md) for the full per-component format catalogue.

Concrete heritage scenario: a numismatics team exports the *Types* section (`numisdata3`) to CSV with `tool_export` in `dedalo_raw` format, cleans the legend transcriptions and date ranges in a spreadsheet, then re-imports the file here. Because each row carries its `section_id`, existing Type records are updated in place (not duplicated); empty cells clear the corresponding component for that record; and with the time-machine checkbox left on, the whole batch is reversible from the bulk-process record it creates.

Key behaviours to know before importing:

- The first column must resolve to `section_id` — it is the record key. A row with an empty/invalid `section_id` is skipped and reported.
- An **empty cell clears** the existing component data for that record (and that data language, when translatable). Omit a column entirely to leave a component untouched.
- A CSV header must match its mapped column name **exactly** (including suffixes like `tch56_dmy` or `tch191_rsc723`); mismatched columns are silently skipped.
- Two report channels: `failed_rows` (value rejected, not imported) and `warning_rows` (value imported but needs attention, e.g. a `select_lang` code not in the project languages).

## How it works

### Server

`tools/tool_import_dedalo_csv/server/index.ts` implements the full CSV→DB round-trip, DB-drive verified: a scratch-twin CSV→DB round-trip is byte-parity gated, not merely a stub. The five declared actions:

1. **Staging.** Uploaded files land in a per-user directory that the module creates and confines; client-supplied paths are never trusted for listing/deletion (path-confined the same way `paths.ts`/`loader.ts` confine tool asset paths — see [Security](../security.md)).
2. **Listing & validation.** `get_csv_files` (`permission: null`) parses every staged CSV (`parseCsv`, `src/core/tools/import_csv.ts`), builds the column map (resolving each header tipo to its ontology label + model), and returns per-file `n_records`/`n_columns`/`sample_data`/`sample_data_errors`. The exact response shape below was fixed after driving the real client end to end: the client crashes on anything narrower.
3. **Import.** `import_files` (`permission: 'section', minLevel: 2`, `backgroundRunnable`) is the entry point. It plans the import (`planCsvImport`, column-map/section_id/conform resolution) and executes it through the shared import executor (`createSectionRecord` + `saveComponentData` — the same write path other import tools use, not a bespoke one).
4. **Per-cell conforming.** `parseCsv`/`planCsvImport` + the shared `conformImportData`/`unwrapDedaloData` core (`src/core/tools/import_data.ts`) reproduce the **raw-export round-trip for every model** — value-property/relation/date/lang-keyed values, flat/clear/error semantics, and the `dedalo_data` wrapper (incl. its paired `dataframe`), unit-tested (13 tests) independent of any live DB.
5. `process_uploaded_file` (`permission: 'section', minLevel: 2`) moves a staged upload into the import directory; `delete_csv_file` (`permission: null`) soft-deletes a staged file; `get_section_components_list` (`permission: 'section', minLevel: 1`) lists the target section's components for the column mapper.

### Client

`tools/tool_import_dedalo_csv/js/tool_import_dedalo_csv.js` wires the standard tool lifecycle (`init` / `build`, render delegated to `render_tool_import_dedalo_csv.js`) and opens in a **window** (per the `dd1335` property `open_as: "window"`). On build it loads the staged file list (`load_csv_files_list` → `get_csv_files`) and spins up a `service_upload` instance limited to the `csv` extension under the `csv` key_dir. Each request goes through `data_manager.request` with a `dd_tools_api` / `tool_request` RQO built by `create_source(self, '<action>')`.

The render layer lets the user, per file: confirm/override the auto-detected target `section_tipo` (parsed from the filename `…-<section_tipo>.csv`, falling back to `self.caller.tipo`), edit each column's mapping (`map_to`, `checked`, decimal separator), edit the bulk-process label, and preview sample rows. The import button submits the selected files plus the time-machine checkbox; `import_files` is sent with `background_running: true` (a long-running operation) and a 3600 s timeout. Deleting a file (`remove_file` → `delete_csv_file`) moves it to a `deleted/` subfolder rather than hard-deleting it.

## Actions & options

`apiActions` (declarative form for the gated actions; `backgroundRunnable = ['import_files']`):

| Action | Permission gate | Key options it reads | Returns |
| --- | --- | --- | --- |
| `get_csv_files` | `permission: null` — always scoped to the caller's own per-user dir | *(none — client `files_path` is ignored)* | `result`: array of `{dir, name, n_records, n_columns, file_info, ar_columns_map, sample_data, sample_data_errors}` |
| `delete_csv_file` | `permission: null` — path-confined to per-user dir | `file_name` (basename-confined; client `files_path` ignored) | `result`: bool — moves the file to `deleted/<name>_deleted_<date>.csv` |
| `import_files` | declarative `permission: 'section', minLevel: 2` on every file's `section_tipo` | `files` (array of `{file, section_tipo, ar_columns_map, bulk_process_label}`), `time_machine_save` (bool), `files_path` (optional) | `result`: per-file array of `{result, msg, created_rows, updated_rows, failed_rows, warning_rows, time, file, section_tipo}` |
| `process_uploaded_file` | declarative `permission: 'section', minLevel: 2` | `file_data` (`{name, tmp_name, key_dir, …}`) | `result`: bool, `file_name` — moves the temp upload into the user's import dir |
| `get_section_components_list` | declarative `permission: 'section', minLevel: 1` | `section_tipo` | `result`: array of `{label, value, model}` for the section's components + section-info components; `label`: section label |

Notes:

- `time_machine_save` defaults to checked in the UI; when off, the batch is **not** reversible from the bulk-process record.
- `ar_columns_map` items use `tipo` (the CSV header), `map_to` (the target component tipo), `checked` (whether to import the column), `model`, and optional `decimal` (for `component_number`). Unchecked columns, columns without `map_to`, and the `section_id` column are skipped.
- Internal helpers (CSV parsing, column-map validation, staging-path resolution) are plain functions in `import_csv.ts`/`import_data.ts`, not exposed as actions.

## How it is registered & surfaced

`tools/tool_import_dedalo_csv/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials decoded from its ontology tipos:

- `dd1326` name → `tool_import_dedalo_csv`; `dd1327` version → `2.0.4`; `dd1328` `dedalo_version_min` → `6.2.5`.
- `dd1335` properties → `{ "open_as": "window" }` — the tool opens in its own window, not a modal.
- `dd1330` affected_models → empty (`{}`); the tool is attached to sections via the `dd1331` (show_in_inspector) / `dd1332` (show_in_component) relations pointing at the generic section model (`dd64`).
- `dd1354` active → on; `dd1372` labels carry the UI strings (`import`, `select_a_file`, `preview`, `records`, `columns`, `bulk_process_title`, …).

Surfacing is element-driven in `getElementTools` (`src/core/tools/registry.ts`): it appears on **sections** (its target is always a section, since import writes whole records keyed by `section_id`), rendered from the inspector / section tools area. The client takes the section context from `self.caller` (the active section's `tipo`) and from the filename to pick the import target.

New tools should use the v7 `register.json` format instead; see [Creating tools](../creating_tools.md).

## Examples

### Client tool_request (as the JS issues it)

The import action, built by `create_source(self, 'import_files')` and sent through `data_manager.request`:

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'import_files'), // { model:'tool_import_dedalo_csv', action:'import_files', ... }
    options : {
        background_running : true,
        time_machine_save  : true,
        files : [{
            file               : 'types_clean-numisdata3.csv',
            section_tipo       : 'numisdata3',
            bulk_process_label : 'Import | numisdata3 | Types',
            ar_columns_map     : [
                { tipo:'section_id',  model:'section_id',     checked:false, map_to:'' },
                { tipo:'numisdata81', model:'component_input_text', checked:true, map_to:'numisdata81' },
                { tipo:'numisdata27', model:'component_input_text', checked:true, map_to:'numisdata27' }
            ]
        }]
    }
}
```

### The CSV being imported

The `dedalo_raw` round-trip wraps each dato cell with `dedalo_data`; the `section_id` column stays a plain int (the record key) and empty cells clear data:

```text
section_id;numisdata81;numisdata27
1;"{""dedalo_data"":[{""value"":""key1""}]}";"{""dedalo_data"":[{""value"":""062""}]}"
2;"{""dedalo_data"":[{""value"":""key2""}]}";"{""dedalo_data"":[{""value"":""685a""}]}"
```

Hand-authored CSVs can skip the wrapper and use flat strings instead (`062`, a date as `2023/10/26`, a relation id list `1,4,6`, …) — see [Importing data](../../../core/importing_data.md).

The server replies per file:

```json
{
  "result": [{
    "result": true,
    "msg": "Section: numisdata3. Total records created:0 - updated:2 - failed:0 - warnings:0",
    "created_rows": [],
    "updated_rows": [1, 2],
    "failed_rows": [],
    "warning_rows": [],
    "file": "types_clean-numisdata3.csv",
    "section_tipo": "numisdata3"
  }],
  "msg": "Request done"
}
```

## Related

- [tool_export](tool_export.md) — the export counterpart; its `dedalo_raw` format produces the `dedalo_data`-wrapped CSV this tool round-trips.
- [tool_import_files](tool_import_files.md) — ingest media files (not CSV record data).
- [tool_import_marc21](tool_import_marc21.md), [tool_import_rdf](tool_import_rdf.md), [tool_import_zotero](tool_import_zotero.md) — format-specific importers.
- [tool_propagate_component_data](tool_propagate_component_data.md) — SQO-driven bulk component edits with the same bulk-process / time-machine reversion model.
- [Importing data](../../../core/importing_data.md) — the per-component CSV format catalogue, the `dedalo_data` wrapper and dataframe envelope, empty-cell semantics.
- [Exporting data](../../../core/exporting_data.md) — the export side of the round-trip.
- [Creating tools](../creating_tools.md), [Server contract](../server_contract.md) — the tool model and the `ToolServerModule` contract.
- Source: `tools/tool_import_dedalo_csv/server/index.ts`; shared import core: `src/core/tools/{import_csv,import_data}.ts`; the executor: `src/core/section/record/{create_record,save_component}.ts`.
