# tool_image_rotation

Rotates and proportionally crops an image component's derived files across every quality tier — the `original` master is always preserved — and hosts an in-browser AI background-removal pipeline.

## What it does / why & when to use it

A `component_image` stores one preserved **master** (the `original` quality) plus a set of generated **derivatives** (`default`, `404`, `thumb`, `1.5MB`, …), each a real file on disk indexed by the component's `files_info` block. `tool_image_rotation` lets an operator straighten or reframe an image without re-uploading it: it opens the image in an interactive editor, applies a rotation angle and an optional crop rectangle, and re-renders **every non-original tier** server-side with ImageMagick. The master is never touched, so the transform is always redoable from the pristine original.

The tool bundles a second, unrelated capability on the same panel: **background removal**, which runs the `briaai/RMBG-1.4` neural network entirely in the browser (WebGPU, WASM fallback), then uploads the cut-out PNG and re-derives the quality set through `tool_upload`.

Concrete heritage scenario: a photo archivist uploads a scanned print that came off the scanner sideways and with a black border. They open **Image rotation** on the image component, drag the angle slider until the horizon is level (with the alignment axes and "Expand" mode preventing corner clipping), draw a crop box to drop the border, and press the apply button. Every web/thumbnail quality is regenerated straight and cropped; the archived master stays exactly as scanned.

Use it when: a derived image needs straightening, reframing, or its subject isolated on a transparent background. It is **image-only** — the server refuses any component whose model is not `component_image`. To manage the wider quality set (build, delete, conform AV headers, sync), use `tool_media_versions`; to get a file *into* the component in the first place, use the upload flow / `tool_upload` / `tool_import_files`.

## How it works (server + client)

**Server** (`tools/tool_image_rotation/server/index.ts`). One API action, `apply_rotation`, declaratively gated `permission: 'record', minLevel: 2` (write + per-record project scope). The handler resolves the media tool context (`resolveMediaToolContext`, `src/core/media/tool_support.ts`), **refuses unless `spec.model === 'component_image'`**, reads the tiers to touch from the stored `files_info` (falling back to a live disk scan via `getFilesInfoCore` when the record has none), and delegates to the rotation core `applyRotationCore` (`src/core/media/tools/rotation.ts`). After the transform it re-scans disk and writes the refreshed `files_info` back to the record with `persistScannedFilesInfo` (rotation changes tier dimensions, so the cached metadata must be renewed). It returns `{ result, msg, errors, rotated, cropped, files_info }`.

The rotation core enforces the **Original law**: it iterates the entries, **skips `spec.originalQuality`** and any tier whose file is absent, and rewrites each derivative through a temp-file + rename. The rotate pass is skipped when `degrees` is `0` or `NaN`. The crop pass runs only when a `cropArea` with positive width and height is supplied; each tier's box is scaled from the default-quality reference dimensions, and rotate errors are collected per tier rather than aborting the whole run.

**Client** (`tools/tool_image_rotation/js/`). `tool_image_rotation.js` is the instance (extends the `tool_common` lifecycle); it pins `self.main_element` to the `ddo_map` entry flagged `role: 'main_element'` — the `component_image` being edited. `render_tool_image_rotation.js` builds the editor: a live CSS-`transform` preview, an angle slider and numeric input synchronised bidirectionally (range `-360…360`, step `0.01`), a background colour picker, a "Transparent" (alpha) toggle, an "Expand" toggle that grows the container to the rotated bounding box so corners are not clipped, alignment-axis guides, and the crop overlay. The apply button gathers the parameters and calls `self.apply_rotation()`, which confirms (`confirm(get_label.sure)`), builds the `dd_tools_api` / `tool_request` RQO, dispatches through `data_manager.request`, and on success force-reloads the cache-busted preview. `render_tool_image_crop.js` is the drag-to-select crop overlay (rubber-band draw, eight compass-point resize handles, move) that maintains `render_tool_image_crop.crop_area` — read directly by `apply_rotation`.

**Background removal.** The "Remove background" button drives `automatic_background_removal()`, which spawns `core/tools_common/js/processors/remove_background/remove_background.js` as a module Worker, runs `briaai/RMBG-1.4` (device `'webgpu'`), converts the model output to a PNG blob, uploads it with `service_upload`, and calls the exported `process_uploaded_file` from `tools/tool_upload/js/tool_upload.js` to re-derive the quality set into the `'modified'` quality. `ua.check_transformers_webgpu()` gates compatibility with a `confirm()` warning when WebGPU is absent. This path is **client-only** — it never calls `tool_image_rotation`'s server action.

!!! info "crop_area units"
    The rotation core (`src/core/media/tools/rotation.ts`) documents `cropArea` as a **proportional box (fractions `0..1`)** of the default-quality reference, scaled per tier. The crop overlay (`render_tool_image_crop.js::update_crop_area`) currently emits the box in **natural (integer pixel) coordinates**. This discrepancy is called out as unverified — treat the server contract (fractional) as authoritative and confirm the client mapping before relying on the crop pass.

## Actions & options

`apply_rotation` is the only remotely callable action. `permission: 'record', minLevel: 2` runs before the handler. There is no `backgroundRunnable` — the rotation runs inline. Required options are `tipo` (the image component tipo), `section_tipo`, `section_id`; the transform parameters are read from the same `options` object.

| Action | Gate | Options it reads | Purpose |
| --- | --- | --- | --- |
| `apply_rotation` | `record`, level 2 | `tipo`, `section_tipo`, `section_id` (req.); `rotation_degrees` (number; `0` skips the rotate pass); `rotation_mode` (`'expanded'` grows the canvas, else `'default'`); `background_color` (hex, e.g. `#ffffff`; default `#ffffff`); `crop_area` (`{ x, y, width, height }` or `null`) | Rotate + optionally crop every non-original tier; refresh and persist `files_info`. |

Response: `{ result, msg, errors, rotated, cropped, files_info }` — `result` is `true` when `errors` is empty; `rotated` / `cropped` list the touched absolute paths.

!!! note "`alpha` and the client"
    The client sends an `alpha` flag (transparent background) alongside the rotation options, but the server handler maps only `rotation_degrees`, `rotation_mode`, `background_color` and `crop_area` into the core call. Transparency at render time is governed by the tier's own extension/format (alpha-capable formats such as PNG/AVIF), not by a distinct server option.

## How it is registered & surfaced

`tools/tool_image_rotation/register.json` is a **column-keyed dump** (a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials it carries:

- `dd1326` name = `tool_image_rotation`; `dd799` label = "Image rotation" (per project language); `dd612` description = "Accurately manages image rotation".
- `dd1327` version = `2.0.0`; `dd1328` minimum Dédalo version = `6.7.0`; `dd1644` developer = "Dédalo team".
- `dd1330` affected_models → the image model. The tool attaches to `component_image` **components**, not to sections or areas — matching the server's image-only guard.
- No `dd1335` properties block with an `open_as` key, so the tool opens in the default **modal**.
- `dd1372` labels supply the localized UI strings across project languages: `rotation`, `bk_colour`, `transparent`, `expand`, `degrees`, `remove_background`, `backgroun_removal_completed`, `processing_image`, `setting_up`, `procesing`, `cpu_device`. (`backgroun_removal_completed` is spelled without the second `d` in the registration — reproduced verbatim.)

Surfacing (in `getElementTools`, `src/core/tools/registry.ts`): because `affected_models` names the image model, the **Image rotation** button appears on `component_image` when it is rendered, subject to the `dd1331` show_in_inspector / `dd1332` show_in_component flags. The presence of the tool on the component is visible in `src/core/components/component_image/samples/context.json`.

## Examples

Client `tool_request` built by `create_source(self, 'apply_rotation')` and sent through `dd_tools_api`. Rotate every derived tier by 90° with a white background, no crop:

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'apply_rotation'), // → tool_image_rotation::apply_rotation
    options : {
        tipo             : self.main_element.tipo,          // e.g. 'rsc29' (the image component)
        section_tipo     : self.main_element.section_tipo,   // e.g. 'rsc170'
        section_id       : self.main_element.section_id,     // e.g. 1
        rotation_degrees : 90,
        rotation_mode    : 'expanded',
        background_color : '#ffffff',
        alpha            : false,
        crop_area        : null
    }
}
const response = await data_manager.request({ body: rqo })
// response → { result:true, msg:'ok', errors:[], rotated:[...], cropped:[], files_info:[...] }
```

Rotate a small angle and crop (crop box read from the overlay's `render_tool_image_crop.crop_area`):

```js
const options = {
    rotation_degrees : output.value,               // e.g. '64.8'
    background_color : color_picker.value,          // '#ffffff'
    alpha            : alpha_checkbox.checked,
    rotation_mode    : expanded_checkbox.checked ? 'expanded' : 'default',
    crop_area        : render_tool_image_crop.crop_area // { x, y, width, height } or null
}
const ok = await self.apply_rotation(options) // confirms, then dispatches apply_rotation
```

## Related

- [tool_media_versions](tool_media_versions.md) — the broader per-quality manager (build, delete, conform headers, sync); it also exposes a per-quality **rotate** as a `specific_action`, whereas `tool_image_rotation` is the full interactive rotate + crop editor for `component_image`.
- [tool_upload](tool_upload.md) — the post-upload ingest action this tool calls to re-derive the quality set after background removal.
- [tool_posterframe](tool_posterframe.md) — the AV/3D still-frame tool; the other media editor hosting a component preview.
- [Media pipeline](../../media_pipeline.md) — the end-to-end media lifecycle (master → derivatives → protection → diffusion) this tool operates within.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) · [Security](../security.md) — the tool model, `apiActions`, permission gates and lifecycle this page builds on.
- Source: `tools/tool_image_rotation/server/index.ts`, `tools/tool_image_rotation/register.json`, `tools/tool_image_rotation/js/{tool_image_rotation,render_tool_image_rotation,render_tool_image_crop}.js`, `tools/tool_image_rotation/css/tool_image_rotation.less`. The rotation core is `src/core/media/tools/rotation.ts` (ImageMagick adapter under `src/core/media/engine/`).
