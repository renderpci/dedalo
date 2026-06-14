# component_pdf

## Overview

```json
{
    "could_be_translatable" : true,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : true,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_media_versions",
        "tool_pdf_extractor",
        "tool_time_machine",
        "tool_transcription",
        "tool_upload"
    ],
    "render_views" :[
        {
            "view" : "default | line | mini",
            "mode" : "edit | list"
        },
        {
            "view" : "viewer | player | print",
            "mode" : "edit"
        },
        {
            "view" : "text",
            "mode" : "list"
        }
    ],
    "data"        : "array",
    "sample_data" : [
        {
            "id": 3,
            "files_info": [
                {
                    "quality"    : "original",
                    "extension"  : "pdf",
                    "file_name"  : "test85_test3_1.pdf",
                    "file_path"  : "/pdf/original/0/test85_test3_1.pdf",
                    "file_size"  : 1866528,
                    "file_time"  : { "timestamp": "2026-01-04 12:54:38" },
                    "file_exist" : true
                },
                {
                    "quality"    : "web",
                    "extension"  : "pdf",
                    "file_name"  : "test85_test3_1.pdf",
                    "file_path"  : "/pdf/web/0/test85_test3_1.pdf",
                    "file_size"  : 1866528,
                    "file_time"  : { "timestamp": "2026-01-04 12:54:39" },
                    "file_exist" : true
                }
            ],
            "original_file_name"      : "Cecas _ Moneda Ibérica.pdf",
            "original_upload_date"    : { "timestamp": "2026-01-04 12:54:39" },
            "original_normalized_name": "test85_test3_1.pdf"
        }
    ],
    "value"        : "string (url)",
    "sample_value" : "/pdf/web/0/test85_test3_1.pdf"
}
```

!!! note "Typology"
    `component_pdf` is a **media** component. It is literal (`is_literal: true`) — its data is owned by its own section and is never a [locator](../locator.md) to another section — but it is also `is_media: true`, so it never stores the binary in the matrix; the `media` column only holds a thin JSON pointer to files on disk. In server context it extends the abstract `component_media_common` (the shared base for `component_3d`, `component_av`, `component_image`, `component_pdf` and `component_svg`), which extends `component_common`. It implements `component_media_interface`.

!!! info "About `default_tools`"
    The list above is what a PDF instance receives in `context.tools` (verified from the model sample `core/component_pdf/samples/context.json`): `tool_media_versions`, `tool_pdf_extractor`, `tool_time_machine`, `tool_transcription` and `tool_upload`. The toolbar is assembled from the model + ontology; the component class does not hardcode it. When the instance is translatable, `tool_lang` tooling is added like any other component; tools are read-only context.

## Definition

`component_pdf` manages document files attached to a record — primarily PDFs, but also office documents (`doc`, `docx`/`odt`, `ods`, `rtf`, `ppt`, `pages`) which it stores as-is. It handles upload, on-disk storage, quality/version management, raster thumbnail generation, and — for true PDF files — automatic text extraction (transcription) and optional OCR. The displayable PDF is served through the bundled pdf.js viewer.

**Why it exists.** A cultural-heritage catalogue routinely needs to bind a full document to a record: a conservation report, an excavation memoir, a scanned archival folio, a publication offprint, a numismatic study, a catalogue raisonné chapter. `component_pdf` is the building block for all of them. Because it is a media component, the catalogue stores only a deterministic on-disk pointer and lets Dédalo manage the original, the web-served copy and the thumbnail. Because it can run `pdftotext` and `ocrmypdf`, it can populate a paired transcription [component_text_area](component_text_area.md) so the document body becomes searchable full text and can carry page tags that drive the viewer.

**When to use it.**

- A document attached to a record: report, memoir, scanned dossier, publication, transcription source.
- Cases where the document text should become searchable / editable transcription in a sibling [component_text_area](component_text_area.md), with clickable page tags that scroll the viewer (observer wiring, see *Notes*).
- Mixed document repositories where users upload `doc`/`odt`/`pages` etc. alongside PDFs (non-PDF uploads are stored verbatim, without transcription/OCR).

**When not to use it.**

- A raster image (photograph, scan to be displayed as a picture) -> use [component_image](component_image.md).
- Audio / video -> use `component_av`. 3D models -> use `component_3d`. Vector graphics -> use [component_svg](component_svg.md).
- A short literal string, code or note -> use [component_input_text](component_input_text.md). A link to another record -> use a related component such as [component_portal](component_portal.md).

## Data model

**Data:** `array`. A single-element array describing the stored file (its original/normalized names and the live per-quality `files_info`). Although the structure is an array, a PDF instance manages one document.

**Value:** `string` (a URL), or `null`. `get_url()` reduces the data to the displayable URL of the default quality.

**Storage shape.** A component never touches the database; it reads and writes through its section, which keeps the component's data in the matrix `media` column. The stored `dato` is the thin JSON pointer — original/normalized file names — while `files_info` is reconstructed live by `get_files_info()`, scanning disk per quality and extension. Each `files_info` entry is `{quality, extension, file_name, file_path, file_size, file_time, file_exist}` (plus upload metadata at the item level).

Non-translatable variant (the common case — language slot `lg-nolan` is implicit, the on-disk name carries no `_lang` suffix):

```json
[
    {
        "id": 3,
        "files_info": [
            {
                "quality"    : "original",
                "extension"  : "pdf",
                "file_name"  : "test85_test3_1.pdf",
                "file_path"  : "/pdf/original/0/test85_test3_1.pdf",
                "file_size"  : 1866528,
                "file_time"  : { "timestamp": "2026-01-04 12:54:38" },
                "file_exist" : true
            },
            {
                "quality"    : "web",
                "extension"  : "pdf",
                "file_name"  : "test85_test3_1.pdf",
                "file_path"  : "/pdf/web/0/test85_test3_1.pdf",
                "file_exist" : true
            }
        ],
        "original_file_name"      : "Cecas _ Moneda Ibérica.pdf",
        "original_upload_date"    : { "timestamp": "2026-01-04 12:54:39" },
        "original_normalized_name": "test85_test3_1.pdf"
    }
]
```

Translatable variant. `component_pdf` *can* be instantiated as translatable; when it is, `get_id()` appends `_'.DEDALO_DATA_LANG` to the deterministic file name, so each language version keeps its own file (e.g. `test85_test3_1_lg-eng.pdf` vs `test85_test3_1_lg-spa.pdf`). The component still resolves only the language it was instantiated with.

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). In the API payload the data items are surfaced under `data.entries` (see `core/component_pdf/samples/api_data.json`), accompanied by `parent_tipo`, `parent_section_id` and the `from_component_tipo`. `context` carries the description (`tipo`, `model`, `mode`, `lang`, `label`, `properties`, `permissions`, `tools`, `view`) plus a media-specific `features` block (`allowed_extensions`, `default_target_quality`, `ar_quality`, `default_quality`, `quality`, `key_dir`, `alternative_extensions`, `extension`) and never the binary. See the *dedalo-context-data-layers* skill for the full layering rules.

### Qualities and the original model

`component_pdf` declares two qualities plus a thumb:

- `original` (`DEDALO_PDF_QUALITY_ORIGINAL`) — the exact uploaded file, preserved under its own quality folder keeping its source extension via `original_normalized_name`. Originals are never moved on re-upload (`rename_old_files` short-circuits for the original quality).
- `web` (`DEDALO_PDF_QUALITY_DEFAULT`, the default quality returned by `get_url()`) — a copy generated from the original by `build_version()`; this is the file the viewer serves and the one OCR rewrites in place.
- `thumb` (`DEDALO_QUALITY_THUMB`, raster `jpg`) — a `224x149` preview rendered from the default-quality PDF by `create_thumb()` via ImageMagick (Ghostscript delegate). Used in list / mini views.

`get_ar_quality()` returns `DEDALO_PDF_AR_QUALITY` (`["original","web"]`). Alternative versions (`DEDALO_PDF_ALTERNATIVE_EXTENSIONS`, default `["jpg"]`) are rendered per quality by `create_alternative_version()` (a page raster of the document).

## Ontology instantiation

A `component_pdf` is created as an ontology node whose `model` is `component_pdf`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node declares its label and (optional) translatability through the standard `lg-*` term + `translatable` ontology flags.

Node definition (shape):

```json
{
    "tipo"         : "test85",
    "model"        : "component_pdf",
    "parent"       : "test3",
    "section_tipo" : "test3",
    "lg-eng"       : "Document",
    "lg-spa"       : "Documento",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block for a PDF whose original filename is captured into a sibling input, that paginates its on-disk folders, and whose page tags drive a transcription text area:

```json
{
    "target_filename" : "test84",
    "max_items_folder": 1000,
    "observe": [
        {
            "client": {
                "event": "click_tag_pdf",
                "perform": { "function": "go_to_page" }
            },
            "component_tipo": "test97"
        },
        {
            "client": {
                "event": "key_up_f2",
                "perform": { "function": "get_data_tag" }
            },
            "component_tipo": "test97"
        }
    ]
}
```

`section_tipo` / `parent` tell the section which `media` column owns this component's data; the section is the single writer to the database. The on-disk path is resolved from section + component properties: `DEDALO_MEDIA_PATH + folder ('/pdf') + initial_media_path + '/' + quality + additional_path`, where `initial_media_path` comes from the *section* `properties->initial_media_path->{component_tipo}` and `additional_path` from this component's `properties->additional_path` (or the `max_items_folder` fallback bucketing). `get_media_path_dir` / `get_media_url_dir` run `sanitize_quality()` (SEC-065) to keep client values out of the filesystem path.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component (and by its `component_media_common` base):

### target_filename

- **Values:** an ontology `tipo` of a sibling `component_input_text` in the same section (e.g. `"test84"`). Default unset.
- **Effect:** on upload, `process_uploaded_file()` writes the document's `original_file_name` into that input component (resolved via `ontology_node::get_model_by_tipo`, instantiated in `lg-nolan`, saved). It preserves the human-readable upload name as a literal field. The same `tipo` is also honoured by the base when building `original_file_name` in `get_files_info`.

### max_items_folder

- **Values:** integer (commonly `1000`). Default unset.
- **Effect:** folder bucketing fallback when `additional_path` is not set. The on-disk `additional_path` becomes `'/' . max_items_folder * floor(section_id / max_items_folder)`, so files are spread across numbered subfolders to avoid one directory holding every record's media.

### additional_path

- **Values:** an ontology `tipo` of a component whose value supplies an extra path segment. Default unset.
- **Effect:** appends the resolved component value (slash-normalised) to the media path, overriding the `max_items_folder` bucketing. Used to group media by a catalogued value.

### initial_media_path *(section property)*

- **Values:** object keyed by component `tipo` -> path string, declared on the **section** `properties`, not the component. Default unset.
- **Effect:** inserts a fixed path segment after the media `folder`. Lets a section route a given media component's files into a dedicated subtree.

### external_source

- **Values:** an ontology `tipo` of a sibling [component_iri](component_iri.md). Default unset.
- **Effect:** lets the media live outside Dédalo. When the referenced IRI dataframe carries an `iri`, `get_external_source()` returns it and the displayable value resolves to that external URL instead of an on-disk file.

### observe / observers

- **Values:** arrays of observer/observable descriptors (see the index page *Observers and observables*).
- **Effect:** wire the PDF viewer to a transcription [component_text_area](component_text_area.md). The sample model subscribes the PDF to `click_tag_pdf` (-> `go_to_page`, scrolls the viewer to the tagged page) and `key_up_f2` (-> `get_data_tag`, hands the current page/offset back so the text area can insert a `page` tag).

!!! note "OCR / transcription configuration"
    OCR and text extraction are **not** ontology properties — they are global config + per-upload options. `PDF_AUTOMATIC_TRANSCRIPTION_ENGINE` (default `pdftotext`) extracts text on regenerate; `PDF_OCR_ENGINE` (e.g. `ocrmypdf`) is optional and runs only when an upload requests `ocr: true` with an `ocr_lang`. Supported upload extensions come from `DEDALO_PDF_EXTENSIONS_SUPPORTED`.

!!! note "Standard context properties"
    Like every component, `component_pdf` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). Any other custom key seen in production should be verified in the ontology.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files (`render_edit_component_pdf.js`, `render_list_component_pdf.js`, `render_search_component_pdf.js`). Verified from the source and the `.less`:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | — | Edit: full wrapper with label, buttons, upload UI, default-quality file. List: the thumb/default rendering. |
| `line` | yes | — | — | Compact inline rendering; falls through to the default edit view. |
| `mini` | yes | yes | — | Minimal `component_pdf_mini` (small thumb), used in tight layouts / autocomplete. |
| `viewer` / `player` | yes | — | — | Full pdf.js viewer (`view_viewer_pdf`); `content_data` takes the full height; right-click context menu suppressed. This is the view that the page-tag observers drive. |
| `text` | — | yes | — | Inline `view_text_list_pdf` (thumb image only, no chrome). |
| `print` | yes | — | — | Reuses the `default` edit view but forces read-only rendering (`permissions = 1`) and tags the wrapper `view_print`. |

Modes (the standard component set `["edit","list","tm","search"]`):

- **edit** — read/write a real record; upload (`tool_upload`), version management (`tool_media_versions`), text extraction (`tool_pdf_extractor`), transcription (`tool_transcription`), and the pdf.js viewer.
- **list / tm** — read-only listing; `tm` (Time Machine) reuses the list render and resolves the last deleted file under `/deleted`. `get_list_value()` provides the reduced data (thumb quality).
- **search** — builds an SQO filter input; one text input per filter (only one input is allowed). Saves are blocked in search mode. Search SQL is provided by the shared `search_component_media_common` trait.

DOM (edit / default): `wrapper_component component_pdf <tipo> <mode>` -> `label`, `buttons`, `content_data` -> `content_value`.

## Import / export model

**Import.** `component_pdf` does not override `conform_import_data`; media files are normally bound through the upload flow rather than CSV import. The upload pipeline is permission-gated and ordered:

1. `dd_utils_api::upload()` (API) — `assert_section_permission` write level 2, chunked-upload support, confined target path, `move_uploaded_file`.
2. `tool_upload::process_uploaded_file` — sets the target quality and binds the file.
3. `component_media_common::add_file`.
4. `component_pdf::process_uploaded_file()` — records `original_file_name` / `original_normalized_name` / `original_upload_date`, optionally writes `target_filename`, then for true PDFs calls `regenerate_component()` (builds the `web` quality, optional OCR, extracts transcription text into the related `component_text_area`). Non-PDF documents (`doc`, `odt`, `pages`, …) are stored verbatim and skip transcription/OCR.

See [importing data](../importing_data.md#related-data) for the broader import model.

**Export.** Inherited from `component_media_common::get_export_value()`: a single export atom carrying the media URL, `cell_type` `img`. In `edit` it resolves the default quality, otherwise the thumb quality; URL absoluteness is taken from the `export_context`. `get_diffusion_value()` reduces to the default-quality URL (or the bare `id.extension` when `DEDALO_PUBLICATION_CLEAN_URL` is on), returning `null` when no default-quality file exists. See [exporting data](../exporting_data.md).

## Notes

- **Text extraction & OCR.** `get_text_from_pdf()` runs `pdftotext` (UTF-8, page-range aware, page-marked into `[page-n-N]` paragraphs); shell args are `escapeshellarg`-quoted as defence-in-depth even though paths are server-built. `process_ocr_file()` runs `ocrmypdf --force-ocr` in place on the web copy, with a Valencià (`vlca` -> `cat`) language exception. `regenerate_component()` orchestrates OCR -> rebuild -> transcription into the related `component_text_area`.
- **Thumbnails / alternative versions.** `create_thumb()` and `create_alternative_version()` rasterize the PDF through ImageMagick with `pdf_cropbox` enabled; the OSX Homebrew Ghostscript-delegate caveat is documented in the class header.
- **Observers / observables.** The model wires the pdf.js viewer to a sibling transcription text area: `click_tag_pdf` -> `go_to_page`, `key_up_f2` -> `get_data_tag`. Configured in the ontology `properties`, not in the component code (see the index page *Observers and observables* section).
- **Default tools.** A PDF instance exposes `tool_media_versions`, `tool_pdf_extractor`, `tool_time_machine`, `tool_transcription` and `tool_upload` in `context.tools`; tools are read-only context.
- **Media access control.** Files are guarded by `media_protection` (`DEDALO_MEDIA_ACCESS_MODE`: `false` / `private` / `publication`): logged-in users carry the fixed `dedalo_media_auth` cookie matched against a daily-rotated marker in `.publication/auth/`, and anonymous publication access is allowed only to configured public-quality folders. Enforcement is fail-closed at the web server (`.htaccess` / nginx). See the *dedalo-media-protection* skill.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Read users (level 1) get read-only rendering; upload / save require level >= 2.
- **Related components:** [component_image](component_image.md), [component_svg](component_svg.md), [component_text_area](component_text_area.md), [component_iri](component_iri.md), [component_input_text](component_input_text.md), [component_portal](component_portal.md).
