# tool_time_machine

Audit/history view and reversion of record and component changes over time, reading from the `matrix_time_machine` (dd15) change log.

## What it does / why & when to use it

Dédalo records **every user change** to a record's data as a row in the `matrix_time_machine` table (dd15). `tool_time_machine` is the UI that lets a person browse that history for one element and **restore** an earlier version. The user picks a past entry, sees the "Now" value side-by-side with the historical value, and — with **Apply and save** — overwrites the live data from the snapshot. It works on two scopes:

- a **single component** (e.g. one date, one input text), restoring just that component's data, and
- a whole **section record** (restoring all of the record's components at once, including recovering files that were deleted with it).

It also exposes a third, admin-only operation: reverting a whole **bulk process** — undoing in one action every change a batch tool (e.g. [`tool_propagate_component_data`](tool_propagate_component_data.md)) made across many records under one `bulk_process_id`.

Concrete heritage scenario: a cataloguer notices that the *dating* of a coin issue was changed last week to the wrong century. They open the time machine on that *Date* component, see the change list (when / who / what value), select the entry from before the bad edit — the previous value renders in the preview pane — and press **Apply and save**. The component is restored to the correct dating, and the restore itself is logged as a new activity entry. If instead an admin discovers that a propagate-component-data run mis-set a field across 400 records, they open the tool on any affected record, pick the row carrying that run's `bulk_process_id`, and **Revert the bulk process** — every record touched by that run is rolled back to its pre-run value in one operation.

Use it when: someone needs to see the edit history of a record/component, or roll back a mistaken edit or a mistaken batch run. It is not a diff/merge tool and not a general undo stack — it restores a chosen snapshot wholesale into the live row.

## How it works (server + client)

The change log lives in the dd15 `matrix_time_machine` table, accessed server-side through the TS TM read/write helpers (`src/core/db/time_machine.ts`, `src/core/resolve/read_tm.ts` — see the `dedalo-time-machine` skill). Each TM row carries the element's full data snapshot plus metadata (when `dd559`, who `dd578`, what component `dd577`, section_tipo/section_id, and an optional `bulk_process_id`).

**Client** (`tools/tool_time_machine/js/`):

- `tool_time_machine.js` is the instance. On `build()` it resolves the calling element as `main_element` (for a section caller it loads the section instance itself) and creates a **`service_time_machine`** instance — the shared service that renders the scrollable history list (`core/services/service_time_machine/`). The service's `ddo_map`/config is derived from `main_element` and runs in `mode:'tm'` so the list reads rows from the TM table rather than live data.
- `render_tool_time_machine.js` lays out the tool in a two-column grid: a **current** ("Now") pane, a **preview** pane, a tool bar (language selector + buttons), and the history list. The tool bar and side-by-side panes only render for non-section callers.
- When the user clicks a list row's preview/eye icon, the service publishes the `tm_edit_record` event; the tool's handler loads the historical component in `load_mode:'tm'` with the row's `matrix_id` into the preview pane (read-only: permissions forced to 1, tools/interface disabled), stores the `selected_matrix_id`, and reveals **Apply and save**. If the picked row has a `bulk_process_id`, a global admin additionally sees **Revert the bulk process** (others see an "contact an administrator" notice).
- **Apply and save** calls `apply_value(...)`; **Revert the bulk process** calls `bulk_revert_process(...)`. Both go through `data_manager.request` to `dd_tools_api`; on success in a popped-out window the tool closes itself.

**Server** (`tools/tool_time_machine/server/{index,tool_time_machine,bulk_revert}.ts`):

- `apply_value` reads the TM snapshot for `matrix_id`, then branches on the target's model:
  - **section** — overwrites the section's stored data; on success it recovers any deleted section media files, logs a recovery activity, and **deletes** the consumed TM row.
  - **component_** — overwrites the component's stored data. Dataframe-bearing components are handled first: each dataframe ddo's slice of the snapshot is filtered out by `from_component_tipo` and pushed as its own TM-sourced write (which does not itself create new TM rows — the main component's save records the revert). Relation components and `component_iri` get their own snapshot-slice filtering.
- `bulk_revert_process` searches for every TM row sharing the given `bulk_process_id`, creates a **new** bulk-process section record (so the revert is itself reversible) and labels it, then for each affected `(section_tipo, tipo, section_id)` finds the row that immediately *precedes* the bulk change (`preBulkState`, `bulk_revert.ts`) and restores that component to its pre-run value (an empty array when the bulk change was the component's only history). Each restored component is tagged with the new `bulk_process_id` before write.

## Actions & options

`apiActions` is declared with a **declarative** gate per action — the framework enforces it before dispatch, matching the PHP oracle's map-form `API_ACTIONS`:

```ts
apiActions: {
	apply_value: { permission: 'tipo', minLevel: 2, handler: toolTimeMachineApplyValue },
	bulk_revert_process: { permission: 'section', minLevel: 2, handler: toolTimeMachineBulkRevert },
},
```

| Action | Permission gate | Reads from `options` |
| --- | --- | --- |
| `apply_value` | declarative: `tipo` @ level 2 (write) on `(section_tipo, tipo)`. For a section restore `tipo === section_tipo`, so it is equivalent to the section gate. ⬜ **No per-record project-scope check** on TS (the PHP oracle additionally asserts `assert_record_in_user_scope`; the TS handler has no equivalent `getPermissions`/scope call beyond the declarative `tipo` gate — a non-admin's project-filter scoping is not enforced here on a TS-served install). | `section_tipo`, `section_id`, `tipo`, `lang`, `matrix_id`, `caller_dataframe` |
| `bulk_revert_process` | declarative: `section` @ level 2 (write). Plus imperative **per-row** re-gate: `getPermissions(section_tipo, tipo) >= 2` for every record in the bulk set (rows the caller cannot write are skipped with a `permissions_denied:…` error, not aborting the whole run). ⬜ Same scope caveat as `apply_value` — the per-row re-gate checks the section/tipo permission level only, with no project-scope (`section_id`-in-scope) check found in the handler. | `section_tipo`, `section_id`, `tipo`, `lang`, `bulk_process_id`, `bulk_revert_process_label` |

Key option meanings:

| Option | Type | Meaning |
| --- | --- | --- |
| `section_tipo` | string (req.) | Target section. Also the gate scope. |
| `section_id` | string/int | Target record; gated against the user's project scope. |
| `tipo` | string (req. for `apply_value`) | The element being restored; its model decides the section-vs-component branch. Missing `section_tipo`/`tipo`/`matrix_id` fails closed (`invalid_request`). |
| `lang` | string | Component language to restore. |
| `matrix_id` | int (req. for `apply_value`) | The chosen `matrix_time_machine` row id (the snapshot to restore). |
| `caller_dataframe` | object | Set when the caller is a dataframe element, so the restore targets the right dataframe slice. |
| `bulk_process_id` | int (req. for `bulk_revert_process`) | The batch run to undo; all rows with this id are reverted. |
| `bulk_revert_process_label` | string | Human label stored on the new revert process record. |

Both actions return the standard `{result, msg, errors}`; `apply_value` on a section restore also returns `restore_deleted_section_media_files`. Neither action is listed in `backgroundRunnable` — they run inline (the client gives `bulk_revert_process` a 180 s timeout).

There is also a lifecycle hook (never inside `apiActions`):

```ts
isAvailable: (context) => context.callerModel !== 'component_relation_children',
```

`component_relation_children` has no time-machine data, so the tool hides itself there — this is now declared by the module itself rather than resolved via a core fallback (contrast `tool_diffusion`, which still needs one; see [Server contract](../server_contract.md)).

## How it is registered & surfaced

`tools/tool_time_machine/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_time_machine`; `dd1327` version (`2.0.4`); `dd1328` minimum Dédalo version (`6.2.5`); `dd1644` developer (Dédalo team).
- `dd799` label = "Time machine" (localized across project languages); `dd612` description = "Access and retrieve versions of change history data".
- `dd1335` properties = `{ "open_as": "window", "windowFeatures": null }` → the tool opens in its own window.
- `dd1372` labels supply the localized UI strings used by the client: `apply_and_save`, `recover_section_alert`, `revert_bulk_process`, `info_revert_bulk_process`, `bulk_revert_confirm_msg` (with a `{0}` process-id placeholder), and `bulk_revert_process_label`.

Surfacing (in `getElementTools`, `src/core/tools/registry.ts`): the tool attaches to **record elements** — both components and section records — and uses its `isAvailable` hook as the last word, hiding only on `component_relation_children`. (Note: this register.json does not carry an explicit `dd1330` affected_models relation; surfacing is element/availability-driven, and the bulk-revert UI is further restricted to global admins client-side via `page_globals.is_global_admin`.) ⬜ The PHP oracle's one related core policy — on the dd15 time-machine section only `tool_export` is allowed — has no confirmed TS equivalent (same gap noted on [tool_export](tool_export.md)'s page).

## Examples

Restoring a single component's value (client `apply_value`, built by `tool_time_machine.js` and sent through `dd_tools_api`):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'apply_value'), // → tool_time_machine::apply_value
    options : {
        section_tipo : 'rsc167',  // the record's section
        section_id   : '482',     // the record
        tipo         : 'rsc170',  // the component being restored
        lang         : 'lg-eng',
        matrix_id    : 91237      // the chosen matrix_time_machine row
        // caller_dataframe : {...}  // only when the caller is a dataframe element
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 60000 })
// response → { result:true, msg:'OK. Request done successfully', errors:[] }
```

Reverting a whole batch run (admin-only `bulk_revert_process`):

```js
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : create_source(self, 'bulk_revert_process'), // → tool_time_machine::bulk_revert_process
    options : {
        section_tipo              : 'rsc167',
        section_id                : '482',
        tipo                      : 'rsc170',
        lang                      : 'lg-eng',
        bulk_process_id           : 5571,                 // the run to undo
        bulk_revert_process_label : 'Reversed the process with id 5571 > …'
    }
}
const response = await data_manager.request({ body: rqo, retries: 1, timeout: 180000 })
```

A section restore is the same `apply_value` call with `tipo === section_tipo` (the model resolves to `section`); on success the response additionally carries `restore_deleted_section_media_files`.

## Related

- [tool_propagate_component_data](tool_propagate_component_data.md) — the batch tool whose runs `bulk_revert_process` undoes (it stamps the `bulk_process_id` that links the change set).
- [tool_export](tool_export.md) — the only tool allowed on the dd15 time-machine section, enabling time-machine exports; see [Exporting data](../../../core/exporting_data.md).
- [section_record](../../../core/sections/section_record.md) — the save/restore path `apply_value` uses for the section branch (including deleted-media recovery).
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, gates and lifecycle this page builds on.
- Source: `tools/tool_time_machine/server/{index,tool_time_machine,bulk_revert}.ts`, `tools/tool_time_machine/js/{tool_time_machine,render_tool_time_machine}.js`; TM core: `src/core/db/time_machine.ts`, `src/core/resolve/read_tm.ts` (see the `dedalo-time-machine` skill); client service: `core/services/service_time_machine/` (unchanged).
