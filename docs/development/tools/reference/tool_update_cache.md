# tool_update_cache

Bulk regeneration of the stored per-record data of one or more of a section's components across every matched record, run as a chunked background job with live progress.

!!! warning "Administrator tool"
    `tool_update_cache` re-saves records in bulk. It is meant for administrators doing maintenance (rebuilding derived data after an ontology or schema change), not for everyday cataloguing.

## What it does / why & when to use it

Some of a component's stored data is **derived** at save time — the relation-search ancestor index an autocomplete component keeps for fast lookup, counter reconciliation, denormalised text. When that derivation logic changes, or a batch of records was written by a path that skipped it, the stored value drifts from what a fresh save would produce. `tool_update_cache` fixes that in bulk: it walks every record a section filter matches and **re-saves** the selected components, so the save path re-runs its derivation for each one.

Concrete heritage scenario: a numismatics collection reworks its mint thesaurus so that the ancestor chain used by an autocomplete component changes. The stored index on thousands of *Coins* records is now stale. An administrator opens the tool on the *Coins* section, ticks the affected component, and runs it — every matched record is re-saved and its derived data is rebuilt, without opening a single record by hand.

Use it when: a component's *stored* value must be regenerated across many records (post-migration, post-ontology-change, or to repair drift). Do not use it to *change* data — it re-writes each component's current value back to itself; the value the user sees is unchanged, only its derivation is refreshed. To change a value across records, use [`tool_propagate_component_data`](tool_propagate_component_data.md).

## How it works (server + client)

**Server** (`tools/tool_update_cache/server/index.ts`) exposes two actions.

`get_component_list` enumerates the caller section's components through the shared `buildSectionElementsContext` (the "simple" element context, `src/core/resolve/section_elements_context.ts`), keeps only the `component` entries, and annotates each with its `regenerate_options`. Only media models return a non-null option set (`{ regenerable: true }`); everything else gets `null`. The result feeds the client's checkbox list.

`update_cache` does the regeneration:

1. Requires `section_tipo` and a non-empty `components_selection`; otherwise it fails closed with `invalid_request`.
2. **Requires** the client SQO (WC-043 — there is deliberately NO whole-section fallback: an absent sqo once silently swept a 438k-record section the client displayed as "Records: 1"; missing/malformed sqo fails closed with `invalid_request`). Sanitises it (`sanitizeClientSqo`) and forces `limit = null` / `offset = 0`, so the **whole matched set** — not just the visible page — is processed. The client sends a deep clone of the caller list's live sqo, so scope == what the list shows; an unfiltered list explicitly matches the whole section.
3. Assembles and runs the search (`buildSearchSql`) to get the matched `(section_tipo, section_id)` rows.
4. Iterates the rows. For each selected component tipo it resolves the model and branches:
   - **non-media** — reads the component's current items (`readComponentItems`) and re-saves them with a single `set_data` change through `saveComponentData` (`src/core/section/record/save_component.ts`), which re-runs the save path's derivation. Each such write increments `regenerated`.
   - **media** — **repairs the media** via the shared kernel `refreshMediaItems` (`src/core/media/repair.ts`, called with `regenerate: true`): rebuilds the file derivatives from the original where it is present on this box (`src/core/media/processing.ts` regenerate twins — the same seams upload ingest uses; image also re-creates the SVG envelope), then re-scans the disk; the handler persists the fresh `files_info` per stored item. The persist is the established files_info write-back (per-key jsonb via `updateMatrixKeyData`, **no Time Machine entry** — files_info is a filesystem-derived cache; `src/core/media/tools/files_info_persist.ts` documents the discipline), and `refreshStoredFilesInfo` preserves the sibling keys (`original_*`, `lib_data`). `component_av` derivative rebuild is an async transcode and is *not* enqueued here (that is tool_media_versions' job) — its `files_info` refresh still applies. A record whose original is absent on the box gets the honest result: derivatives no-op. **Shrinks are HELD** (`holdShrink: true`, counted in `media_held`): when the rescan finds FEWER existing files than the stored index claims — the signature of a partial local media copy, not of a stale index — the stored `files_info` is kept, never wiped; shrinking an index requires the ops script's explicit `--allow-shrink` adjudication. Derivative-build failures are collected into `media_errors`; the files_info refresh still lands.
5. Returns `{ result, msg, errors, regenerated, records, media_errors }`.

`update_cache` is listed in `backgroundRunnable`, and the client always calls it with `background_running: true`. `scheduleBackground` (`src/core/tools/background.ts`) submits the handler into the process-job registry and returns immediately with `{ result, background_job_id, job_id, pid, pfile }`; the handler streams progress through the same registry `dd_utils_api::get_process_status` reads from, so the client's progress panel renders live.

!!! note "The client sends `regenerate_options`, the server does not read them"
    The client composes each selection as `{ tipo, regenerate_options }` (e.g. `delete_normalized_files` for a media component), but `update_cache` reads only `sel.tipo`. The per-component options are collected in the UI and forwarded, but the current handler does not consume them.

**Client** (`tools/tool_update_cache/js/`):

- `tool_update_cache.js` is the instance. On `build()` it fetches the section's component tree via `get_component_list` into `self.components_list`. `update_cache()` composes `components_selection` from the ticked tipos and sends one background request (`use_worker:true`, `retries:1`, `timeout:3600000`).
- `render_tool_update_cache.js` renders the section info, a checkbox list of the components (media models and any admin-configured `hilite_tipos` are highlighted), an **Update records** button showing the affected record count, and a live progress area. On submit it confirms, fires the background request, then opens an SSE stream (`data_manager.request_stream` → `read_stream`) against `dd_utils_api::get_process_status` using the returned `pid`/`pfile`, showing a running counter and a final summary. A persisted `pid`/`pfile` in IndexedDB (`process_update_cache`) lets the progress panel re-attach to a still-running job when the panel is reopened.

## Actions & options

```ts
apiActions: {
	get_component_list: { permission: 'section', minLevel: 1, handler: getComponentList },
	update_cache:       { permission: 'section', minLevel: 2, handler: updateCache },
},
backgroundRunnable: ['update_cache'],
```

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `get_component_list` | declarative: `section` @ level 1 (read) | no | `ar_section_tipo`, `use_real_sections`, `ar_components_exclude` |
| `update_cache` | declarative: `section` @ level 2 (write) | yes (`backgroundRunnable`; client sends `background_running:true`) | `section_tipo`, `components_selection`, `sqo`, `lang` |

Key options read by `update_cache`:

| Option | Type | Meaning |
| --- | --- | --- |
| `section_tipo` | string (req.) | Target section. Required; missing it fails with `invalid_request`. |
| `components_selection` | array (req.) | The components to regenerate, `[{ tipo, regenerate_options }, …]`. Non-empty required. Only `tipo` is read. |
| `sqo` | object (req.) | The selection to act on — REQUIRED (WC-043, no whole-section default; absent ⇒ `invalid_request`). Server forces the full result set (`limit=null`, `offset=0`). The client sends the caller list's live sqo (cloned). |
| `lang` | string | Application language; used for the translatable-component write language (non-translatable components write `lg-nolan`). |
| `background_running` | bool | Set `true` by the client to run detached (`scheduleBackground`). |

Response: `{ result, msg, errors, regenerated, records, processed, stopped, media_errors, media_held }` — `regenerated` is the number of component writes (media and non-media), `records` the number of matched records, `processed` how many were fully processed (`< records` only after a stop), `stopped` whether the run ended by cooperative cancellation, `media_errors` the count of media derivative rebuilds that failed (each detailed in `errors`; the files_info refresh still landed for them), `media_held` the count of stored media indexes kept because the rescan found fewer files than stored (shrink guard).

**Progress & stop (WC-043):** the handler publishes throttled per-record frames through `ctx.publishProgress` — `{msg, is_running, counter, total, current:{section_id}, n_components}`, exactly the fields the client's stream renderer formats — and checks `ctx.signal?.aborted` at each record boundary. The generic Stop button posts `dd_utils_api::stop_process {pid, pfile}` (registered since WC-043; `src/core/api/process_status.ts stopUtilsProcess` — owner-gated, aborts the job's controller), so a run stops cooperatively after the current record and returns the partial summary.

## How it is registered & surfaced

`tools/tool_update_cache/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_update_cache`; `dd1327` version (`2.0.6`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer (`Dédalo team`).
- `dd799` label = "Update cache" (localised); `dd612` description = "Manages Dédalo components cache clean actions".
- `dd1331` show_in_inspector and `dd1332` show_in_component both resolve to **no** (dd64 section_id `2`), and `dd1354` active = **yes** (dd64 section_id `1`). The tool is a **section-level** tool: the client reads `self.caller.section_tipo` / `self.caller.total`, listing and regenerating that section's components.
- `dd999` / `dd1633` carry `hilite_tipos` (flagged `"client": true`) — the admin-configured list of component tipos the client highlights in the checkbox list for easy location.
- `dd1372` labels supply the localised UI strings: `updated`, `components`, `delete_normalized_files`, `regenerate_options`, `info`.

## Examples

Client-side background request (built by `tool_update_cache.js::update_cache`, sent through `dd_tools_api`):

```js
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : create_source(self, 'update_cache'), // → tool_update_cache::update_cache
    options : {
        background_running   : true,
        section_tipo         : 'rsc167',           // Coins section
        components_selection : [
            { tipo: 'rsc167-mint', regenerate_options: null }
        ],
        lang                 : page_globals.dedalo_application_lang
    }
}

const api_response = await data_manager.request({ use_worker:true, body:rqo, retries:1, timeout:3600*1000 })
// api_response → { result:true, background_job_id, job_id, pid, pfile }
// progress is then streamed via dd_utils_api::get_process_status using pid/pfile
```

A completed (non-background) response object:

```json
{
    "result": true,
    "msg": "OK. update_cache regenerated 800 component(s) across 800 record(s).",
    "errors": [],
    "regenerated": 800,
    "records": 800,
    "media_errors": 0
}
```

## Related

- [tool_propagate_component_data](tool_propagate_component_data.md) — the other background, SQO-driven bulk operation over a section's records; propagate *changes* a component's value, update_cache re-derives it.
- [tool_media_versions](tool_media_versions.md) — per-record, on-demand media version building (higher tiers, deletes, rotation); update_cache's media repair rebuilds only the default quality + thumb (+ image SVG envelope) in bulk, and never enqueues av transcodes.
- `scripts/media_repair_files_info.ts` — the cross-section ops sweep for stale `files_info` (dry-run default, shrink-guarded, no derivative rebuild); update_cache is the in-app per-section equivalent. Both drive the shared kernel `src/core/media/repair.ts` (`refreshMediaItems`).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, gates and background execution this page builds on.
- Search subsystem (SQO): the selection contract this tool consumes — `src/core/search/`.
- User guide: [Update cache](../../../tools/using_update_cache.md).
- Source: `tools/tool_update_cache/server/index.ts`, `tools/tool_update_cache/js/{tool_update_cache,render_tool_update_cache}.js`, `tools/tool_update_cache/register.json`.
