# Tools catalog

The catalog of every tool shipped with Dédalo v7, grouped by purpose. Each entry has a one-line description; tools that have a dedicated reference page link to it.

This page is the index of the **per-tool reference**. For the cross-cutting documentation — how to build a tool, the contracts the framework enforces — see:

- [Creating new tools](../creating_tools.md) — end-to-end tutorial (scaffold → register → authorize)
- [register.json reference](../register_json.md) — every field of the registration file
- [Server contract](../server_contract.md) — PHP class, API actions, configuration, lifecycle hooks
- [JS lifecycle](../js_lifecycle.md) — the client tool lifecycle and helpers
- [Security](../security.md) — what the framework enforces and what you must do
- [Architecture audit](../architecture_audit.md) — the subsystem internals and design decisions
- Back to the [development index](../../index.md)

## The tool model

A Dédalo tool is an **isolated block of code that extends a component, section or area** without that element knowing about it. Each tool lives in its own directory `tools/tool_<name>/` and has two halves:

- a **server** PHP class `class.tool_<name>.php` (extends `tool_common`, class name equals the directory name), and
- a **client** JS/CSS module under `js/` and `css/`.

A `register.json` file describes the tool to the framework (label, version, which models it affects, where it surfaces, its configuration and UI hints). It is hand-authored in the [v7 format](../register_json.md) and validated at registration. Legacy v6 registration files are converted automatically.

Every remotely callable server method must be declared in the class constant **`API_ACTIONS`** — a class without it is refused at dispatch. The preferred *map form* attaches a declarative permission gate (`section` / `tipo` / `record` / `developer`, with a `min_level`) that the framework runs **before** the method, and before any background fork. Methods take a single `object $options` and return `{result, msg, errors}`. Long-running writes additionally list themselves in `BACKGROUND_RUNNABLE`. See the [server contract](../server_contract.md) and [security](../security.md).

**Where tools surface.** A tool attaches to an element when the element's model is in the tool's `affected_models` (or `all_components`), its tipo matches `affected_tipos`, or the element's `properties->tool_config` names it. Two flags then decide *where* the button renders:

- `show_in_inspector` — button in the section **inspector** panel
- `show_in_component` — button inline on the matching **component**

Section-level tools surface on the section itself. The tool's own `is_available($context)` hook gives it the last word on whether to appear for a given element. Many tools are **UI-only** (all behavior is client-side, no remote API actions); others dispatch server actions through `this.tool_request(...)`.

!!! note "Base class"
    `tool_common` is the parent of every tool — shared context/JSON building, registry and per-user config/permission plumbing, and the lifecycle hooks (`is_available`, `on_register`, `on_remove`). It is never instantiated as a tool and has no catalog row of its own.

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
| `tool_assistant` | AI chat assistant backed by a local LLM (Transformers.js) via the dedalo-work-mcp server, for natural-language search/navigation, ontology queries and confirmed record create/edit | — |

### Misc / internal

| Tool | Purpose | Reference |
| --- | --- | --- |
| `tool_dev_template` | Production-shaped scaffold/reference for creating new tools (map-form gates, BACKGROUND_RUNNABLE demo, confined upload handling); registered only when `SHOW_DEVELOPER=true` | — |
| `tool_qr` | Base/build sample tool (not for production use); UI-only | [reference](tool_qr.md) |

!!! note "Counting the tools"
    The directory `tools/` contains 34 entries. `tool_common` is the base class (described above), not a catalog tool; the remaining 33 are listed in the tables. `tool_dev_template` ships as a developer scaffold and only registers when developer mode is on.
