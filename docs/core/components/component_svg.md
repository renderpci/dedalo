# component_svg

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : true,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_media_versions",
        "tool_time_machine",
        "tool_upload"
    ],
    "render_views" :[
        {
            "view" : "default | line | print",
            "mode" : "edit"
        },
        {
            "view" : "default | mini | text | tag",
            "mode" : "list | tm"
        },
        {
            "view" : "viewer",
            "mode" : "edit"
        }
    ],
    "data"        : "array (single-element file descriptor)",
    "sample_data" : [
        {
            "id"                      : 1,
            "files_info"              : [],
            "original_file_name"      : "my_drawing.svg",
            "original_upload_date"    : { "timestamp": "2025-11-29 10:26:59" },
            "original_normalized_name": "rsc855_rsc302_1.svg"
        }
    ],
    "value"        : "string (default-quality URL) | string (external_source) | null",
    "sample_value" : "/svg/web/0/rsc855_rsc302_1.svg"
}
```

!!! note "Typology"
    `component_svg` is a **media** component. In server context it extends the abstract `component_media_common` (which extends `component_common`) and implements `component_media_interface`. Like the other media components ([component_image](component_image.md), `component_av`, `component_3d`, `component_pdf`) it does **not** store binary data in the section matrix: the `media` data column holds only a thin JSON pointer to the files that live on disk under `DEDALO_MEDIA_PATH`. The concrete `component_svg` class only supplies the SVG-specific constants (folder, extension, qualities) and the SVG-specific thumbnail/conversion logic; all the structural machinery (path/URL building, `get_files_info()`, upload binding, versioning, access control, search) lives in the base.

!!! info "About `default_tools`"
    The list above is what an `edit`-mode instance receives in `context.tools` (verified from the component sample context): `tool_media_versions` (manage the quality variants), `tool_time_machine` and `tool_upload` (the file picker that drives the upload flow). The toolbar is assembled from the model + ontology; the component class does not hardcode it, so an instance can be configured with a narrower or wider set.

!!! note "Annotation overlays"
    Besides standing on its own, `component_svg` is also used as an **annotation overlay** layer on top of other media (for example a vector layer drawn over a [component_image](component_image.md) or video frame). The data model is identical; only the meaning of the drawing changes.

## Definition

`component_svg` manages **Scalable Vector Graphics** files: upload, normalized storage, quality variants and a raster thumbnail for previews. It is the media component to reach for whenever the asset is a *vector* drawing rather than a raster photograph.

**Why it exists.** A vector image is a resolution-independent XML document, not a pixel grid. Storing it as a [component_image](component_image.md) would either rasterize it (losing scalability) or treat the `.svg` as an opaque blob with no preview. `component_svg` keeps the original `.svg` byte-for-byte, exposes its URL for `<img src>` embedding, can return the **raw XML content** for inline DOM embedding (so paths can be styled/animated by the page CSS/JS), and still generates a raster `thumb` (JPG via ImageMagick) for list grids and contexts where rendering the full vector is undesirable.

**When to use it.**

- Line drawings, plans, diagrams, maps, technical illustrations, coats of arms, monograms, logos and seals — anything authored as a vector.
- Numismatic / epigraphic *tracings* and reconstruction drawings that must scale crisply at any zoom.
- Vector **annotation layers** drawn over another media asset.

**When not to use it.**

- A photograph or scanned raster image -> use [component_image](component_image.md).
- Audio or video -> use `component_av`. A 3D model -> use `component_3d`. A document -> use `component_pdf`.
- A value that points at another record (a person, a place, a thesaurus term) -> use a related component such as [component_portal](component_portal.md) or [component_select](component_select.md).

## Data model

**Data type:** `array`. A media component stores a single-element array; the only meaningful entry is `data[0]`, a file *descriptor* object.

**Value type:** `string` (the default-quality URL, or the `external_source` URL when the media lives outside Dédalo), or `null`.

**Storage shape.** A component never touches the database directly; it reads and writes through its section, which persists the component data in its matrix `media` column. The stored descriptor describes the **source** filenames, not the renderable files. Its real keys (verified from `process_uploaded_file()` and `get_files_info()`):

```json
[
    {
        "id"                      : 1,
        "original_file_name"      : "my_drawing.svg",
        "original_normalized_name": "rsc855_rsc302_1.svg",
        "original_upload_date"    : { "timestamp": "2025-11-29 10:26:59" }
    }
]
```

- `original_file_name` — the human filename as uploaded by the cataloguer.
- `original_normalized_name` — the deterministic on-disk name of the original-quality file (keeps the source extension).
- `original_upload_date` — a Dédalo date object (`dd_date`) recording when the original was bound.

`component_svg` is **non-translatable** (`translatable:false`); the constructor forces `lang = lg-nolan` for every instance. (Among the media components only `component_pdf` can be translatable.)

!!! note "files_info is reconstructed, not stored"
    The live picture of the renderable files is **not** kept in the descriptor — it is rebuilt on demand by `get_files_info()`, which scans the disk per quality and per allowed extension. Each resolved file is a `files_info` object:

    ```json
    {
        "quality"   : "web",
        "extension" : "svg",
        "file_name" : "rsc855_rsc302_1.svg",
        "file_path" : "/svg/web/0/rsc855_rsc302_1.svg",
        "file_size" : 38481,
        "file_time" : { "timestamp": "2025-11-29 10:26:59" },
        "file_exist": true
    }
    ```

    For an external link (`external_source`, see below) `get_quality_file_info()` returns a synthetic item with `external:true` and `file_path` set to the remote URL. The `files_info` list is what travels to the client inside `data.entries[0].files_info`; the client picks the entry whose `quality` matches the instance quality.

**Naming and storage (deterministic).** The on-disk filename is `id . '.' . extension`, where the id is the component identifier `{component_tipo}_{section_tipo}_{section_id}` (no `_lang` suffix because SVG is non-translatable) and the extension is `svg` (`DEDALO_SVG_EXTENSION`). The directory is

```text
DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path
```

where `folder` is `DEDALO_SVG_FOLDER` (`/svg`), `initial_media_path` comes from the section's `initial_media_path` property and `additional_path` from the component's `additional_path` / `max_items_folder` properties. Both `get_media_path_dir()` and `get_media_url_dir()` run `sanitize_quality()` (SEC-065 / MEDIA-04 / MEDIA-05) so a client-supplied quality can never escape into the filesystem path.

## Ontology instantiation

A `component_svg` is created as an ontology node whose `model` is `component_svg`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. Because it is non-translatable, the node sets `translatable: false`; the component reads the label and flags in `load_structure_data()` at construction and forces `lg-nolan`.

Node definition (shape, taken from a real instance — `rsc855` *Vectorial* in section `rsc302`):

```json
{
    "tipo"         : "rsc855",
    "model"        : "component_svg",
    "parent"       : "rsc302",
    "section_tipo" : "rsc302",
    "lg-eng"       : "Vector drawing",
    "lg-spa"       : "Vectorial",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block (the one shipped with the sample instance), folding new files into 1000-item subfolders and pinning the grid width:

```json
{
    "additional_path"  : "rsc33",
    "max_items_folder" : 1000,
    "css" : {
        ".wrapper_component": { "grid-column": "span 1" }
    }
}
```

`section_tipo` / `parent` tell the section which `media` column owns this component's data. The component is **not** the database writer: the file bytes are placed on disk by the upload flow, and the descriptor is persisted through `section_record->save_component_data()` when the section saves.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON (the storage-path ones can also live in the parent **section** `properties`). Verified names consumed by `component_svg` / `component_media_common`:

### additional_path

- **Values:** a component `tipo` (string) whose resolved value is appended to the media path, e.g. `"rsc33"`.
- **Effect:** computed by `get_additional_path()`. The referenced sibling component is instantiated (`lg-nolan`), its value trimmed and slash-normalized, and the result appended after `quality` in both the filesystem path and the URL. Lets media files be foldered by a meaningful catalogue value instead of a flat directory.

### max_items_folder

- **Values:** integer (commonly `1000`).
- **Effect:** the fallback used by `get_additional_path()` **when `additional_path` is not set**. Files are bucketed into numbered subfolders of at most `max_items_folder` items: `additional_path = '/' . max_items_folder * floor(section_id / max_items_folder)` (e.g. section 1 -> `/0`, section 1500 -> `/1000`). Keeps directories from growing unbounded.

### initial_media_path *(section property)*

- **Values:** string path fragment, keyed by component `tipo`, declared in the **section** `properties` under `initial_media_path`.
- **Effect:** read by `get_initial_media_path()`; inserted between `folder` and `quality` (a leading `/` is forced). Used to relocate a component's media tree to a custom base directory.

### external_source

- **Values:** a component `tipo` (string) pointing at a sibling [component_iri](component_iri.md) that holds an external URL.
- **Effect:** read by `get_external_source()`. When set and the record has an id, the SVG is treated as a **link to a file outside Dédalo media**: `get_url()`, `get_quality_file_info()` (synthetic `external:true` item), `get_diffusion_value()` and `get_export_value()` all resolve to that remote URL instead of a local path, and no local files are scanned. Use it to reference a vector hosted on another system.

!!! note "Standard context properties"
    Like every component, `component_svg` honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). The component controller additionally publishes a `context.features` block with the resolved media facts: `allowed_extensions`, `default_target_quality` (= original), `ar_quality`, `default_quality`, current `quality`, `key_dir` (`"svg"`), `alternative_extensions` and `extension`. These are read-only descriptors the client uses to pick the right file; they are not configurable options. Any other custom key seen in production should be verified in the ontology.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files (`render_edit_component_svg.js`, `render_list_component_svg.js`, `render_search_component_svg.js`). Verified from the source and CSS:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | — | Edit: `image_container` + `<img class="image svg_element">` lazy-loaded via `IntersectionObserver` with a fade-in; an empty value shows the fallback image, clickable to fire `tool_upload`. List: a single `<img>` (thumb preferred, then default quality, then fallback) that opens the full-screen `viewer` window on click, or `tool_upload` when no file exists. |
| `line` | yes | — | — | Edit only. Reuses the default `content_data` but drops the label and adds an *exit edit* button (compact inline). |
| `print` | yes | — | — | Edit only. Reuses the `default` edit render but forces `permissions = 1` so the value is rendered read-only (no upload chrome) for print/PDF contexts. |
| `mini` | — | yes | — | Minimal `<img>` inside a `component_svg_mini` wrapper, image height clamped to one text row; used in compact listings / autocomplete. |
| `text` | — | yes | — | Renders the file as an `<img>` whose `src` is the resolved URL, inside a bare `<span>`, with an `error` handler that falls back to `page_globals.fallback_image`. |
| `tag` | — | yes | — | Used by `service_autocomplete` grid *choose*: an `<img class="svg">` carrying a `data-data` dataset (`section_tipo`/`section_id`/`component_tipo`). Prefers the default quality (`web`), falls back to thumb. |
| `viewer` | yes | — | — | Full-viewport presentation (`height: calc(100vh - 3rem)`), opened in a dedicated window from the list `default` view click handler. |
| (search) | — | — | yes | `render_search_component_svg.js` renders a plain text `<input class="input_value">` per filter; on change it builds an `update` `changed_data` item and publishes `change_search_element`. Saves are not performed in search mode. |

Modes:

- **edit** — read/write a real record; shows the current default-quality SVG and the upload UI; an empty value renders the upload-trigger fallback image.
- **list / tm** — read-only listing; `list` and `tm` share the same render. `get_list_value()` produces a reduced descriptor keeping only the default and thumb qualities; in `tm` (Time Machine) `get_url()` resolves the last deleted file under the `/deleted` directory.
- **search** — emits an SQO filter input (plain text); no media is uploaded or rendered.

DOM (edit / default): `wrapper_component component_svg <tipo> <mode> view_default media_wrapper` -> `label`, `buttons_container` (tools + optional full-screen button), `content_data media_content_data` -> `content_value media_content_value` -> `image_container` -> `img.image.svg_element`.

## Import / export model

**Import.** `component_svg` has no bespoke `conform_import_data()`; it uses the shared `component_common::conform_import_data()`. Because media is **not** in `components_using_value_property`, a plain CSV string is *not* auto-wrapped into a `{value:…}` item — pass the descriptor as JSON (or a lang-keyed object, though SVG only has `lg-nolan`). The practical import payload is the file descriptor array:

```json
[{
    "original_file_name"      : "icon.svg",
    "original_normalized_name": "rsc855_rsc302_1.svg",
    "original_upload_date"    : { "timestamp": "2025-01-01 12:00:00" }
}]
```

Importing the descriptor records the metadata; the actual `.svg` bytes must already exist on disk under the deterministic path (importing the descriptor does not move bytes). For interactive ingestion the normal path is the **upload flow** (see Notes), which both stores the bytes and writes the descriptor. See [importing data](../importing_data.md).

**Export.** `component_media_common::get_export_value()` emits a single export atom with `cell_type: "img"` whose scalar value is the resolved URL: the **default quality** URL in `edit` mode, the **thumb** quality URL in list/export contexts, or the `external_source` URL when the SVG links outside Dédalo. `get_diffusion_value()` reduces to the default-quality URL (or the bare `id.extension` filename when `DEDALO_PUBLICATION_CLEAN_URL` is on), returning `null` when no default-quality file exists. See [exporting data](../exporting_data.md).

## Notes

- **Qualities / versions.** `get_ar_quality()` returns `DEDALO_SVG_AR_QUALITY = ["original","web"]`; `get_default_quality()` is `web` (`DEDALO_SVG_QUALITY_DEFAULT`) and `get_original_quality()` is `original`. The base adds a raster `thumb` quality (extension `jpg`, from `DEDALO_THUMB_EXTENSION`) generated by `create_thumb()`, which rasterizes the default-quality SVG with ImageMagick (density 150, antialias, resized to the thumb dimensions). The original `.svg` is preserved byte-for-byte under the `original` folder; the `web` quality is normally the same SVG.
- **Inline content.** `get_file_content()` returns the raw SVG XML as a string (or `null` if the file is missing) for inline embedding when you need to manipulate the SVG DOM rather than reference it as `<img>`. `get_default_svg_url()` and `get_url_from_locator()` are static helpers (the latter resolves a media URL from a locator after validating the component/section models).
- **Upload flow.** Uploading is a four-step chain: `dd_utils_api::upload()` (API, permission-gated, chunk-aware, path-confined `move_uploaded_file`) -> `tool_upload::process_uploaded_file()` (sets the target quality) -> `component_media_common::add_file()` -> `component_svg::process_uploaded_file()`, which records `original_file_name` / `original_normalized_name` / `original_upload_date` and then calls `regenerate_component()` to (re)build the qualities and thumb.
- **Access control.** Files are guarded by `media_protection` (modes via `DEDALO_MEDIA_ACCESS_MODE`: `false` / `private` / `publication`): a fixed daily-rotated `dedalo_media_auth` cookie for logged-in users, and per-record `.publication/pub/{section_tipo}_{section_id}` markers (maintained by the Bun `media_index.ts`) for anonymous publication access. Enforcement is fail-closed at the web server (.htaccess / nginx). See the *dedalo-media-protection* skill.
- **Observers / observables.** No client `events_subscription.js` ships for this component; observer/observable wiring, when needed, is configured in the ontology `properties` like any other component (see the index page *Observers and observables* section), not in the component code.
- **Security.** `sanitize_quality()` (SEC-065 / MEDIA-04 / MEDIA-05) confines the client-supplied quality before it reaches any filesystem path or URL. The JSON controller fails closed when reached directly over HTTP (SEC-026).
- **`update_data_version`.** A static migration hook; the SVG `switch` has no version-specific cases, so it returns `result = 0` (nothing to migrate).
- **Related components:** [component_image](component_image.md), component_av, component_3d, component_pdf, [component_iri](component_iri.md) (external_source source), [component_portal](component_portal.md), [component_select](component_select.md).
