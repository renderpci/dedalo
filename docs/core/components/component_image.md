# component_image

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : false,
    "is_media"              : true,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_image_rotation",
        "tool_media_versions",
        "tool_time_machine",
        "tool_transcription",
        "tool_upload"
    ],
    "render_views" :[
        {
            "view" : "default | line | mini | viewer",
            "mode" : "edit"
        },
        {
            "view" : "default | mini | text | mosaic | viewer",
            "mode" : "list"
        }
    ],
    "data"        : "array (single item)",
    "sample_data" : [
        {
            "id": 3,
            "files_info": [
                {
                    "quality"   : "1.5MB",
                    "extension" : "jpg",
                    "file_name" : "test99_test3_1.jpg",
                    "file_path" : "/image/1.5MB/0/test99_test3_1.jpg",
                    "file_size" : 177293,
                    "file_time" : { "timestamp": "2025-12-30 10:13:53" },
                    "file_exist": true
                },
                {
                    "quality"   : "thumb",
                    "extension" : "jpg",
                    "file_name" : "test99_test3_1.jpg",
                    "file_path" : "/image/thumb/0/test99_test3_1.jpg",
                    "file_size" : 11165,
                    "file_exist": true
                }
            ],
            "original_file_name"       : "my photo 16.jpg",
            "original_normalized_name" : "test99_test3_1.jpg",
            "original_upload_date"     : "2025-12-29 21:47:30"
        }
    ],
    "value"        : "string (url) | null",
    "sample_value" : "/image/1.5MB/0/test99_test3_1.jpg"
}
```

!!! note "Typology"
    `component_image` is a **media** component. In server context it extends the abstract `component_media_common` (which extends `component_common`) and implements `component_media_interface`. It is *literal* in the broad sense that it owns its own data and never resolves a [locator](../locator.md) to another section, but it is **not** a literal-direct component: it stores a thin JSON pointer in its matrix `data` column and keeps the renderable bytes as files on disk. The concrete class only supplies image-specific constants (qualities, extensions, folder) and conversion/manipulation logic (rotate, crop, alternative formats, SVG overlay); everything structural — paths, upload binding, files-info reconstruction, URL building, delete/version handling, search — lives in the base. It is **non-translatable** (its language slot is `lg-nolan`).

!!! info "About `default_tools`"
    The list above is what a typical image instance receives in `context.tools` (verified from the model sample). The toolbar is assembled from the model + ontology, not hardcoded by the component class; concrete instances may carry a different subset. `tool_upload` provides the upload UI, `tool_media_versions` regenerates per-quality versions, `tool_image_rotation` drives `rotate()`, `tool_transcription` opens the transcription window and `tool_time_machine` browses deleted/older files.

## Definition

`component_image` manages a raster image bound to a record: upload, on-disk storage, quality versioning, alternative-format generation (e.g. AVIF/WebP), in-place manipulation (rotate, crop) and an SVG overlay used by the vector editor for drawing regions over the picture. It does not keep binary data in the database — the matrix `data` column holds only a small JSON pointer; the actual JPGs/TIFFs live under the media tree and are reconstructed on demand by scanning disk per quality and extension.

**Why it exists.** A cultural-heritage catalogue is image-heavy: a museum object photographed from several angles, the obverse/reverse of a coin, a scanned manuscript page, an excavation context photo, a portrait of a person. These assets must be uploaded once at full resolution, automatically derived into web-friendly qualities and thumbnails, protected behind the media access layer, and displayed inline in the record. `component_image` is the building block for exactly that. Because it is media-typed, it shares its data shape and the whole storage/upload/protection machinery with the other media components ([component_av](component_av.md), [component_pdf](component_pdf.md), [component_3d](component_3d.md), [component_svg](component_svg.md)).

**When to use it.**

- The main or secondary photograph of a museum object, artwork, coin or specimen.
- Scanned document pages or plates that are consumed as raster images (where a true vector workflow is not needed).
- Any picture that needs automatic thumbnails, multiple web qualities, rotation/crop tooling, or drawn region overlays (vector editor) on top of the image.

**When not to use it.**

- Vector graphics you want to embed/manipulate as XML (icons, line drawings) -> use [component_svg](component_svg.md), which preserves and can inline the SVG source.
- Audio or video -> [component_av](component_av.md). PDFs / multi-page documents -> [component_pdf](component_pdf.md). 3D models -> [component_3d](component_3d.md).
- A picture that is *not* hosted in Dédalo but referenced by URL: keep using `component_image` and point it at an external URL through the `external_source` property (it then serves the external link instead of a local file).

## Data model

**Data:** `array` with a **single item** (`data[0]`). The item is the persisted pointer plus a cached files snapshot, not the binary.

**Value:** `string` (the displayable URL of the default/thumb quality), or `null`. Resolved through `get_url()`; for an external image it is the configured external URL.

**Storage shape.** A component never touches the database; it reads and writes through its section, which stores the component data in its matrix `data` column. For `component_image` the persisted item carries:

- `original_normalized_name` — deterministic Dédalo filename of the original file, keeping its source extension (e.g. `test99_test3_1.jpg` / `..._1.tif`). The original (full-resolution) file is preserved under the `original` quality folder; all derived qualities are generated from it.
- `original_file_name` / `original_upload_date` — the user's upload filename and the upload timestamp.
- `modified_normalized_name` / `modified_file_name` / `modified_upload_date` — present only when a retouched/edited source exists (the `modified` quality), preserved under its own folder.
- `files_info` — a cached array describing the files that exist on disk per quality/extension. Each entry is `{quality, extension, file_name, file_path, file_size, file_time, file_exist}`. This is rebuilt by `get_files_info()` (which scans every quality × allowed/alternative extension) and is also persisted so reads do not have to stat the filesystem on every call.

Non-translatable, single item (the normal case — language slot `lg-nolan`):

```json
[
    {
        "id": 3,
        "files_info": [
            {"quality": "original", "extension": "jpg", "file_name": "rsc29_rsc170_16.jpg", "file_path": "/image/original/0/rsc29_rsc170_16.jpg", "file_size": 510249, "file_exist": true},
            {"quality": "original", "extension": "avif", "file_name": "rsc29_rsc170_16.avif", "file_path": "/image/original/0/rsc29_rsc170_16.avif", "file_size": 1098365, "file_exist": true},
            {"quality": "1.5MB", "extension": "jpg", "file_name": "rsc29_rsc170_16.jpg", "file_path": "/image/1.5MB/0/rsc29_rsc170_16.jpg", "file_size": 177293, "file_exist": true},
            {"quality": "thumb", "extension": "jpg", "file_name": "rsc29_rsc170_16.jpg", "file_path": "/image/thumb/0/rsc29_rsc170_16.jpg", "file_size": 11165, "file_exist": true}
        ],
        "original_file_name": "my photo 16.jpg",
        "original_upload_date": "2025-12-29 21:47:30",
        "original_normalized_name": "rsc29_rsc170_16.jpg"
    }
]
```

With a retouched/edited source (the `modified` quality keeps its own extension, e.g. a layered PNG/PSD):

```json
[
    {
        "id": 3,
        "files_info": [ "..." ],
        "original_file_name"       : "my photo 16.jpg",
        "original_normalized_name" : "rsc29_rsc170_16.jpg",
        "modified_file_name"       : "my photo 16 edited.png",
        "modified_normalized_name" : "rsc29_rsc170_16.png"
    }
]
```

External image (no local files; the picture is served from a URL resolved through the `external_source` property, see below):

```json
[
    { "external_source": "https://example.org/iiif/object_16/full/full/0/default.jpg" }
]
```

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). In the API payload the item array is surfaced under `data.entries`; the controller also adds top-level `external_source` and (in edit mode) `base_svg_url`, and stamps `context.features` with the live capability set — `allowed_extensions`, `ar_quality`, `default_quality`, `default_target_quality`, current `quality`, `extension`, `alternative_extensions` and a `key_dir` (`image_<tipo>_<section_tipo>`). In `list`/`tm` mode `data.entries` carries the reduced `get_list_value()` (only the default and thumb qualities in the component extension); in `edit` mode it carries the full `files_info`. `context` never carries the file bytes. See the *dedalo-context-data-layers* skill for the full layering rules.

## Ontology instantiation

A `component_image` is created as an ontology node whose `model` is `component_image`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node declares its label through the standard `lg-*` terms; being a media component it is normally **non-translatable** (`translatable: false`, language `lg-nolan`).

Node definition (shape):

```json
{
    "tipo"         : "rsc29",
    "model"        : "component_image",
    "parent"       : "rsc170",
    "section_tipo" : "rsc170",
    "lg-eng"       : "Image",
    "lg-spa"       : "Imagen",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block for the main photograph of an object, with files bucketed into folders of 1000 and a drawn-region overlay observing a related text component:

```json
{
    "max_items_folder" : 1000,
    "observe" : [
        {
            "client" : {
                "event"   : "click_tag_draw",
                "perform" : { "function": "load_tag_into_vector_editor" }
            },
            "component_tipo" : "rsc31"
        }
    ],
    "css" : {
        ".wrapper_component": { "grid-column": "span 7" }
    }
}
```

`section_tipo` / `parent` tell the section which column owns this component's data; on `save()` the component writes its pointer through `section_record->save_component_data()` (the section is the single writer to the database) and additionally materialises the SVG overlay file on disk when a `svg_file_data` item is present. The on-disk location is deterministic: filename is `id . '.' . extension` where `id = {component_tipo}_{section_tipo}_{section_id}` (`get_identifier()`), and the path is `DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path`. `folder` is `DEDALO_IMAGE_FOLDER`; `initial_media_path` and `additional_path` come from the properties below. Both `get_media_path_dir()` and `get_media_url_dir()` run `sanitize_quality()` (SEC-065 / MEDIA-04/05) so a client-supplied quality can never escape the media root.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component (and its media base):

### external_source

- **Values:** a component `tipo` (string) pointing at a [component_iri](component_iri.md) in the same section (e.g. `"rsc496"`).
- **Effect:** turns the component into a reference to an image **hosted outside Dédalo**. `get_external_source()` instantiates the referenced IRI component and, when its first value carries a `dataframe`/`iri`, uses that URL as the source. When set, `get_url()` / `get_id()` / `get_target_filename()` resolve to the external URL and no local media files are created. Only the IRI value is used to decide internal-vs-external; it is not consumed as a dataframe section.

### image_id

- **Values:** a component `tipo` (string), e.g. `{"image_id": "dd851"}`.
- **Effect:** overrides the deterministic filename `id`. Instead of `{component_tipo}_{section_tipo}_{section_id}`, `get_id()` reads the (trimmed, non-empty) value of the referenced component and uses it as the media filename base. Used when the file naming must follow a catalogued code rather than the internal identifier.

### target_filename

- **Values:** a component `tipo` (string) resolved via `safe_tipo()`, e.g. `"test100"`.
- **Effect:** on upload (`process_uploaded_file`), the user's original upload filename is written into the named [component_input_text](component_input_text.md) of the same record (and saved). Lets the catalogue keep a human-readable record of "what file was uploaded here".

### initial_media_path

- **Values:** an object keyed by component `tipo` -> path segment, e.g. `{"initial_media_path": {"rsc29": "my_custom_name"}}`.
- **Effect:** inserts an extra path segment between the media `folder` and the quality folder for this specific component, so its files live in a dedicated subtree. A leading slash is added if missing. Default: none.

### additional_path

- **Values:** a component `tipo` (string).
- **Effect:** appends a path segment **after** the quality folder, read from the value of the referenced component (slashes normalised). Used to shard files by a catalogued value. Takes precedence over the `max_items_folder` fallback.

### max_items_folder

- **Values:** integer (typically `1000`).
- **Effect:** when no `additional_path` component is configured, buckets files into numbered subfolders so a single directory never holds too many files: `additional_path = '/' . max_items_folder * floor(section_id / max_items_folder)` (e.g. section 16 -> `/0`, section 1500 -> `/1000`). Default behaviour when unset is no bucketing.

### observe / observers

- **Values:** arrays of observer/observable configuration objects (see the index page *Observers and observables* section).
- **Effect:** client-side wiring used by the image's vector editor. A typical `observe` entry subscribes to `click_tag_draw` (or `key_up_f2`) published by a related text component and runs the image method `load_tag_into_vector_editor` / `get_data_tag`, loading the clicked tag's drawn region into the overlay editor. Configured in the ontology, not hardcoded.

!!! note "Standard context properties"
    Like every component, `component_image` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

!!! info "Qualities and the original model"
    Qualities are **not** an ontology property — they come from Dédalo config constants. `get_ar_quality()` returns `DEDALO_IMAGE_AR_QUALITY` (e.g. `original, modified, 100MB, 50MB, 25MB, 6MB, 3MB, 2MB, 1.5MB, <1MB, thumb`); `get_default_quality()` is `DEDALO_IMAGE_QUALITY_DEFAULT` (e.g. `1.5MB`), `get_original_quality()` is `DEDALO_IMAGE_QUALITY_ORIGINAL`, `get_modified_quality()` is `DEDALO_IMAGE_QUALITY_RETOUCHED`, and a `thumb` quality is generated as a JPG. Allowed upload extensions come from `DEDALO_IMAGE_EXTENSIONS_SUPPORTED` (jpg, jpeg, png, tif, tiff, bmp, psd, raw, webp, heic, avif), and `DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS` (e.g. `avif`) drives the alternative-format versions generated alongside each quality.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files. Verified from the source (JS render/view files + CSS):

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | — | Full wrapper: label, buttons, `content_data` with the image container (`.image_container > .img`), upload UI and quality selector in edit; thumbnail in list. |
| `line` | yes | — | — | Compact inline image cell (small fixed box). Falls through to the default edit view with line styling. |
| `mini` | yes | yes | — | Minimal `<img>` (`component_image_mini`), used in compact/service contexts. |
| `viewer` | yes | yes | — | Full-screen overlay viewer (`view_viewer`) with a download button; opens the image fit-to-screen. |
| `text` | — | yes | — | Textual list cell. |
| `mosaic` | — | yes | — | Grid/mosaic list layout for visual browsing. |
| `print` | yes | — | — | Reuses the `default` edit view but forces read-only rendering (`permissions = 1`) and tags the wrapper for print. |

Modes:

- **edit** — read/write a real record; surfaces the full default quality, the upload tooling, the per-quality selector, rotate/crop and the SVG vector-editor overlay (`base_svg_url`). The `image_quality_change_<id>` event swaps the displayed source between available qualities.
- **list / tm** — read-only listing using the reduced `get_list_value()` (default quality + thumb in the component extension). `tm` (Time Machine) reuses the list render; in `tm` mode `get_url()` resolves the last deleted file under the quality's `/deleted` folder so previously removed images can still be viewed.
- **search** — renders a plain text input filter (one per entry) that builds the SQO; saves are not performed in search mode.

DOM (edit / default): `wrapper_component component_image <tipo> <mode>` -> `label`, `buttons_container`, `content_data` -> `content_value` -> `.image_container` -> `img.img`.

## Import / export model

**Import.** `component_image` uses the shared `component_common::conform_import_data()`. A JSON value is decoded and stored as the item array (the pointer shape above: `original_normalized_name`, `files_info`, etc.); a value that fails JSON decoding is rejected and logged as `IGNORED: JSON decode failed` rather than stored. Note that importing the pointer JSON does **not** by itself create the binary files on disk — the files must exist (or be re-derived) in the media tree for the qualities listed in `files_info`. The normal way to populate an image is the upload flow, not CSV import. See [importing data](../importing_data.md).

Typical import structure (advanced — the persisted item):

```json
[{
    "original_normalized_name": "rsc29_rsc170_16.jpg",
    "original_file_name": "my photo 16.jpg",
    "original_upload_date": "2025-12-29 21:47:30",
    "files_info": [
        {"quality": "1.5MB", "extension": "jpg", "file_name": "rsc29_rsc170_16.jpg", "file_path": "/image/1.5MB/0/rsc29_rsc170_16.jpg", "file_exist": true}
    ]
}]
```

**Export.** `get_export_value()` (inherited from `component_media_common`) emits **one export atom** carrying the media URL with `cell_type: img`. The exported quality is the default quality in `edit` context and the thumb quality otherwise; URL absoluteness is taken from the `export_context` (relative vs absolute). For an external image the atom resolves to the `external_source` URL. `get_diffusion_value()` likewise reduces to the default-quality URL (or, when `DEDALO_PUBLICATION_CLEAN_URL` is on, to `id.extension`), and `get_diffusion_data()` lets a DDO request a specific `quality`/`extension`. See [exporting data](../exporting_data.md).

## Notes

- **Upload flow.** `dd_utils_api::upload()` (API, permission-gated, supports chunked uploads, confines the target path) moves the file into the media tree; then `tool_upload::process_uploaded_file` -> `component_media_common::add_file` -> `component_image::process_uploaded_file` records the original/modified name and date and calls `regenerate_component()`, which (re)builds normalized files, derived qualities, alternative-format files and the SVG overlay, then saves. `build_version(quality)` builds a single quality from the best available source (modified > original > nearest higher quality, via `get_image_source()`), using `ImageMagick` for convert/resize and `create_thumb()` for the thumbnail.
- **SVG overlay.** Beyond the raster files, the component maintains a per-image `.svg` file under the `/svg` subfolder (`get_svg_file_path()`), generated by `create_default_svg_string_node()` referencing the default-quality image. It backs the vector editor (drawn regions / masks over the picture) and is kept in sync on regenerate and deleted with the default quality in `remove_component_media_files()`. `get_file_content()` returns the SVG with the raster base64-embedded for inline use.
- **Image manipulation.** `rotate(options)` and `crop(options)` operate in place on a chosen quality/extension via `ImageMagick`; `pixel_to_centimeters()` / `get_image_print_dimensions()` compute print sizing from pixel dimensions and `DEDALO_IMAGE_PRINT_DPI`.
- **Access control.** Files are guarded by `media_protection` (modes via `DEDALO_MEDIA_ACCESS_MODE`: `false` / `private` / `publication`): logged-in users carry the fixed daily-rotated `dedalo_media_auth` cookie matched against a marker in `.publication/auth/`; anonymous publication access is limited to configured public qualities when the `.publication/pub/{section_tipo}_{section_id}` marker exists (maintained by the Bun `media_index.ts`). Enforcement is fail-closed at the web server. See the *dedalo-media-protection* skill.
- **Observers / observables.** This component's client overlay subscribes to events published by related components (e.g. `click_tag_draw`, `key_up_f2`) through the ontology `observe` block, running `load_tag_into_vector_editor` / `get_data_tag`. Wiring is configured in the ontology, not in the component code.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Upload and saves require level >= 2; uploads are additionally gated server-side by `assert_section_permission`.
- **Related components:** [component_av](component_av.md), [component_pdf](component_pdf.md), [component_3d](component_3d.md), [component_svg](component_svg.md), [component_iri](component_iri.md), [component_input_text](component_input_text.md), [component_portal](component_portal.md).
