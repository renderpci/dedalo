# tool_import_marc21

Parses uploaded MARC21 binary files (`.mrc`) and maps their fields/subfields to Dédalo components per an ontology-driven configuration, matching existing records or creating new ones.

## What it does / why & when to use it

MARC21 is the de-facto interchange format for library catalogues. Heritage institutions that already hold their bibliographic data in an ILS (Koha, Sierra, Symphony, Aleph...) routinely export it as MARC21 records. `tool_import_marc21` lets a cataloguer load those `.mrc` files directly into a Dédalo Publications section instead of re-keying every record by hand.

Concrete scenario: a museum library has 4 000 monograph records in its ILS. It exports them to `catalogo.mrc` and opens the import tool on the Publications section. The tool reads each MARC record, uses control field **907 $a** as the stable identifier to decide *update vs. create*, then walks a configurable field map — title from **245**, edition from **250**, imprint/editor/date from **260/264**, ISBN from **020**, summary from **520**, subject headings (indexations) concatenated from the **6xx** block, item holdings from **945**, language and material type from **998** — and writes each value into the matching Dédalo component, with multi-language and date handling along the way.

Use it for any one-shot or recurring bulk ingest of bibliographic data already available as MARC21. For round-tripping Dédalo's own exports use [tool_import_dedalo_csv](tool_import_dedalo_csv.md); for arbitrary RDF/OWL graphs use [tool_import_rdf](tool_import_rdf.md); for Zotero JSON use [tool_import_zotero](tool_import_zotero.md).

## How it works

### Server

`tools/tool_import_marc21/class.tool_import_marc21.php` extends `tool_common` and bundles its own MARC parser under `lib/MARC.php` (the `File_MARC` library). The single remotely callable entry point is `import_files()`; everything else is a private helper or a non-RQO static (deliberately kept out of `API_ACTIONS`). The orchestration pipeline:

1. **WRITE gate.** `import_files()` reads `section_tipo` from the options and asserts `security::assert_section_permission($section_tipo, 2, ...)` — MARC import creates/overwrites records, so it requires write level on the target section. A missing `section_tipo` returns an error response immediately.
2. **Context.** `prepare_import_context()` loads the tool config via `tool_common::get_config()` and reads `config->main` (named anchors such as `code`, `section`, `field_to_section_id`) and `config->map` (the field-to-component rules). It also captures the per-request options (`tipo`, `section_tipo`, `section_id`, `tool_config`, `files_data`, `components_temp_data`, `key_dir`) and builds the upload dir `DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>`.
3. **File filter.** `filter_marc21_files()` keeps only uploaded files whose name ends in `.mrc`. If none qualify it returns a success response with `"No MARC21 files found to import"`.
4. **Per-file parse.** `process_marc21_file()` opens each file with `new File_MARC(...)` and iterates records with `->next()`, then `unlink()`s the file once consumed.
5. **Per-record resolve.** `resolve_target_section()` extracts the identifier defined by `main.field_to_section_id` (default field **907**, subfield **a**) and calls `get_section_id_from_code()`, which runs a `search_query_object` against the `id` map entry's `Code` component (`=code` OR `*/code`). A hit updates that section; a miss calls `section::create_record()` on `section_tipo`.
6. **Field mapping.** `process_marc21_field_mappings()` loops `config->map`. For each entry it extracts (`extract_marc21_value` → `extract_conditional_value` for `marc21_conditional`, else `get_value`/`get_field`), transforms (`transform_marc21_value`: trim, `partial_left_content`, `date_format: "year"` → `dd_date`, `dd_data_map` lookup), then `save_to_component()` builds the right component instance (model resolved via `ontology_node`, lang via `get_translatable`) and saves. When the entry carries `dd_action`, `execute_dd_actions()` writes those companion components too.
7. **Temp/manual data.** `process_temp_component_data()` applies any `components_temp_data` collected in the tool UI for ddo_map roles `input_component` (the "Values" block); `cleanup_temp_session_data()` then clears the matching `section_temp_data` session keys.

`get_value`/`get_field` are public statics (used internally for positional, non-RQO calls) but are **not** in `API_ACTIONS`, so they are not remotely dispatchable.

### Client

`tools/tool_import_marc21/js/` wires the standard tool lifecycle (`init`/`build`/`edit`/`render` via `tool_common`). `init()` derives `key_dir = caller.tipo + '_' + caller.section_tipo`. `build()` skips the generic ddo_map autoload and instead builds two services: `service_dropzone` (file upload) and `service_tmp_section` (the manual "Values" inputs for ddo_map role `input_component`). `render_tool_import_marc21.js` draws the drop zone, the values block and an **IMPORT** button; clicking it gathers `service_tmp_section.get_components_data()`, builds the request via `create_source(self, 'import_files')` and calls `data_manager.request()` with a long timeout (3600 s, 1 retry). The tool opens as a separate window (`properties.open_as: "window"`). Styling lives in `css/tool_import_marc21.less`.

## Actions & options

`API_ACTIONS` (list form):

| Action | Permission | Key options it reads |
| --- | --- | --- |
| `import_files` | imperative WRITE gate inside the method: `security::assert_section_permission(section_tipo, 2)` | `section_tipo` (target section, **required**), `tipo` (portal/component context), `section_id` (current section), `tool_config` (carries `ddo_map`), `files_data` (uploaded `.mrc` file objects), `components_temp_data` (manual "Values" inputs), `key_dir` (upload directory id) |

`import_files` is the only remotely callable method. It is **not** in `BACKGROUND_RUNNABLE`; the long-running work is handled synchronously behind the client's extended request timeout.

The behaviour of the import is driven by the tool **configuration** (resolved through `tool_common::get_config()` — dd996 install override wins over the dd1633 shipped default), not by the request options. Its two blocks:

`main` — named anchors:

| `name` | Purpose |
| --- | --- |
| `field_to_section_id` | `{field, subfield}` (default 907 / a) used to identify a record for update vs. create |
| `code` / `section` / `project` / `pdf` / `identifying_image` / `transcription` / `transcription_review` / `field_standard_number` | component/section anchors used by the resolver and helpers |

`map` — one entry per MARC field → component rule:

| Key | Meaning |
| --- | --- |
| `field` | MARC field tag, e.g. `"245"`; an array of tags when `field_multiple` is set (e.g. the 6xx indexation block) |
| `subfield` | Specific subfield code (`"a"`); omit to concatenate all subfields |
| `tipo` | Target Dédalo component tipo (the value is written here) |
| `field_multiple` + `row_separator` | Concatenate values across several fields with this separator |
| `subfield_separator` | Separator when joining all subfields of a field |
| `marc21_conditional` | `{subfield, value}` — only extract when that sibling subfield equals `value` (e.g. 945 holdings where `$j == 193`) |
| `partial_left_content` | Take the leftmost N chars, parsed as integer (e.g. a 4-digit year) |
| `date_format: "year"` | Wrap the value as a `dd_date` start year |
| `dd_data_map` | Map a raw code to a Dédalo locator (e.g. 998 $f language code `"spa"` → a `lg1` section reference; 998 $d material type → `dd810`) |
| `dd_action` | Companion components to set when the main value is populated (e.g. set the standard-number type `rsc249` when an ISBN from 020 is present) |
| `skip_on_empty` | Do not store when the extracted value is empty |
| `info` | Free comment documenting the rule |

## How it is registered & surfaced

The shipped `register.json` is a **legacy v6** file (raw `components`/`relations` dump) and is auto-converted on import; new tools should use the v7 flat format. The essentials it declares:

- `name` (dd1326): `tool_import_marc21`, `version` (dd1327): `2.0.4`, `dedalo_version_min` (dd1328): `6.0.0`, developer (dd1644): "Dédalo team".
- **affected_models** (relation via dd1337 → dd153 section_id 1): `section` — the tool attaches to sections.
- **active** (dd1354 → dd64 section_id 1 = Yes): registered active.
- **show_in_inspector** (dd1331 → dd64 section_id 2 = No): **not** flagged for the inspector panel in this register; the tool is surfaced through the section's tool config / ddo_map rather than an inspector button. `show_in_component` (dd1332) is absent → defaults false.
- `properties` (dd1335): `{ "open_as": "window", "windowFeatures": null }` — opens in its own window.
- `default_config` (dd1633): the full MARC `main` + `map` reference (mirrored in `sample_config.json`). Per the comment in the config, do not edit dd1633 directly — copy it into the Tools configuration section (dd996) and edit there.
- UI labels (dd1372): `file_processor`, `target_componet`, `quality`, retrieved client-side via `get_tool_label(...)`.

Because surfacing is element-driven (`common::get_tools()`), the tool appears on Publications-style sections (rsc205 in the reference config) once the user's profile is authorized for it and the section carries the tool in its config.

## Examples

Client-side request built by the IMPORT button (`render_tool_import_marc21.js`) — the RQO sent to `dd_tools_api`:

``` js
const source = create_source(self, 'import_files') // → tool_import_marc21::import_files(options)
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        tipo                 : self.caller.tipo,
        section_tipo         : self.caller.section_tipo, // e.g. 'rsc205' (Publications) — WRITE-gated
        section_id           : self.caller.section_id,
        tool_config          : self.tool_config,        // carries ddo_map
        files_data           : self.files_data,          // uploaded *.mrc descriptors
        components_temp_data : self.service_tmp_section.get_components_data(),
        key_dir              : self.key_dir
    }
}
data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
```

A single `map` rule (from the reference config) that ingests the title statement, MARC field 245, into the title component `rsc140`:

``` json
{ "info": "Title mention", "field": "245", "tipo": "rsc140" }
```

A conditional holdings rule (945 $a, only when sibling $j equals 193) and a year-from-imprint rule:

``` json
{ "info": "Topographic", "field": "945", "subfield": "a", "tipo": "rsc359",
  "marc21_conditional": { "subfield": "j", "value": "193" } }

{ "info": "Publication date", "field": "260", "subfield": "c", "tipo": "rsc224",
  "partial_left_content": 4, "date_format": "year" }
```

## Related

- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) — CSV import / Dédalo export round-trips
- [tool_import_rdf](tool_import_rdf.md) — RDF/OWL graph import
- [tool_import_zotero](tool_import_zotero.md) — Zotero JSON bibliographic import
- [tool_import_files](tool_import_files.md) — media file ingest (shares the dropzone upload pattern)
- [tool_export](tool_export.md) and [Exporting data](../../../core/exporting_data.md) — the export side
- [Importing data](../../../core/importing_data.md) — the per-component import-data contract
- [Creating new tools](../creating_tools.md), [Server contract](../server_contract.md), [register.json reference](../register_json.md), [Security](../security.md)
