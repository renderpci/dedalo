# tool_import_files

Ingests uploaded media files into media sections — extracting EXIF/metadata, applying naming/match strategies and optional custom processors — using ImageMagick and FFmpeg.

## What it does / why & when to use it

`tool_import_files` is the bulk media-ingest tool. The user drops a batch of files (images, audio/video, PDFs) onto the tool's drop zone; the tool moves each file into the target media component's storage, creates the section record it belongs to (or matches an existing one), extracts the capture date from the file's metadata, copies the original filename and any per-import form values into the record, and runs an optional transformation script per file.

Unlike [`tool_import_dedalo_csv`](tool_import_dedalo_csv.md) (which imports *record data* from CSV), this tool imports *media files* and the records that wrap them. Use it whenever you have a folder of files that must become Dédalo media records — typically a `component_image` / `component_av` / `component_pdf` inside an Images/Media section (e.g. `rsc170`), reached through a `component_portal` on a parent record.

Concrete heritage scenario: an oral-history archive (`oh1`) has just digitised a box of photographs. Each scan is named with the interview's section id and a target slot, e.g. `73-portrait-A.tiff`. The archivist opens an `oh1` record, opens the import-files tool on its images portal, drops the whole folder, and the tool: creates one Image record per file under the portal, stores each file as the `original` quality of the image component, reads the EXIF *DateTimeOriginal* into the record's date component, saves the original filename into a text component, and propagates any title/credit typed once in the import form to every new record. A second pass of post-processed `.tiff` files (alpha-channel masters) can be re-attached to the *same* image records by filename, using one of the **match** modes, without creating duplicates.

Key behaviours to know:

- **The filename can drive everything.** `get_file_data()` parses each name with one regex into `{section_id, base_name, letter, extension}`. Supported shapes: `73-my image-A.tiff`, `73-A.tiff`, `73.jpg`, `73-my image.tif`, `My image-A.tiff`, `My image.tiff`. The leading digits are the source `section_id` (empty when the name is non-numeric); the trailing `-A`/`-B` letter selects a target field/slot.
- **The destination is described by a `ddo_map`**, declared in the *target element's* ontology `properties.tool_config.tool_import_files`. Each map entry has a `role` (`target_component`, `target_filename`, `target_date`, `input_component`, `component_option`) that tells the tool what to do with that component.
- **Existing data is never overwritten.** `target_filename` and `target_date` are only written when the component is empty.
- **Date extraction is per media type.** Images use ImageMagick EXIF, AV uses FFmpeg, PDF uses `pdfinfo` (`-rawdates` → CreationDate). A model the tool does not recognise yields no date (logged, not fatal).

## How it works

### Server

`tools/tool_import_files/class.tool_import_files.php` extends `tool_common`. The orchestrator is `import_files()`; the rest are helpers it calls (some exposed as API actions, some deliberately internal).

`import_files()` flow, per uploaded file:

1. **Gate & resolve config.** It first asserts **write (level 2)** on `(section_tipo, tipo)` via `security::assert_tipo_permission`. It reads `import_mode` (`section` | `section_resource` | `default`), `import_file_name_mode`, and the `ddo_map` from `tool_config`, and finds the single `target_component` entry (the media component being filled). Missing `section_tipo`/`tipo` or a missing `target_component` role fail closed.
2. **Confine the file.** The client-supplied `key_dir` is run through `sanitize_key_dir()`; the per-file name (url-decoded) is confined under the user's upload temp dir with `safe_upload_target()` (TOOLS-05) before any filesystem access. Missing files are reported and skipped, not fatal.
3. **Pick / create the destination record**, driven by `import_mode` + `import_file_name_mode`:
   - `match` / `match_freename` — do **not** create records; they *find* existing media records by filename (see the match helpers below) and re-attach the file, copying it once per extra match. Incompatible with record creation, so the loop `continue`s after matching.
   - `enumerate` — the leading digits in the name are taken as the target id; `create_record({section_id})` forces a record id (first file per id creates, later files reuse).
   - `named` — files sharing the same `base_name` reuse one freshly created record (so `ánfora-A.jpg` and `ánfora-B.jpg` land in the same record); otherwise a new record is created.
   - `default` — a brand-new section record per file (or, in `default`/`section` portal modes, a new child created through the caller `component_portal` with `add_new_element()`).
4. **Run the processor or import directly.** If the file carries a `file_processor` selection, `file_processor()` is invoked; otherwise the file is imported straight in. `section_resource` keeps the just-created section as the target; `section`/`default` create the media record through the portal and `Save()` it.
5. **Write the file + the data.** `set_media_file()` instantiates the media component, sets its quality (`custom_target_quality` or the component's original quality), calls `add_file()` then `process_uploaded_file()` to build the standard qualities, and cleans the thumbnail temp copy. `set_components_data()` then walks the `ddo_map` and, per role, saves the filename (`target_filename`, optionally `only_basename`), the metadata date (`target_date`), and the form inputs (`input_component`, pulled from `components_temp_data` for non-translatable or from the temp component instance in all languages for translatable).
6. **Report.** It accumulates a CLI progress object (`common::$pdata`) when run in CLI, clears the temporary section data from the session, and returns `{result, msg, errors, time, memory}` with an imported-of-total count.

`file_processor()` is hardened (SEC-053): the processor script path is confined under the tool directory with `realpath`, the function name must be a bare identifier, and even after `include_once` the resolved function file is re-checked to be inside the tool root before it is called — an admin-editable ontology processor definition cannot escape the tool folder. The shipped example is `script_files/numisdata/crop_50.php` (split an image at 50 %).

The match helpers are also API actions:

- `get_media_section_match_from_souce()` — uses the source record (`section_tipo` + the id parsed from the filename) to read its related media locators, then compares the uploaded basename (extension-ignored) against each media record's stored filename component, returning the matching media section ids.
- `get_media_section_match()` — builds an SQO (`search::get_query_path` for the target filename component) and searches for media records whose filename equals `<basename>.` (the trailing dot is a boundary marker so `my_image.` does not also match `my_image2.tiff`), returning all matching ids.

Internal-only helpers `get_file_data`, `set_media_file`, `get_media_file_date`, `set_components_data` are intentionally **absent** from `API_ACTIONS` (positional / non-rqo signatures).

### Client

`tools/tool_import_files/js/tool_import_files.js` wires the standard tool lifecycle and opens in a **window** (per the `dd1335` property `open_as: "window"`). On `init` it builds `key_dir` as `<caller.tipo>_<caller.section_tipo>`. On `build` it loads the `target_component` element context and spins up two services:

- `service_dropzone` — the upload drop zone, seeded with the allowed extensions, the `key_dir`, the `component_option` map entries and the `file_processor` list (so each file can be assigned a processor in its preview row).
- `service_tmp_section` — a temporary in-memory section that renders the `input_component` fields once; the values typed there are read on submit (`get_components_data()`) and propagated to every imported record.

`render_tool_import_files.js` builds the options panel: a quality selector (`custom_target_quality`, defaulting to `original`), a per-file processor selector, the component-option (target slot) selector, and — only when `import_mode` is `section`/`section_resource` — the checkboxes that flip `import_file_name_mode` between `enumerate` (name indicates id), `named` (same name → same section), `match` (matching id) and `match_freename` (matching name).

The import button calls `tool_import_files.prototype.import_files`, which sends a `dd_tools_api` / `tool_request` RQO built by `create_source(self, 'import_files')`, with `background_running: true` and a 3600 s timeout (long-running CLI job).

## Actions & options

`API_ACTIONS` is in **list form** (membership only; methods gate themselves imperatively). `BACKGROUND_RUNNABLE = ['import_files']` — only `import_files` is allowed to run detached via `process_runner.php`.

| Action | Permission gate | Key options it reads | Returns |
| --- | --- | --- | --- |
| `import_files` | imperative **write (≥2)** on `(section_tipo, tipo)` via `assert_tipo_permission` | `tipo`, `section_tipo`, `section_id`, `tool_config` (`{ddo_map, import_mode, import_file_name_mode, file_processor}`), `files_data` (`[{name, file_processor, component_option}]`), `components_temp_data`, `key_dir` (sanitized), `custom_target_quality` | `result` (bool), `msg` (imported-of-total), `errors`, `time`, `memory` |
| `file_processor` | imperative **write (2)** on `section_tipo` (when present) | `file_processor` (function name), `file_processor_properties` (processor defs from tool config), `file_name`, `file_path`, `section_tipo`, `section_id`, `tool_config`, `key_dir`, `custom_target_quality`, `components_temp_data` | `{result, msg, errors}` — runs the confined processor function(s) |
| `get_media_section_match_from_souce` | none declared (read-only lookup; called internally by `import_files` for `match` mode) | `section_id` (from filename), `section_tipo`, `target_section_tipo`, `full_name`, `target_filename` | `array` of matching media `section_id` values |
| `get_media_section_match` | none declared (read-only SQO search; `match_freename` mode) | `target_filename` (`{tipo, section_tipo}`), `full_name` | `array` of matching `section_id` values |

`ddo_map` roles (declared in ontology, consumed by the server):

| Role | Effect |
| --- | --- |
| `target_component` | The media component the file becomes (e.g. `component_image`). Exactly one required. |
| `target_filename` | Text component that receives the original filename (only if empty; `only_basename: true` stores the parsed base name without id/field/extension). Also the field the **match** modes search. |
| `target_date` | Date component that receives the EXIF/metadata capture date (only if empty). |
| `input_component` | A form field rendered once; its value (per-language for translatable) is propagated to every imported record. |
| `component_option` | A selectable target slot/portal (the `-A`/`-B` letter), chosen per file in the UI; `default: true` marks the fallback. |

A `ddo_map` entry's `section_tipo` may be `"self"`, which the server replaces with the current `section_tipo` (virtual-section case).

## How it is registered & surfaced

The tool ships a **legacy v6** `register.json` (a raw record dump with `relations` / `components` keys), auto-converted at registration. Essentials decoded from its ontology tipos:

- `dd1326` name → `tool_import_files`; `dd1327` version → `1.1.2`; `dd1328` `dedalo_version_min` → `6.0.0`; `dd1644` developer → "Dédalo team".
- `dd1335` properties → `{ "open_as": "window", "windowFeatures": null }` — opens in its own window, not a modal.
- `dd1331` (show_in_inspector) and `dd1332` (show_in_component) relations point at the generic section/component models; `dd1354` active → on.
- `dd1372` labels carry the UI strings: `target_component`, `file_processor`, `quality`, `crop_50`, `name_indicates_id`, `matching_id`, `matching_name`, `match_name_with_previous_upload`, `replace_existing_files`, `new_files`, …

Surfacing is element-driven in `common::get_tools()`. Critically, this tool does **not** appear on every component of the affected model — only on those whose ontology `properties.tool_config.tool_import_files` is configured with a valid `ddo_map` (the `dd1362` implementation note documents exactly this). In practice it surfaces on a configured `component_portal` (e.g. `oh17` on section `oh1`) and renders inline on that component / in the inspector. The client takes its target from `self.caller` (`tipo`, `section_tipo`, `section_id`).

## Examples

### Ontology configuration (`tool_config` on the target element)

Set on the portal component's ontology properties (sample for `oh17` on `oh1`, writing into the Images section `rsc170`):

```json
"tool_config": {
    "tool_import_files": {
        "ddo_map": [
            { "role": "target_component", "tipo": "rsc29",  "section_id": "self", "section_tipo": "rsc170" },
            { "role": "target_date",      "tipo": "rsc44",  "section_id": "self", "section_tipo": "rsc170" },
            { "role": "target_filename",  "tipo": "rsc398", "section_id": "self", "section_tipo": "rsc170" },
            { "role": "input_component", "mode": "edit", "tipo": "rsc23", "section_id": "self", "section_tipo": "rsc170" }
        ]
    }
}
```

### Client tool_request (as the JS issues it)

Built by `create_source(self, 'import_files')` and sent through `data_manager.request` with `background_running: true`:

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'import_files'), // { model:'tool_import_files', action:'import_files', ... }
    options : {
        background_running    : true,
        tipo                  : 'oh17',     // the configured portal component
        section_tipo          : 'oh1',
        section_id            : 5,
        tool_config           : self.tool_config, // includes ddo_map, import_mode, import_file_name_mode, file_processor
        files_data            : [
            { name: '73-portrait-A.tiff', file_processor: null, component_option: '' }
        ],
        components_temp_data  : [ /* values from the input_component form */ ],
        key_dir               : 'oh17_oh1',
        custom_target_quality : 'original'
    }
}
```

The server replies (CLI-backed; final response after the batch):

```json
{
  "result": true,
  "msg": "Import files done successfully. Imported: 1 of 1",
  "errors": [],
  "time": "0.9 s",
  "memory": "…"
}
```

## Related

- `tool_upload` — the generic post-upload mover (`process_uploaded_file`) that `tool_import_files` builds on for storing files (no dedicated page yet; see the [tools catalog](index.md)).
- [tool_media_versions](tool_media_versions.md) — manage the qualities/versions this tool creates (build, rotate, delete, conform headers).
- [tool_posterframe](tool_posterframe.md) — posterframe from AV; `tool_image_rotation` — rotation/crop of image files (see the [tools catalog](index.md)).
- [tool_import_dedalo_csv](tool_import_dedalo_csv.md), [tool_import_marc21](tool_import_marc21.md), [tool_import_rdf](tool_import_rdf.md), [tool_import_zotero](tool_import_zotero.md) — the other importers (record data / bibliographic / RDF; `tool_import_zotero` also uploads associated PDFs).
- [Importing data](../../../core/importing_data.md) — the per-component import-data contract (this page covers *files*; that one covers *record data*).
- [Exporting data](../../../core/exporting_data.md) — the export side ([tool_export](tool_export.md)).
- [Creating tools](../creating_tools.md), [Server contract](../server_contract.md), [Security](../security.md) — the tool model, PHP class contract, and the SEC-024 / SEC-053 / TOOLS-05 rules this tool exemplifies.
