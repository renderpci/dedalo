# tool_import_zotero

Imports a Zotero JSON bibliographic export into a Dédalo Publications section (rsc205), mapping Zotero fields to components and optionally uploading the associated PDF files (with automatic first-page image extraction).

## What it does / why & when to use it

Zotero is one of the most widely used reference managers in academic and heritage research. A researcher gathers references in Zotero, then exports the library as **CSL-JSON** (Zotero's "JSON" export). `tool_import_zotero` ingests that JSON straight into a Dédalo Publications section, so the bibliography does not have to be re-keyed by hand.

Concrete scenario: a museum's research department keeps the bibliography of an exhibition catalogue in Zotero. They export the collection to `bibliografia.json` and, for the entries they hold digitally, drop the matching PDF files alongside it. On the Publications section they open the import tool, drag in the JSON plus the PDFs, and import. For each Zotero record the tool:

- decides **update vs. create** — by default it reads the Zotero `call-number` field as the target `section_id` (configurable via `field_to_section_id`); otherwise it looks up the Zotero `id` stored in the Code component (rsc137) and reuses that record, or creates a new one;
- maps the bibliographic fields — `title`, `author` (Zotero name objects flattened to text), `issued`/`accessed` dates (CSL `date-parts` → Dédalo `dd_date`), `ISBN`/`ISSN` (plus the matching standard-number typology), `URL`/`DOI` (stored as IRI, DOIs prefixed with `https://www.doi.org/`), `container-title` (resolved/created as a Series/Collection list record and linked), `type` (mapped to a Dédalo typology locator), and the rest of the plain text/HTML fields per the configured map;
- when a record carries an `archive` field naming a PDF that was uploaded, imports the PDF into the pdf component, then renders its first page as the record's identifying image.

Use it for any bulk ingest of references already curated in Zotero. For round-tripping Dédalo's own exports use [tool_import_dedalo_csv](tool_import_dedalo_csv.md); for library MARC21 records use [tool_import_marc21](tool_import_marc21.md); for arbitrary RDF/OWL graphs use [tool_import_rdf](tool_import_rdf.md).

## How it works

### Server

`tools/tool_import_zotero/class.tool_import_zotero.php` extends `tool_common`. The single remotely callable entry point is `import_files()`; everything else (`import_pdf_file`, `zotero_date_to_dd_date`, `zotero_name_to_name`, `zotero_page_to_first_page`, `get_section_id_from_code`, `get_section_id_from_zotero_container_title`) is a positional, non-RQO static deliberately kept out of `API_ACTIONS`. The flow inside `import_files()`:

1. **WRITE gate.** It reads `section_tipo` from the options and, after an explicit empty check, asserts `security::assert_section_permission($section_tipo, 2, __METHOD__)` — Zotero import creates/overwrites records, so it requires write level (2) on the target section. A missing `section_tipo` returns an error response immediately.
2. **Config.** It loads the tool config via `tool_common::get_config($tool_name)` and reads four blocks: `config->main` (named anchors: `code`, `section`, `pdf`, `identifying_image`, `field_standard_number`, `field_to_section_id`…), `config->map` (Zotero-field → component rules), `config->typology` (Zotero `type` → Dédalo typology locator), and `config->standard_type` (ISBN/ISSN → standard-number locator). The map for the live ddo components (`ddo_map`) comes from the per-request `tool_config`.
3. **File filter.** From `files_data` it keeps only uploads whose name ends in `.json` and reads each from `DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>`. A missing file is logged and skipped.
4. **Per-record resolve.** For each object in the decoded JSON it computes the target `section_id`: if `field_to_section_id` is set and present on the record it uses that value (calling `section::create_record()` to ensure that id exists); otherwise it derives the Zotero id from the record `id` and calls `get_section_id_from_code()` (a `search_query_object` against the `id` map entry's Code component, matching `=code` OR `*/code`). A miss creates a new section via `section::Save()`.
5. **Field mapping.** It loops the record's properties; each property name is matched against `config->map`. Unknown names are logged and skipped. A `switch` then handles the special cases — `id` (Code), `type` (typology lookup), `container-title` (Series/Collection resolve-or-create + locator link), `author` (`zotero_name_to_name`), `issued`/`accessed` (`zotero_date_to_dd_date`), `call-number` (id control only), `archive` (PDF import), `ISSN`/`ISBN` (value + standard-number typology), `URL`/`DOI` (`url_to_iri`) — and a `default` branch that writes plain text/HTML values, resolving the model via `ontology_node::get_model_by_tipo()` and translatable lang via `ontology_node::get_translatable()`.
6. **PDF import.** When the `archive` field names a file that was uploaded, `import_pdf_file()` adds it to the `component_pdf` (anchor `pdf`), runs `process_uploaded_file()`, then `create_image()` to render the first page (the start page is taken from the Zotero `page` field via `zotero_page_to_first_page()`) and attaches it to the `component_image` identifying-image anchor; thumbnails are cleaned up via `dd_utils_api::delete_uploaded_file()`.
7. **Temp/manual data.** After the record fields, it iterates the request `ddo_map`: for entries with role `input_component` it applies any matching `components_temp_data` (the manual "Values" block) and tracks their section tipos.
8. **Cleanup.** The consumed Zotero JSON file is `unlink()`ed, and the `section_temp_data` session keys matching the used input-component section tipos are cleared.

`import_files()` is **not** in `BACKGROUND_RUNNABLE`; the long-running work runs synchronously behind the client's extended request timeout.

### Client

`tools/tool_import_zotero/js/` wires the standard tool lifecycle through `tool_common`. `init()` derives `key_dir = caller.tipo + '_' + caller.section_tipo`. `build()` deliberately skips the generic ddo_map autoload (`load_ddo_map: () => []`) and instead builds two services: `service_dropzone` (the file upload / drop zone for the JSON + PDFs) and `service_tmp_section` (the manual "Values" inputs, filtered to ddo_map role `input_component`). `render_tool_import_zotero.js` draws the drop zone, the Values block and an **IMPORT** button; clicking it gathers `service_tmp_section.get_components_data()`, builds the request via `create_source(self, 'import_files')` and calls `data_manager.request()` with a 3600 s timeout and a single retry, then shows the success/error message and reloads. The tool opens as a separate **window** (`properties.open_as: "window"`). Styling lives in `css/tool_import_zotero.less`.

## Actions & options

`API_ACTIONS` (list form — only `import_files` is declared):

| Action | Permission | Key options it reads |
| --- | --- | --- |
| `import_files` | imperative WRITE gate inside the method: `security::assert_section_permission(section_tipo, 2)` (refuses if `section_tipo` is empty) | `section_tipo` (target section, **required**, WRITE-gated), `tipo` (caller component/portal tipo), `section_id` (current section), `tool_config` (carries `ddo_map`), `files_data` (uploaded file descriptors — the `.json` export and any `.pdf` files), `components_temp_data` (manual "Values" inputs), `key_dir` (upload directory id, `tipo_section_tipo`) |

The mapping behaviour is driven by the tool **configuration** (resolved through `tool_common::get_config()` — the dd996 install override wins wholesale over the dd1633 shipped default), not by the request options. Its blocks:

`main` — named anchors:

| `name` | Purpose |
| --- | --- |
| `field_to_section_id` | `{value}` — the Zotero field whose value becomes the target `section_id` (default `"call-number"`) |
| `code` | Code component (rsc137) used to match a record by its Zotero id |
| `section` | The Publications section tipo (rsc205) |
| `pdf` | `component_pdf` tipo for the imported PDF (rsc209) |
| `identifying_image` | `component_image` tipo for the first-page image (rsc228) |
| `field_standard_number` | standard-number component (rsc249) set alongside an ISBN/ISSN |
| `project` / `transcription` / `transcription_review` | further anchors available to helpers |

`map` — one entry per Zotero field → component rule (`{ name, ddo_map: [{ tipo, section_tipo, parent? }] }`). The `name` is the Zotero/CSL field (`id`, `type`, `title`, `author`, `container-title`, `issued`, `accessed`, `URL`, `DOI`, `ISBN`, `ISSN`, `archive`…); `ddo_map[0]` is the target component, and a second entry (used by `container-title`) points at the Series/Collection list record.

`typology` — Zotero `type` value → Dédalo typology locator(s) (e.g. `book` → `dd810` id 1, `article-journal` → `dd810` id 8).

`standard_type` — `ISBN`/`ISSN` → standard-number locator (e.g. `ISBN` → `dd292` id 1).

## How it is registered & surfaced

The shipped `register.json` is a **legacy v6** file (a raw `components`/`relations` record dump) and is auto-converted on import; new tools should use the v7 flat format. The essentials it declares:

- `name` (dd1326): `tool_import_zotero`, `version` (dd1327): `2.0.3`, `dedalo_version_min` (dd1328): `6.0.0`, developer (dd1644): "Dédalo team", label (dd799): "Import Zotero" (multi-language).
- **affected_models** (relation via dd1337 → dd153 section_id 1): `section` — the tool attaches to sections.
- **active** (dd1354 → dd64 section_id 1 = Yes): registered active.
- **show_in_inspector** (dd1331 → dd64 section_id **2** = No): not flagged for the inspector panel; the tool is surfaced through the section's tool config / ddo_map rather than an inspector button. **show_in_component** (dd1332 → dd64 section_id **1** = Yes): can render inline on the component.
- `properties` (dd1335): `{ "open_as": "window", "windowFeatures": null }` — opens in its own window.
- `default_config` (dd1633): the full Zotero `main` + `map` + `typology` + `standard_type` reference (mirrored in `sample_config.json`). Per the comment in `sample_config.json`, do not edit dd1633 directly — copy a **full** configuration into the Tools configuration section (dd996, "Development → Tools → Tools configuration") and edit there.
- UI labels (dd1372): `file_processor`, `target_componet`, `quality`, retrieved client-side via `get_tool_label(...)`.

Because surfacing is element-driven (`common::get_tools()`), the tool appears on Publications-style sections (rsc205 in the reference config) once the user's profile is authorized for it and the element carries the tool in its config.

## Examples

Client-side request built by the IMPORT button (`render_tool_import_zotero.js`) — the RQO sent to `dd_tools_api`:

``` js
const source = create_source(self, 'import_files') // → tool_import_zotero::import_files(options)
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        tipo                 : self.caller.tipo,
        section_tipo         : self.caller.section_tipo, // e.g. 'rsc205' (Publications) — WRITE-gated
        section_id           : self.caller.section_id,
        tool_config          : self.tool_config,        // carries ddo_map
        files_data           : self.files_data,          // uploaded *.json + *.pdf descriptors
        components_temp_data : self.service_tmp_section.get_components_data(),
        key_dir              : self.key_dir              // e.g. 'rsc228_rsc205'
    }
}
data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
```

A `map` rule (from the reference config) that ingests the Zotero `title` into the title component `rsc140`, and the `container-title` rule with its two-step ddo_map (the publication field rsc211 plus the Series/Collection list record rsc214 in section rsc212):

``` json
{ "name": "title", "ddo_map": [{ "tipo": "rsc140", "section_tipo": "rsc205" }] }

{ "name": "container-title", "ddo_map": [
    { "tipo": "rsc211", "section_tipo": "rsc205" },
    { "tipo": "rsc214", "section_tipo": "rsc212", "parent": "rsc211" }
] }
```

PDF upload is opt-in per record: set the Zotero `archive` field to the PDF's full filename and upload that PDF together with the JSON.

``` json
{ "archive": "my_pdf_file.pdf" }
```

## Related

- [tool_import_marc21](tool_import_marc21.md) — MARC21 library-catalogue import (shares the resolve-or-create + map pattern)
- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) — CSV import / Dédalo export round-trips
- [tool_import_rdf](tool_import_rdf.md) — RDF/OWL graph import
- [tool_import_files](tool_import_files.md) — media file ingest (shares the dropzone upload pattern)
- [tool_export](tool_export.md) and [Exporting data](../../../core/exporting_data.md) — the export side
- [Importing data](../../../core/importing_data.md) — the per-component import-data contract
- [Creating new tools](../creating_tools.md), [Server contract](../server_contract.md), [register.json reference](../register_json.md), [Security](../security.md)
