# component_3d

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
        "tool_posterframe",
        "tool_time_machine",
        "tool_upload"
    ],
    "render_views" :[
        {
            "view" : "default | line",
            "mode" : "edit"
        },
        {
            "view" : "default | column | mini | text",
            "mode" : "list | tm"
        },
        {
            "view" : "default",
            "mode" : "search"
        }
    ],
    "data"        : "array (single item)",
    "sample_data" : [
        {
            "id": 4,
            "files_info": [
                {
                    "quality": "original",
                    "extension": "glb",
                    "file_name": "test26_test3_1.glb",
                    "file_path": "/3d/original/0/test26_test3_1.glb",
                    "file_size": 4780672,
                    "file_time": { "timestamp": "2025-12-25 22:53:39" },
                    "file_exist": true
                },
                {
                    "quality": "web",
                    "extension": "glb",
                    "file_name": "test26_test3_1.glb",
                    "file_path": "/3d/web/0/test26_test3_1.glb",
                    "file_exist": true
                },
                {
                    "quality": "thumb",
                    "extension": "jpg",
                    "file_name": "test26_test3_1.jpg",
                    "file_path": "/3d/thumb/0/test26_test3_1.jpg",
                    "file_exist": true
                }
            ],
            "original_file_name": "venus_statue.glb",
            "original_upload_date": { "timestamp": "2025-12-25 22:53:39" },
            "original_normalized_name": "test26_test3_1.glb"
        }
    ],
    "value"        : "string (url) | null",
    "sample_value" : "/3d/web/0/test26_test3_1.glb"
}
```

!!! note "Typology"
    `component_3d` is a **literal-media** component. Like the other media components (`component_image`, `component_av`, `component_pdf`, `component_svg`) it extends the abstract `component_media_common` (which in turn extends `component_common`) and implements `component_media_interface`. It does **not** store binary data in the section matrix; the matrix `data` column holds a thin JSON pointer to the 3D files on disk. The concrete `component_3d` class only supplies the type-specific constants (`DEDALO_3D_*`), the posterframe handling and the conversion hooks — everything structural lives in the base.

!!! info "About `default_tools`"
    The list above is what a 3D instance receives in `context.tools` (verified from the model sample `core/component_3d/samples/context.json`): `tool_media_versions`, `tool_posterframe`, `tool_time_machine` and `tool_upload`. The toolbar is assembled from the model + ontology; the component class does not hardcode it.

## Definition

`component_3d` manages **3D model files** as a media field of a section. It handles upload, on-disk storage, quality/versioning, a still **posterframe** image (and a raster thumbnail derived from it for list views), and serves the displayable file URL for an interactive WebGL viewer. The client renders the model in `edit` mode with a three.js-based viewer (`core/component_3d/js/viewer/viewer.js`, loaded via the `three` import map); `list`/`tm`/`search` show the lightweight poster/thumb image instead of loading the heavy model.

**Why it exists.** Cultural-heritage collections increasingly include 3D captures of objects — photogrammetry or laser-scan models of sculptures, ceramics, coins, architectural fragments, archaeological finds. These need first-class management (versioned originals, a web-optimised delivery copy, a preview still) exactly like images or audiovisual files, but with a vector/mesh payload and an interactive viewer rather than a flat raster. `component_3d` is the field type for that payload.

**When to use it.**

- A record needs an interactive 3D model the cataloguer uploads and the public can rotate/zoom: *3D model of a statue*, *Scan of a vessel*, *Photogrammetry of a relief*.
- The source comes from a scanning/modelling pipeline as `.glb`, `.gltf`, `.obj`, `.fbx`, `.dae` (or a `.zip` bundle), and you want Dédalo to keep the original plus a `web` delivery copy and a still preview.

**When not to use it.**

- A flat raster photograph of the object → use `component_image`.
- Audio or video documentation → use `component_av`.
- A vector drawing / line art for inline embedding → use [component_svg](component_svg.md).
- A document (catalogue sheet, report) → use `component_pdf`.

## Data model

**Data:** `array` with a **single item** (`data[0]`). The item is an object that, after `regenerate_component()` runs, carries the source-file descriptors (`original_file_name`, `original_normalized_name`, `original_upload_date`) and the live `files_info` array reconstructed from disk.

**Value:** `string` (the default-quality file URL) or `null`. As with every component the stored unit is an array; the displayable value is derived from it.

**Storage shape.** A component never touches the database directly; it reads and writes through its section, which stores the component data in the section matrix `data` column. For `component_3d` the persisted item describes the **source filenames**, not the renderable files — the renderable picture (`files_info`) is reconstructed at read time by `get_files_info()`, which scans disk per quality and extension. Because 3D is non-translatable, the single item lives in the `lg-nolan` slot.

Stored item (on disk, before files_info is recomputed — see `core/component_3d/samples/data.json`):

```json
[
    {
        "id": 4,
        "original_file_name": "venus_statue.glb",
        "original_normalized_name": "test26_test3_1.glb",
        "original_upload_date": { "timestamp": "2025-12-25 22:53:39" },
        "files_info": [
            { "quality": "original", "extension": "glb", "file_name": "test26_test3_1.glb", "file_path": "/3d/original/0/test26_test3_1.glb", "file_exist": true },
            { "quality": "web",      "extension": "glb", "file_name": "test26_test3_1.glb", "file_path": "/3d/web/0/test26_test3_1.glb",      "file_exist": true },
            { "quality": "thumb",    "extension": "jpg", "file_name": "test26_test3_1.jpg", "file_path": "/3d/thumb/0/test26_test3_1.jpg",    "file_exist": true }
        ]
    }
]
```

API datum (`get_data_item`, surfaced under `data.entries` — see `core/component_3d/samples/api_data.json`): the same item plus a top-level `posterframe_url` and, in `edit` mode, a `media_info` field (the media-streams header, currently `false` for 3D).

!!! note "Naming & storage path"
    The on-disk filename is deterministic: `id . '.' . extension`, where `id = {component_tipo}_{section_tipo}_{order_id}` (e.g. `test26_test3_1.glb`). The full path is `DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path + '/' + file_name`. `folder` is `DEDALO_3D_FOLDER` (`/3d`); `initial_media_path` / `additional_path` come from section properties (see *Properties & options*). `get_media_path_dir` / `get_media_url_dir` both run `sanitize_quality()` (SEC-065) to keep client-supplied quality values out of the filesystem path. The posterframe lives in a sibling `posterframe` quality folder: `DEDALO_3D_FOLDER + '/posterframe' + additional_path + '/' + id . '.jpg'`.

## Ontology instantiation

A `component_3d` is created as an ontology node whose `model` is `component_3d`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node declares its label through the standard `lg-*` terms; it is non-translatable, so `translatable` is `false` (and may be omitted, since media is non-translatable by default).

Node definition (shape):

```json
{
    "tipo"         : "test26",
    "model"        : "component_3d",
    "parent"       : "test3",
    "section_tipo" : "test3",
    "lg-eng"       : "3D model",
    "lg-spa"       : "Modelo 3D",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block — split the on-disk storage into folders of at most 1000 records and give the field a wide grid span:

```json
{
    "max_items_folder" : 1000,
    "css" : {
        ".wrapper_component": { "grid-column": "span 12" }
    }
}
```

`section_tipo` / `parent` tell the section which column owns this component's data; on `save()` the component hands its data column to the section, which is the single writer to the database. The 3D **files** themselves are written to disk by the upload pipeline and the conversion hooks, not by the section save.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by `component_3d` / `component_media_common`:

### max_items_folder

- **Values:** integer (commonly `1000`).
- **Effect:** controls the on-disk fan-out. When no explicit `additional_path` is configured, `get_additional_path()` derives the per-quality subfolder as `'/' . max_items_folder * floor(section_id / max_items_folder)` (e.g. record 1 → `/0`, record 1500 → `/1000`). Keeps directories from accumulating an unbounded number of files. If unset and no `additional_path` is given, no extra subfolder is added.

### additional_path

- **Values:** a component `tipo` (e.g. an `component_input_text` column in the same section).
- **Effect:** when present, `get_additional_path()` reads that component's value for the current record and uses it (normalised to a leading slash, no trailing slash) as the subfolder appended after the quality folder. Lets the media tree mirror a meaningful per-record path instead of the numeric `max_items_folder` buckets. Takes precedence over `max_items_folder`.

### initial_media_path

- **Values:** string (verify in ontology).
- **Effect:** an extra path segment inserted between `folder` and the quality folder (`get_initial_media_path()` / `get_media_path_dir`). Used to namespace a component's media under a custom subtree.

### external_source

- **Values:** a component `tipo` (typically a `component_iri`) in the same section.
- **Effect:** marks the media as living **outside** Dédalo. `get_external_source()` resolves the referenced IRI component's value; when set, diffusion/export use that external URI instead of a local file URL. Primarily exercised by `component_image`; available on the shared base.

### target_filename

- **Values:** a component `tipo` (e.g. a `component_input_text` "Original file name").
- **Effect:** when the stored item has no `original_file_name`, `regenerate_component()` reads this component's value to populate `original_file_name` / `original_normalized_name` / `original_upload_date`.

!!! note "Standard context properties"
    Like every component, `component_3d` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

!!! info "Qualities are config, not properties"
    The quality model is fixed in config, not in node `properties`: `DEDALO_3D_AR_QUALITY = ['original','web']`, `DEDALO_3D_QUALITY_ORIGINAL = 'original'`, `DEDALO_3D_QUALITY_DEFAULT = 'web'`, plus a `thumb` quality. Supported upload extensions are `DEDALO_3D_EXTENSIONS_SUPPORTED = ['glb','gltf','obj','fbx','dae','zip']`; the canonical/best delivery extension is `glb` (`DEDALO_3D_EXTENSION`, `get_best_extensions()` → `['glb']`).

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files. Verified from `core/component_3d/js/`:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | yes | edit: full interactive three.js viewer (`view_default_edit_3d`) with quality selector, control buttons and posterframe fallback; list: poster/thumb `<img>` (`view_default_list_3d`); search: a text `input` filter (`render_search_component_3d`). |
| `line` | yes | — | — | Compact edit variant; the label node is suppressed, otherwise renders the default edit view. |
| `column` | — | yes | — | Falls through to the `default` list view. |
| `mini` | — | yes | — | Minimal `<img>` thumbnail (`view_mini_list_3d`), `component_3d_mini`. |
| `text` | — | yes | — | Small inline `<img>` (`view_text_list_3d`). |
| `print` | yes | — | — | Reuses the edit render but forces read-only (`permissions = 1`). |

Modes:

- **edit** — read/write. Loads the three.js viewer to display the `web`-quality model interactively; a quality selector lists the existing `glb` files; the posterframe image is the fallback/preview. `tool_upload` binds a new model; `tool_posterframe` captures a still (the client `create_posterframe()` renders the current view to a JPG, uploads it and calls the `dd_component_3d_api::move_file_to_dir` action, which also builds the thumb).
- **list / tm** — read-only. `tm` (Time Machine) reuses the list render. Both show the still image (thumb, falling back to posterframe), never the heavy model.
- **search** — builds a simple text filter input; one `input` per filter, publishing `change_search_element`.

DOM (edit / default): `wrapper_component component_3d <tipo> edit media_wrapper` → `label`, `buttons`, `content_data.media_content_data` → `content_value` (canvas viewer + `posterframe` + control buttons).

## Import / export model

**Import.** Media import binds files into the component rather than transmitting binary in the row. A 3D item is described with the same structure as the stored data — `files_info` plus the source-file fields — and the system normalises and generates the qualities on processing:

```json
[{
    "original_file_name": "venus_statue.glb",
    "original_upload_date": "2025-12-25 22:53:39",
    "files_info": [
        { "quality": "original", "extension": "glb", "file_name": "test26_test3_1.glb", "file_path": "/3d/original/0/test26_test3_1.glb" }
    ]
}]
```

See [importing data](../importing_data.md).

**Export.** `get_export_value()` emits a **single export atom** carrying the 3D model URL with `cell_type` `img`. In `edit` mode it is the default-quality (`web`) model URL; otherwise it is the **posterframe** URL (`get_posterframe_url()`). URL absoluteness comes from the `export_context` (`absolute_urls`). When the media is external (`external_source`), diffusion/export surface the external URI instead. See [exporting data](../exporting_data.md).

## Notes

- **Conversion pipeline (current state).** The class is wired for transcoding but does not yet transcode: the base `build_version('web')` simply **copies** the original file to the `web` quality (the response message reminds implementers to override for real conversion), and `process_uploaded_file()` carries a `TODO` to transform inputs into `.glb`. Config defines converter paths for future use — `DEDALO_3D_GLTFPACK_PATH` (`.obj`/`.gltf` → `.glb`/`.gltf`), `DEDALO_3D_FBX2GLTF_PATH` (`.fbx`), `DEDALO_3D_COLLADA2GLTF_PATH` (`.dae`). Non-`.glb` uploads are stored as-is until the conversion is implemented. `get_media_attributes()` and `create_posterframe()` (server) are likewise not implemented yet; the posterframe is generated client-side from the three.js viewer.
- **Posterframe & thumb.** The posterframe is a JPG still kept in a `posterframe` quality folder. `create_thumb()` rasterises it (via ImageMagick) into the `thumb` quality used by list/mini/text views. `remove_component_media_files()` / `restore_component_media_files()` extend the base to also move/restore the posterframe under the `deleted` folder (Time Machine recovery).
- **API actions.** `dd_component_3d_api` exposes exactly two allowlisted actions (SEC-024): `move_file_to_dir` (binds an uploaded posterframe blob to the component, write permission ≥ 2 required, then builds the thumb and saves) and `delete_posterframe`. The model upload itself goes through the shared `dd_utils_api::upload()` → `tool_upload` pipeline.
- **Access control.** Files are guarded by `media_protection` (`DEDALO_MEDIA_ACCESS_MODE`: `false` / `private` / `publication`): logged-in users carry the fixed `dedalo_media_auth` cookie matched against a daily marker in `.publication/auth/`; anonymous publication access is allowed only for configured public-quality folders when the `.publication/pub/{section_tipo}_{section_id}` marker exists. Enforced fail-closed by the web server. See the *dedalo-media-protection* skill.
- **Default tools.** A 3D instance exposes `tool_media_versions`, `tool_posterframe`, `tool_time_machine` and `tool_upload` in `context.tools`. Tools are read-only context.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Read users (level 1) get a read-only render; uploads, posterframe writes, deletes and saves require level ≥ 2.
- **Related components:** [component_svg](component_svg.md), `component_image`, `component_av`, `component_pdf` (the other media components, all sharing `component_media_common`); [component_iri](component_iri.md) (used as `external_source` / `target_filename`), [component_input_text](component_input_text.md).