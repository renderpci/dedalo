# Tools catalog

The catalog of every tool shipped with Dédalo v7, grouped by purpose. Each entry has a one-line description; tools that have a dedicated reference page link to it.

This page is the index of the **per-tool reference**. For the cross-cutting documentation — how to build a tool, the contracts the framework enforces — see:

- [Creating new tools](../creating_tools.md) — end-to-end tutorial (scaffold → register → authorize)
- [register.json reference](../register_json.md) — every field of the registration file
- [Server contract](../server_contract.md) — the `ToolServerModule` contract, API actions, configuration, lifecycle hooks
- [JS lifecycle](../js_lifecycle.md) — the client tool lifecycle and helpers
- [Security](../security.md) — what the framework enforces and what you must do
- [Architecture audit](../architecture_audit.md) — the PHP-era design history that shaped the current model (historical; see the note at its top)
- Back to the [development index](../../index.md)

## The tool model

A Dédalo tool is an **isolated block of code that extends a component, section or area** without that element knowing about it. Each tool lives in its own directory `tools/tool_<name>/` and has two halves:

- a **server** package `server/index.ts` exporting a `ToolServerModule` (no per-tool class, no autoloader — a tool with no remote actions ships no `server/` directory at all), and
- a **client** JS/CSS module under `js/` and `css/` (copied as-is from the PHP client tree, still vanilla constructor-function/prototype JS).

A `register.json` file describes the tool to the framework (label, version, which models it affects, where it surfaces, its configuration and UI hints). New tools use the hand-authorable [flat authoring format](../register_json.md); the 34 in-repo tools ship as column-keyed matrix-row dumps instead (pass-through, not hand-edited).

Every remotely callable server action is declared as a key of the module's **`apiActions`** map — there is no reflection, so an action exists on the API only if it is literally a property of that object. Each entry attaches a declarative permission (`section` / `tipo` / `record` / `developer`, with a `minLevel`) that the framework runs **before** the handler, and before any background fork (`permission: null` defers the gate to the handler itself, for the few actions whose target can't be expressed declaratively). A handler is `(context) => Promise<ToolResponse>` returning `{result, msg, errors}`. Long-running actions additionally list themselves in `backgroundRunnable`. See the [server contract](../server_contract.md) and [security](../security.md).

**Where tools surface.** A tool attaches to an element when the element's model is in the tool's `affected_models` (or `all_components`), its tipo matches `affected_tipos`, or the element's `properties->tool_config` names it. Two flags then decide *where* the button renders:

- `show_in_inspector` — button in the section **inspector** panel
- `show_in_component` — button inline on the matching **component**

Section-level tools surface on the section itself. A tool's own `isAvailable(context)` hook (when its module declares one) gives it the last word on whether to appear for a given element. Many tools are **UI-only** (all behavior is client-side, no remote API actions — 12 of the 34 in-repo tools ship no `server/` package at all); others dispatch server actions through `this.tool_request(...)`.

!!! note "No base class"
    There is no TS equivalent of a `tool_common` base *class* on the server — the shared machinery (registry, loader, dispatch, security, config, cache) lives in `src/core/tools/` and is invoked BY the framework around a tool's handlers, not inherited by them. On the **client**, `tool_common` is still a real JS prototype base (`src/core/tools/client/js/tool_common.js`, unchanged from the PHP era) that every tool wires into via `wire_tool`.

## Catalog

### Import

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_import_dedalo_csv` | Imports CSV (notably tool_export `dedalo_raw` round-trips) into Dédalo, conforming each cell per-component with multi-language support and time-machine tracking | [reference](tool_import_dedalo_csv.md) |
| `tool_import_files` | Ingests uploaded media files into media sections (EXIF/metadata extraction, multiple naming/match modes, custom processors) via ImageMagick/FFmpeg | [reference](tool_import_files.md) |
| `tool_import_marc21` | Parses MARC21 binary (`.mrc`) files and maps fields/subfields to Dédalo components per ontology config, matching or creating records | [reference](tool_import_marc21.md) |
| `tool_import_rdf` | Imports RDF/OWL graphs, mapping classes/properties to Dédalo components with resource matching/creation and special handling for iri/geolocation/date | [reference](tool_import_rdf.md) |
| `tool_import_zotero` | Imports Zotero JSON bibliographic exports into Publications (rsc205), mapping fields and optionally uploading associated PDF files | [reference](tool_import_zotero.md) |

### Export & publishing

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_export` | Atoms-based data export of section records to a flat table (CSV/TSV/preview) via the export_tabulator NDJSON protocol, with value/grid_value/dedalo_raw formats and breakdown modes | [reference](tool_export.md) |
| `tool_print` | Visual print-layout / report designer: arranges a section's components into a paginated document-flow grid (rows of cells) that reflows and splits long tables/text across pages; reusable per-section templates saved in dd25/dd625; browser print (server PDF planned) | [reference](tool_print.md) |
| `tool_diffusion` | Inspects/resolves diffusion configurations and section→target mappings from the ontology; UI-only, available only on sections with a diffusion definition | [reference](tool_diffusion.md) |
| `tool_pdf_extractor` | Extracts text from PDF files via an external `pdftotext` daemon (optional page numbering) for indexing and publication search | — |

### Media

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_media_versions` | Manages media file qualities/versions: get info, delete quality/version, build versions, conform headers, rotate, and sync component file metadata | [reference](tool_media_versions.md) |
| `tool_posterframe` | Extracts a posterframe/thumbnail from AV files (FFmpeg) at a timecode and attaches it as an identifying image to target portal records | [reference](tool_posterframe.md) |
| `tool_image_rotation` | Applies rotation and proportional crop transformations to image-component files across all quality levels | — |
| `tool_upload` | Post-upload processing: moves uploaded files from temp to final storage and triggers component-specific file processing | — |

### Thesaurus & ontology

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_hierarchy` | Generates custom ontologies / virtual sections from existing real sections, creating hierarchy elements and thesaurus general terms | [reference](tool_hierarchy.md) |
| `tool_cataloging` | Drag-and-drop grouping/hierarchization of records from source sections into a target hierarchy; UI-only | [reference](tool_cataloging.md) |
| `tool_ontology` | Developer-only parsing/sync of ontology section records into the `dd_ontology` runtime table from single-edit and batch modes | [reference](tool_ontology.md) |
| `tool_ontology_parser` | Developer-only retrieval/export of ontology records to JSON and regeneration of `dd_ontology` | — |

### Transcription & indexation

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_transcription` | PDF text extraction and automatic audio transcription (Whisper/Babel), audio format conversion, remote-process monitoring, and subtitle generation | [reference](tool_transcription.md) |
| `tool_subtitles` | CKEditor-based subtitle editing/generation tied to AV media transcription text; UI-only | [reference](tool_subtitles.md) |
| `tool_indexation` | UI entry point for component indexation against thesaurus terms (actual actions run through `dd_component_*_api`), restricted by `affected_tipos`; UI-only | [reference](tool_indexation.md) |
| `tool_tc` | Applies an offset adjustment to all timecode tags (`[TC_..._TC]`) in transcription text, clamping negatives to zero | — |
| `tool_tr_print` | Generates printable/formatted versions of interview transcripts and VTT subtitles, handling embedded timecode/descriptor/indexation tags; no remote API actions | — |
| `tool_numisdata_epigraphy` | Specialized transcription of coin legends/countermarks/epigraphic elements using epigraphy thesaurus glyph sets into Unicode text components; UI-only | — |

### Data operations

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_propagate_component_data` | Batch replace/add/delete of component data across records matched by an SQO, with bulk-process audit and time-machine reversion; CLI-runnable | [reference](tool_propagate_component_data.md) |
| `tool_time_machine` | Audit/history view and reversion of record and component changes over time | [reference](tool_time_machine.md) |
| `tool_update_cache` | Bulk cache regeneration/clean for components, chunked with progress tracking and background execution | — |
| `tool_numisdata_order_coins` | Groups and sorts numismatic objects (coins) by criteria such as weight, diameter and type for visual collection/lot management; UI-only | — |

### Language / i18n

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_lang` | Automatic translation of a component's data from a source to a target language using configured external services (Babel/Google) | [reference](tool_lang.md) |
| `tool_lang_multi` | Translates a source component into multiple target languages at once, delegating to tool_lang's translation logic with its own defense-in-depth gate | — |
| `tool_dd_label` | Helper for authoring multi-language tool UI labels across all project languages, generating the component_json (dd1372) labels payload; UI-only | — |

### Admin & system

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_user_admin` | User self-administration panel launched from the username menu, providing administrative actions for the logged-in user; UI-only | [reference](tool_user_admin.md) |
| `tool_assistant` | In-app AI chat assistant — a thin client over a server-side agent for natural-language search/navigation, ontology queries and confirmed (propose→apply) record create/edit; model selectable per conversation (cloud or local/private) | [AI Assistant section](../../../core/ai/assistant/index.md) |

### Misc / internal

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_dev_template` | Production-shaped scaffold/reference for creating new tools (all four permission kinds, `backgroundRunnable` demo, `isAvailable`/`onRegister`/`onRemove` hooks) | — |
| `tool_qr` | Base/build sample tool (not for production use); UI-only | [reference](tool_qr.md) |

!!! note "Counting the tools"
    The directory `tools/` contains exactly 34 entries, all of them real tools — there is no `tool_common` directory in the TS tree (the shared machinery moved to `src/core/tools/`). 33 are listed in the tables above; `tool_dev_template` is the developer scaffold/reference implementation, listed under *Misc / internal*. Per `rewrite/STATUS.md` ("Tools rebuild"), 22 of the 34 ship a `server/index.ts` package (including `tool_dev_template`); the other 12 are confirmed client-only in both the PHP oracle and the TS engine (empty/absent server surface).
