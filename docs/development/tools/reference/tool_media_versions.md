# tool_media_versions

Manages the on-disk media files behind a media component: inspect per-quality versions, delete a quality or a specific version, (re)build versions from the original, conform AV headers, rotate images, and re-sync the component's stored file metadata with what actually exists on disk.

## What it does / why & when to use it

A Dédalo media component (`component_image`, `component_av`, `component_pdf`, `component_3d`, `component_svg`) does not store a single file — it stores a *set of qualities* (e.g. `original`, `default`, `404`, `audio`, `thumb`, ...) derived from the uploaded master, each as a file on disk, plus a `files_info` block in the record that records which qualities exist. `tool_media_versions` is the panel a cataloguer or media administrator opens to manage that file set directly, without leaving the record.

It surfaces three things in one modal:

1. a **live preview** of the media component itself (read-only),
2. a **sync/regenerate** area that compares the qualities recorded in the database (`files_info_db`) against the qualities actually present on disk (`files_info_disk`) and flags a mismatch, and
3. a **versions grid**: one row per quality, showing the real file (name, size, existence) with per-quality buttons to open, (re)build, rotate, delete, or — for AV — conform headers.

Concrete heritage scenario: an archivist uploads a high-resolution TIFF master for a museum object. The streaming/web qualities (`default`, `404`, `thumb`) are generated automatically on upload, but the archivist notices the web preview is sideways. They open **Media versions** on the image component, **rotate** the affected quality, and the derived files are regenerated rotated. Later, a colleague manually deleted a couple of derived files on the server; the record now shows "Files info data is unsync". The archivist opens the tool, sees the disk/DB mismatch in the **Show data** panel, optionally ticks **Delete normalized files**, and presses **Regenerate** to rebuild the missing qualities and write a correct `files_info` back to the record. For an AV file that won't seek properly in the browser, they use **Conform headers** to rewrite the moov atom / headers of a quality.

Use it when: derived media qualities are missing, broken, rotated, un-seekable, or out of sync with the record. Do not use it to *upload* a new master (that is the upload flow / `tool_upload` / `tool_import_files`) — this tool operates on the files of an already-existing media component.

## How it works (server + client)

**Server** (`tools/tool_media_versions/class.tool_media_versions.php`). Every action is a thin, stateless wrapper: it reads `tipo` / `section_tipo` / `section_id` (plus action-specific params) from `options`, validates they are present, runs the security gates, instantiates the target media component via `ontology_node::get_model_by_tipo()` + `component_common::get_instance()`, and delegates to a method on that component. The tool itself owns no media logic — it routes to the component's own file methods:

| Action | Delegates to (component method) |
| --- | --- |
| `get_files_info` | `$component->get_files_info()` (probes each quality on disk) |
| `delete_quality` | `$component->delete_file($quality)` |
| `build_version` | `$component->build_version($quality, $async)` |
| `conform_headers` | `$component->conform_headers($quality)` |
| `rotate` | `$component->rotate($rotation_options)` for the matching quality entry |
| `sync_files` | `$component->get_data()` then `$component->regenerate_component($regenerate_options)` |
| `delete_version` | `$component->delete_thumb()` for the thumb quality, else `$component->delete_file($quality, $extension)` |

All seven methods return the standard `{ result, msg, errors }` envelope; the write actions merge the component response into that envelope. `sync_files` deliberately instantiates the component in `edit` mode with the data language and `cache=false`, and calls `get_data()` **before** `regenerate_component()` (so the regeneration runs against current data). `rotate` reads the component's `files_info`, matches the requested `quality`, and runs the rotation with `rotation_mode = 'expanded'` for each matching entry.

**Client** (`tools/tool_media_versions/js/`). `tool_media_versions.js` is the instance; it extends the standard tool lifecycle (`init` / `build` / `render` / `edit` from `tool_common`). In `build()` it resolves its `main_element` from `tool_config.ddo_map` (the ddo flagged with `role: 'main_element'`), finds that component instance in `ar_instances`, and pre-computes the file sets it needs: `files_info_db` (from the record's `entries[0].files_info`), `files_info_disk` (fetched live via `get_files_info`), and filtered views (`files_info_safe`, `files_info_alternative`, `files_info_original`). `render_tool_media_versions.js` builds the DOM: the read-only main-element preview, the sync/regenerate row, and the versions grid. Each client method (`delete_quality`, `build_version`, `conform_headers`, `rotate`, `sync_files`, `delete_version`) builds an RQO with `dd_api: 'dd_tools_api'`, `action: 'tool_request'`, `source: create_source(self, '<action>')`, and the options above, then calls `data_manager.request()`. The destructive/long actions confirm first (`confirm(get_label.sure)`) and use a long client timeout (`3600 * 1000` ms) with a single retry, because rebuilds can take minutes.

**Specific actions.** The rotate and conform-headers buttons are not shown on every media model. The tool's `properties.specific_actions` (from `register.json`) maps each action to the component models it applies to — `rotate` → `component_image`, `conform_headers` → `component_av` — and `render_tool_media_versions.js` only renders a specific action when `self.main_element.model` is in that action's model list.

## Actions & options

`API_ACTIONS` is declared in **list form** (membership only); each method asserts its own permissions imperatively at the top — a READ gate `security::assert_tipo_permission($section_tipo, $tipo, 1|2, …)` (level 1 for read, level 2 for the write actions) **plus** a per-record gate `security::assert_record_in_user_scope($section_tipo, (int)$section_id, …)`. There is no `BACKGROUND_RUNNABLE`: `build_version` runs its own work asynchronously inside the component (the `async` option), it is not forked through `process_runner.php`.

All actions read the same three required options — `tipo` (the component tipo), `section_tipo`, `section_id` — and refuse with an error envelope if any are missing.

| Action | Gate (level) | Extra required / read options | Purpose |
| --- | --- | --- | --- |
| `get_files_info` | tipo (1, read) + record | — | Probe disk for every quality; returns the `files_info` array (existence, name, path, url, size, time per quality). |
| `delete_quality` | tipo (2, write) + record | `quality` (req.) | Delete the file of one quality via `delete_file(quality)`. |
| `build_version` | tipo (2, write) + record | `quality` (req.), `async` (default `true`) | (Re)build one quality from the original. |
| `conform_headers` | tipo (2, write) + record | `quality` (req.) | Rebuild a quality rewriting file headers (AV seek/compatibility fix). |
| `rotate` | tipo (2, write) + record | `quality` (req.), `degrees` (req., e.g. `-90` / `90`) | Rotate the matching quality entries (`rotation_mode='expanded'`). |
| `sync_files` | tipo (2, write) + record | `regenerate_options` (object, e.g. `{ delete_normalized_files: bool }`) | Re-read data and `regenerate_component()` so `files_info` matches disk. |
| `delete_version` | tipo (2, write) + record | `quality` (req.), `extension` (optional) | Delete one specific version: `delete_thumb()` if `quality` is the thumb quality, else `delete_file(quality, extension)`. |

Response shape for every action: `{ result, msg, errors }`. For `get_files_info`, `result` is the files-info array (or `false` on failure); for the write actions `result` is the boolean / merged result of the delegated component method.

`delete_quality` vs `delete_version`: `delete_quality` removes a quality regardless of extension; `delete_version` targets one concrete file, handling the thumb specially and accepting an `extension` to disambiguate when a quality has more than one file (e.g. a `.pdf` main file alongside derivatives).

## How it is registered & surfaced

`tools/tool_media_versions/register.json` is a **legacy v6** file (a raw record dump keyed by `components` / `relations`); it is auto-converted to the column-keyed registry record at registration by `tools_register` (the `components` key triggers the v6 converter). Essentials it carries:

- `dd1326` name = `tool_media_versions`; `dd1327` version = `2.0.4`; `dd1328` minimum Dédalo version = `6.2.6`; `dd1644` developer = "Dédalo team".
- `dd1330` affected_models → the media component models (`component_image`, `component_av`, `component_pdf`, `component_3d`, `component_svg`). The tool therefore attaches to **components**, not to sections or areas.
- `dd1335` properties = `{ "specific_actions": { "rotate": ["component_image"], "conform_headers": ["component_av"] } }`. There is **no** `open_as` property, so the tool opens in the default **modal**.
- `dd1372` labels supply the localized UI strings (`show_data`, `sync_data`, `files_info_is_unsync`, `delete_normalized_files`, `regenerate`) across all project languages.
- `dd1331` show_in_inspector and `dd1332` show_in_component select where the button renders for the matched component.

Surfacing (in `common::get_tools()`): because `affected_models` lists the media component models, the **Media versions** button appears on those components when they are rendered (subject to the inspector/inline flags). The presence of the tool in a component's context is visible in the component sample fixtures, e.g. `core/component_image/samples/context.json`, `core/component_av/samples/context.json`, `core/component_pdf/samples/context.json`, `core/component_3d/samples/context.json` — each lists `{ "model": "tool_media_versions", "name": "tool_media_versions", ... }` in its tools array.

## Examples

Client-side `tool_request` (built by `tool_media_versions.js`, sent through `dd_tools_api`). Probe the real files of an image component:

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'get_files_info'), // → tool_media_versions::get_files_info
    options : {
        tipo         : self.main_element.tipo,         // e.g. 'rsc176' (the image component tipo)
        section_tipo : self.main_element.section_tipo,  // e.g. 'rsc167'
        section_id   : self.main_element.section_id      // e.g. 25
    }
}
const response = await data_manager.request({ body: rqo, use_worker: true })
// response.result → [{ quality:'original', file_exist:true, file_name:'rsc167_rsc176_25.tif', file_size: 1234567, ... }, ...]
```

Rotate the `default` quality 90° (write action, long timeout, confirm-gated client-side):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'rotate'), // → tool_media_versions::rotate
    options : {
        tipo         : self.main_element.tipo,
        section_tipo : self.main_element.section_tipo,
        section_id   : self.main_element.section_id,
        quality      : 'default',
        degrees      : 90
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
// response → { result:true, msg:'Success. Request done.', errors:[] }
```

Re-sync after files were removed on disk (rebuild + write correct `files_info`):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'sync_files'), // → tool_media_versions::sync_files
    options : {
        tipo               : self.main_element.tipo,
        section_tipo       : self.main_element.section_tipo,
        section_id         : self.main_element.section_id,
        regenerate_options : { delete_normalized_files: false }
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 3600 * 1000 })
// response → { result:true, msg:'Success. Request done' }
```

## Related

- [tool_image_rotation](index.md) — applies rotation + proportional crop to image-component files across all qualities (the standalone rotation tool); `tool_media_versions` exposes rotation inline as a per-quality `specific_action`.
- [tool_posterframe](tool_posterframe.md) — extracts a posterframe/thumbnail from an AV file; complements the AV quality/header management here.
- [tool_upload](index.md) · [tool_import_files](tool_import_files.md) — get the master file *into* a media component; `tool_media_versions` then manages the derived qualities of that master.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS`, permission gates and lifecycle this page builds on.
- Source: `tools/tool_media_versions/class.tool_media_versions.php`, `tools/tool_media_versions/register.json`, `tools/tool_media_versions/js/{tool_media_versions,render_tool_media_versions}.js`, `tools/tool_media_versions/css/tool_media_versions.less`. Component-side file methods live in the media components, e.g. `core/component_av/class.component_av.php`, `core/component_image/`.
