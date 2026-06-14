# tool_posterframe

Extracts a posterframe (thumbnail) from an audiovisual file with FFmpeg at a chosen timecode, and optionally attaches that frame as the *identifying image* of a target portal record.

## What it does / why & when to use it

`tool_posterframe` opens on an audiovisual component (`component_av`, also `component_3d`) and gives the cataloguer a player with three actions below it:

- **Create** / **Delete** the component's own *posterframe* — the still image that represents the video in lists, grids and the media player itself.
- **Create identifying image** — grab the frame visible at the current playhead position and push it, as a real `component_image`, into a new record of a related portal that has been declared (in the ontology) as the *identifying image* of this AV's section.

The first two actions are the everyday case: a video has no thumbnail, or its auto-generated thumbnail landed on a black/title frame. The operator scrubs to a representative frame and presses **Create**; FFmpeg writes a poster image alongside the video and the UI refreshes.

The third action solves a heritage-specific problem. In an oral-history archive (`oh1`), an interview record holds the video, but the public catalogue and the related "Person" or "Event" records want a *face* — a representative still. By configuring a portal on the related section with the ontology property `identifying_image` (pointing at the image component that should hold the frame), the cataloguer can, from the interview's video, capture the exact frame where the interviewee is best framed and have the tool create the related record and store that frame as its identifying image — no manual screenshot, crop, upload and re-link.

Concrete scenario: an `oh1` interview video is open. The operator scrubs to `00:14:32`, picks "Person — 318" from the identifying-image selector (offered because that Person section, reached by an inverse reference, exposes a portal with the `identifying_image` property), and presses **Create identifying image**. The tool adds a new element to that portal, extracts the frame to the `original` quality of the target image component, and processes it into the standard image qualities — so the Person record now shows that still wherever its image is displayed.

## How it works

### Server

`tools/tool_posterframe/class.tool_posterframe.php` extends `tool_common` and exposes exactly two API actions. It leans on FFmpeg (via the `Ffmpeg` wrapper), `component_av` (source paths), `component_image` (target storage + quality processing) and `component_portal` (record creation).

**`create_identifying_image(object $options)`** — the full capture-and-attach workflow:

1. **Validate + gate.** It requires `tipo`, `section_tipo`, `section_id`, `item_value` and `current_time`; any missing one fails closed with the list of missing fields. It then asserts permission on *both* ends — read (level 1) on the source AV `(section_tipo, tipo)` plus a per-record scope check on the source `section_id`, and write (level 2) on the target portal `(item_value->section_tipo, item_value->component_portal)` plus a per-record scope check on `item_value->section_id` when present. (These imperative `security::assert_*` calls are the gate — `API_ACTIONS` is list form here.)
2. **Create the destination record.** It instantiates the target `component_portal` (model resolved via `ontology_node::get_model_by_tipo`), reads its target section tipo with `get_ar_target_section_tipo()`, calls `add_new_element({target_section_tipo})` and `Save()`s — producing the new `section_id` that will hold the image.
3. **Resolve the target image path.** It instantiates the `component_image` (`item_value->component_image`) on that new record, sets it to `DEDALO_IMAGE_QUALITY_ORIGINAL`, and computes the `original`-quality target filepath.
4. **Find the source AV file.** It instantiates the `component_av` (`tipo`) and takes the `original`-quality media file path, falling back to the component's default quality; if neither exists it throws.
5. **Extract the frame.** `Ffmpeg::create_posterframe({timecode, src_file, quality, posterframe_filepath})` writes the frame at `current_time` to the target image's original path.
6. **Build the qualities.** It calls the image component's `process_uploaded_file()` to generate the standard formats/sizes, and returns `{result:true, msg:'OK. Posterframe created successfully'}`. Any exception is caught and returned as `{result:false, msg, errors}` and logged.

**`get_ar_identifying_image(object $request_options)`** — populates the selector. It requires `section_tipo` + `section_id`, asserts read (level 1) on the section plus a per-record scope check, loads the section, walks its **inverse references** (`section->get_inverse_references()`), and for each referencing section calls the private helper `get_identifying_image_from_section()`. That helper finds the referencing section's `component_portal` children and returns the first whose ontology `properties->identifying_image` is set — packaging `{section_id, section_tipo, component_portal, component_image, label}`. The action returns the array of all such matches (or `false`/`[]` when none).

The third method, `get_identifying_image_from_section()`, is **private** and deliberately absent from `API_ACTIONS`.

### Client

`tools/tool_posterframe/js/tool_posterframe.js` defines the tool instance; `render_tool_posterframe.js` builds the DOM. The tool restricts itself to AV-ish models (`this.ar_allowed = ['component_av', 'component_3d']`). On `build` it pins `self.main_element` to the `main_element` role of the `ddo_map` (the AV component). On `edit` it rebuilds that component in **`player`** view so the operator can navigate the stream frame by frame, then renders the action buttons beneath it.

Two distinct dispatch paths matter here:

- **Posterframe create/delete** buttons call `self.create_posterframe()` / `self.delete_posterframe()`, which delegate to the **AV component's own** methods (`component_av.prototype.create_posterframe` / `delete_posterframe`). Those hit the **`dd_component_av_api`**, *not* this tool — the tool is only the UI host for them, and they read the frame from the player's `video.currentTime`.
- **Create identifying image** button calls `self.create_identifying_image(item_value, current_time)`, which *does* go to `tool_posterframe` via `dd_tools_api` / `tool_request` (source built by `create_source(self, 'create_identifying_image')`), with `retries:1` and a 120 s timeout. The selector that supplies `item_value` is filled by `self.get_ar_identifying_image()` → the `get_ar_identifying_image` server action.

Both tool actions confirm with the user before running. The posterframe image preview falls back to `page_globals.fallback_image` on load error.

## Actions & options

`API_ACTIONS` is in **list form** — `['create_identifying_image', 'get_ar_identifying_image']`. There is no `BACKGROUND_RUNNABLE`; both run inline. Each method enforces its own permission gate imperatively (defense in depth), as shown below.

| Action | Permission gate (imperative) | Key options it reads | Returns (`result`) |
| --- | --- | --- | --- |
| `create_identifying_image` | read (1) on source `(section_tipo, tipo)` + record scope on `section_id`; **write (2)** on `(item_value->section_tipo, item_value->component_portal)` + record scope on `item_value->section_id` | `tipo` (AV component), `section_tipo`, `section_id` (source AV record); `item_value` `{ section_tipo, section_id, component_portal, component_image }` (the target); `current_time` (timecode, e.g. `"00:14:32.000"` or seconds from the player) | `true` on success (with `msg:'OK. Posterframe created successfully'`), else `false` + `errors` |
| `get_ar_identifying_image` | read (1) on `section_tipo` + record scope on `section_id` | `section_tipo`, `section_id` (the AV's section) | `array` of `{ section_id, section_tipo, component_portal, component_image, label }`, one per inverse-referencing section that exposes a portal with `properties.identifying_image` |

`item_value` for `create_identifying_image` is exactly one element of the `get_ar_identifying_image` result, so the UI round-trips it: read the selector options, then post the chosen one back.

The **ontology property that drives everything** is `identifying_image`, set on the *portal component* of the related section. Its value is the `tipo` of the image component that should receive the frame; the tool returns that as `component_image` and writes into it.

## How it is registered & surfaced

`tools/tool_posterframe/register.json` is a **legacy v6** file (raw record dump with `relations` / `components` keys), auto-converted at registration. Essentials decoded from its ontology tipos:

- `dd1326` name → `tool_posterframe`; `dd799` label → "Posterframe" (cat/spa/nep/…); `dd612` description → "Manages video posterframe images".
- `dd1327` version → `2.0.3`; `dd1328` `dedalo_version_min` → `6.0.0`; `dd1644` developer → "Dédalo team".
- `dd1330` (affected_models) relations point at AV/3D component models; `dd1331` (show_in_inspector) and `dd1332` (show_in_component) carry the surfacing flags; `dd1354` active → on.

Surfacing is element-driven in `common::get_tools()`. The tool attaches to **AV (and 3D) components** — it appears inline on the component and/or in the inspector per the `show_in_component` / `show_in_inspector` flags. It is not a section- or area-level tool. The client further guards on `this.ar_allowed` (`component_av`, `component_3d`), and the **Create identifying image** block only renders when the host model is `component_av`. Note that the identifying-image flow additionally requires a related section whose portal carries the `identifying_image` ontology property — without it, `get_ar_identifying_image` returns an empty list and the selector is empty.

## Examples

### Client tool_request (Create identifying image)

Built by `create_source(self, 'create_identifying_image')` and sent through `data_manager.request`:

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'create_identifying_image'), // { model:'tool_posterframe', action:'create_identifying_image', ... }
    options : {
        tipo         : 'oh18',          // the AV component
        section_tipo : 'oh1',           // the interview section
        section_id   : 5,               // the interview record
        item_value   : {                // one option returned by get_ar_identifying_image
            section_id       : 318,
            section_tipo     : 'rsc197',     // the related "Person" section
            component_portal : 'rsc205',     // its portal carrying properties.identifying_image
            component_image  : 'rsc29'       // the image component to fill
        },
        current_time : self.main_element.video.currentTime // e.g. 872.4 (seconds)
    }
}
// data_manager.request({ body: rqo, retries: 1, timeout: 120000 })
```

Server reply on success:

```json
{ "result": true, "msg": "OK. Posterframe created successfully", "errors": [] }
```

### Populating the selector (get_ar_identifying_image)

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'get_ar_identifying_image'),
    options : { section_tipo: 'oh1', section_id: 5 }
}
// response.result →
// [ { section_id:318, section_tipo:'rsc197', component_portal:'rsc205',
//     component_image:'rsc29', label:'Person' }, ... ]
```

### Ontology configuration that enables the flow

On the related section's portal component, set the ontology property:

```json
"identifying_image": "rsc29"
```

i.e. "frames captured for records reached through this portal are stored in image component `rsc29`". This single property is what `get_ar_identifying_image` matches and `create_identifying_image` writes into.

## Related

- [tool_media_versions](tool_media_versions.md) — manage the qualities/versions the posterframe and identifying image produce (build, rotate, delete, conform headers).
- [tool_import_files](tool_import_files.md) — bulk-ingest media files (incl. AV) and the records that wrap them; `tool_image_rotation` rotates/crops the resulting image files (see the [tools catalog](index.md)).
- [tool_subtitles](tool_subtitles.md), [tool_transcription](tool_transcription.md) — the other AV-centric tools that also host a media player and act on the same `component_av`.
- `component_av` `create_posterframe` / `delete_posterframe` (`core/component_av/`, `dd_component_av_api`) — the component-level posterframe actions this tool surfaces buttons for (these do **not** go through `tool_posterframe`).
- [Exporting data](../../../core/exporting_data.md) — the export side ([tool_export](tool_export.md)), for context on the wider tools catalog.
- [Creating tools](../creating_tools.md), [Server contract](../server_contract.md), [Security](../security.md) — the tool model, the PHP class contract, and the SEC-024 permission rules this tool follows.
