# tool_import_zotero

Imports a Zotero bibliographic export into a Dédalo Publications section (rsc205), mapping Zotero fields to components and (on the PHP oracle) optionally uploading the associated PDF files (with automatic first-page image extraction).

!!! warning "Read this before using the tool on a TS-served install"
    The description below (and everything through *How it works*) is the **PHP oracle's** design and behavior — it explains the tool's purpose and target UX. The **TS port imports a different file format**: Zotero's RDF/XML export, not the CSL-JSON export described here, with a correspondingly different, flatter field-map. See the warning in *How it works* for the concrete divergence before exporting from Zotero or configuring the field-map.

## What it does / why & when to use it

Zotero is one of the most widely used reference managers in academic and heritage research. A researcher gathers references in Zotero, then exports the library as **CSL-JSON** (Zotero's "JSON" export). `tool_import_zotero` ingests that JSON straight into a Dédalo Publications section, so the bibliography does not have to be re-keyed by hand.

Concrete scenario: a museum's research department keeps the bibliography of an exhibition catalogue in Zotero. They export the collection to `bibliografia.json` and, for the entries they hold digitally, drop the matching PDF files alongside it. On the Publications section they open the import tool, drag in the JSON plus the PDFs, and import. For each Zotero record the tool:

- decides **update vs. create** — by default it reads the Zotero `call-number` field as the target `section_id` (configurable via `field_to_section_id`); otherwise it looks up the Zotero `id` stored in the Code component (rsc137) and reuses that record, or creates a new one;
- maps the bibliographic fields — `title`, `author` (Zotero name objects flattened to text), `issued`/`accessed` dates (CSL `date-parts` → Dédalo `dd_date`), `ISBN`/`ISSN` (plus the matching standard-number typology), `URL`/`DOI` (stored as IRI, DOIs prefixed with `https://www.doi.org/`), `container-title` (resolved/created as a Series/Collection list record and linked), `type` (mapped to a Dédalo typology locator), and the rest of the plain text/HTML fields per the configured map;
- when a record carries an `archive` field naming a PDF that was uploaded, imports the PDF into the pdf component, then renders its first page as the record's identifying image.

Use it for any bulk ingest of references already curated in Zotero. For round-tripping Dédalo's own exports use [tool_import_dedalo_csv](tool_import_dedalo_csv.md); for library MARC21 records use [tool_import_marc21](tool_import_marc21.md); for arbitrary RDF/OWL graphs use [tool_import_rdf](tool_import_rdf.md).

## How it works

!!! warning "TS engine imports a different Zotero export format than the PHP oracle"
    This is the single most important thing to know before using this tool on a TS-served install: the PHP oracle's `tool_import_zotero` parses Zotero's **CSL-JSON** export (a `.json` file, one object per reference, fields like `title`/`author`/`issued`/`container-title`). The TS port (`tools/tool_import_zotero/server/index.ts`) instead parses Zotero's **RDF/XML** export (an `.rdf`/XML file, `<z:Item>` elements with Dublin Core predicates like `dc:title`) — reusing the same from-scratch RDF/XML parser and predicate→component mapper as [tool_import_rdf](tool_import_rdf.md), **not** a JSON field-mapper. The tool name, section (Publications) and general "map Zotero fields to components" *concept* carry over, but the **file to export from Zotero, and the shape of the field-map configuration, do not** — see the config-block corrections below. This is a genuine divergence from the PHP oracle, not a documentation gap; verify it directly against `tools/tool_import_zotero/server/index.ts` if this page and the code ever appear to disagree again.

### Server

`tools/tool_import_zotero/server/index.ts` — per `rewrite/STATUS.md` ("R2 Import family"), this is a scratch-twin-verified **FULL DRIVE**: unlike [tool_import_rdf](tool_import_rdf.md)'s `get_rdf_data` (which only fetches/parses/maps and does not write), this tool's `import_files` action **does** write, through the same shared executor the other import tools use. The single remotely callable action, `import_files`:

1. **WRITE gate.** Declaratively gated `permission: 'tipo', minLevel: 2` on `(section_tipo, tipo)` — a design difference from the PHP oracle's imperative `assert_section_permission`, same write requirement.
2. **Config.** Reads the field-map from `tool_config.config.main` as an array of `{predicate, component_tipo}` entries (`readFieldMap`) — **not** the PHP oracle's four config blocks (`main` named anchors / `map` Zotero-field rules / `typology` / `standard_type`). Missing or empty map → refused (`Missing Zotero field-map`).
3. **File filter.** Keeps only staged files under the per-user upload temp dir; each is read as **RDF/XML text**, not decoded as JSON.
4. **Parse + map.** `parseRdfXml` (`src/core/tools/rdf_xml.ts`) extracts subjects/predicates from the RDF/XML; `applyRdfMap` resolves each subject's predicates against the field-map into a `MappedRecord` (`{component_tipo, value}` pairs) — a flat predicate→component mapping, not the PHP oracle's per-field `switch` (no dedicated `author`-name-flattening, `issued`/`accessed` CSL-date parsing, `container-title` Series/Collection resolve-or-create, `type`→typology lookup, or `ISBN`/`ISSN`→standard-number-typology special cases; a plain predicate maps straight to a component value).
5. **Execute.** `importMappedRecords` (the shared executor, `src/core/tools/import_execute.ts`) resolves target vs. new records per mapped subject and writes through `createSectionRecord`/`saveComponentData`.
6. Returns `{result, msg, errors, created, updated, failed}`.

⬜ **Not ported:** PDF import + first-page identifying-image extraction (the `archive` field flow), the `field_to_section_id`/Code-component update-vs-create resolution the PHP oracle uses (the TS executor's own record-matching rules apply instead — see [Importing data](../../../core/importing_data.md)), and the manual "Values"/`input_component` temp-data merge. Verify each against `rewrite/STATUS.md` before assuming parity beyond the plain predicate→component write.

`import_files` is listed in `backgroundRunnable`; the client always sends `background_running: true` (see [Server contract](../server_contract.md) for how TS runs this without a CLI fork).

### Client

`tools/tool_import_zotero/js/` wires the standard tool lifecycle through `tool_common`. `init()` derives `key_dir = caller.tipo + '_' + caller.section_tipo`. `build()` deliberately skips the generic ddo_map autoload (`load_ddo_map: () => []`) and instead builds two services: `service_dropzone` (the file upload / drop zone for the JSON + PDFs) and `service_tmp_section` (the manual "Values" inputs, filtered to ddo_map role `input_component`). `render_tool_import_zotero.js` draws the drop zone, the Values block and an **IMPORT** button; clicking it gathers `service_tmp_section.get_components_data()`, builds the request via `create_source(self, 'import_files')` and calls `data_manager.request()` with a 3600 s timeout and a single retry, then shows the success/error message and reloads. The tool opens as a separate **window** (`properties.open_as: "window"`). Styling lives in `css/tool_import_zotero.less`.

## Actions & options

`apiActions = { import_files: { permission: 'tipo', minLevel: 2, handler: importFiles } }` — only `import_files` is declared:

| Action | Permission | Key options it reads |
| --- | --- | --- |
| `import_files` | declarative `permission: 'tipo', minLevel: 2` on `(section_tipo, tipo)` | `section_tipo` (target section, **required**, gated), `tipo` (caller component/portal tipo), `section_id` (current section), `tool_config` (carries `config.main`, the field-map array — see below), `files_data` (uploaded file descriptors — an RDF/XML export on TS, **not** the PHP oracle's `.json`), `key_dir` (upload directory id) |

**TS config shape — `tool_config.config.main`, an array of flat entries:**

| Field | Purpose |
| --- | --- |
| `predicate` | The RDF predicate to match (e.g. `dc:title`), read from each parsed subject. |
| `component_tipo` | The Dédalo component the matched predicate's value is written to. |

There is no TS equivalent of the PHP oracle's four-block config (`main` named anchors / `map` Zotero-field rules / `typology` / `standard_type` — described below **for the PHP oracle only**, to explain what does not carry over):

- `main` — named anchors (`field_to_section_id`, `code`, `section`, `pdf`, `identifying_image`, `field_standard_number`, `project`, `transcription`, `transcription_review`) used by PHP's record-matching and PDF/typology helpers.
- `map` — one entry per Zotero **JSON** field → component rule (`{ name, ddo_map: [{ tipo, section_tipo, parent? }] }`), keyed by CSL field names (`id`, `type`, `title`, `author`, `container-title`, `issued`, `accessed`, `URL`, `DOI`, `ISBN`, `ISSN`, `archive`…) — meaningless against an RDF/XML input, since there are no CSL field names in that format.
- `typology` — Zotero `type` value → Dédalo typology locator.
- `standard_type` — `ISBN`/`ISSN` → standard-number locator.

## How it is registered & surfaced

`tools/tool_import_zotero/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it declares:

- `name` (dd1326): `tool_import_zotero`, `version` (dd1327): `2.0.3`, `dedalo_version_min` (dd1328): `6.0.0`, developer (dd1644): "Dédalo team", label (dd799): "Import Zotero" (multi-language).
- **affected_models** (relation via dd1337 → dd153 section_id 1): `section` — the tool attaches to sections.
- **active** (dd1354 → dd64 section_id 1 = Yes): registered active.
- **show_in_inspector** (dd1331 → dd64 section_id **2** = No): not flagged for the inspector panel; the tool is surfaced through the section's tool config / ddo_map rather than an inspector button. **show_in_component** (dd1332 → dd64 section_id **1** = Yes): can render inline on the component.
- `properties` (dd1335): `{ "open_as": "window", "windowFeatures": null }` — opens in its own window.
- `default_config` (dd1633): the full Zotero `main` + `map` + `typology` + `standard_type` reference (mirrored in `sample_config.json`). Per the comment in `sample_config.json`, do not edit dd1633 directly — copy a **full** configuration into the Tools configuration section (dd996, "Development → Tools → Tools configuration") and edit there.
- UI labels (dd1372): `file_processor`, `target_componet`, `quality`, retrieved client-side via `get_tool_label(...)`.

Because surfacing is element-driven (`getElementTools`, `src/core/tools/registry.ts`), the tool appears on Publications-style sections (rsc205 in the reference config) once the user's profile is authorized for it and the element carries the tool in its config.

## Examples

Client-side request built by the IMPORT button — the RQO shape is unchanged (`source`/`options` fields), but on TS `files_data` must be an RDF/XML export, not JSON:

``` js
const source = create_source(self, 'import_files') // → tool_import_zotero.import_files
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,
    options : {
        tipo                 : self.caller.tipo,
        section_tipo         : self.caller.section_tipo, // e.g. 'rsc205' (Publications) — gated
        section_id           : self.caller.section_id,
        tool_config          : self.tool_config,        // carries config.main (the field-map array)
        files_data           : self.files_data,          // an RDF/XML Zotero export on TS
        key_dir              : self.key_dir
    }
}
data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
```

A TS field-map entry mapping the Dublin Core title predicate to a title component:

``` json
{ "predicate": "dc:title", "component_tipo": "rsc140" }
```

(For reference, the shape this replaces on the PHP oracle — a Zotero **JSON** field rule with a two-step `ddo_map` — does not apply here: `{ "name": "title", "ddo_map": [{ "tipo": "rsc140", "section_tipo": "rsc205" }] }`.)

PDF import + first-page identifying-image extraction (`{"archive": "my_pdf_file.pdf"}` in the PHP oracle) has no confirmed TS equivalent — see the gaps noted above.

## Related

- [tool_import_marc21](tool_import_marc21.md) — MARC21 library-catalogue import (shares the shared-executor write path; also has its own config-shape divergence from the PHP oracle — see its page).
- [tool_import_dedalo_csv](tool_import_dedalo_csv.md) — CSV import / Dédalo export round-trips.
- [tool_import_rdf](tool_import_rdf.md) — the sibling RDF/XML import tool this one's parser and mapper are shared with (`src/core/tools/rdf_xml.ts`) — but unlike `tool_import_rdf`'s `get_rdf_data`, this tool's `import_files` actually writes.
- [tool_import_files](tool_import_files.md) — media file ingest (shares the dropzone upload pattern).
- [tool_export](tool_export.md) and [Exporting data](../../../core/exporting_data.md) — the export side.
- [Importing data](../../../core/importing_data.md) — the per-component import-data contract.
- Source: `tools/tool_import_zotero/server/index.ts`; RDF parser + mapper: `src/core/tools/rdf_xml.ts`; shared executor: `src/core/tools/import_execute.ts`.
- [Creating new tools](../creating_tools.md), [Server contract](../server_contract.md), [register.json reference](../register_json.md), [Security](../security.md)
