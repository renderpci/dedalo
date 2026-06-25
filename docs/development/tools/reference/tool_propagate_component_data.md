# tool_propagate_component_data

Batch replace / add / delete of a single component's data across every record matched by a search query object (SQO), tracked as one bulk process for audit and time-machine reversion.

## What it does / why & when to use it

`tool_propagate_component_data` takes the value the user has just composed in one component and **propagates it to the same component across many records at once** — the whole filtered selection of the current section. It is the bulk-edit counterpart to editing a single record by hand: instead of opening 800 coins one by one, you set the value once and apply it to all 800.

Three propagation modes are supported:

- **Replace** — overwrite the component's existing value in the chosen language with the new value.
- **Add** — append the new value(s) to a multi-value component, skipping items already present (not allowed for mono-value components).
- **Delete** — remove the given value(s) from a multi-value component (locator-aware for relation components).

Concrete heritage scenario: a numismatics cataloguer has filtered the *Coins* section down to the 800 issues of one mint, all of which were wrongly catalogued with an empty *Conservation* field. They open the tool on the *Conservation* component, set the correct term once, press **Replace**, and the value lands on all 800 records in one background pass. Later the institution decides to retire a deprecated keyword: with the same tool in **Delete** mode they strip that one relation from every record that still carries it, leaving the rest of each record's keywords untouched. Because the whole run is recorded as a single bulk process, the change is reversible from the Time Machine.

Use it when: the same component value must be set, appended, or removed across a record set defined by a section filter. Do not use it for one-off edits (edit the record directly) or for cross-component transforms (it writes one component_tipo to itself).

## How it works (server + client)

**Server** (`class.tool_propagate_component_data.php`) — a single action, `propagate_component_data`, runs the whole batch:

1. Validates the required options and the `action` value (`replace` | `delete` | `add`).
2. **Permission gate (imperative):** `security::assert_tipo_permission(section_tipo, component_tipo, 2, …)` — propagation is a bulk *write*, so the caller must hold write (level 2) on the `(section_tipo, component_tipo)` pair. A `permission_exception` is re-thrown so `dd_manager` returns the uniform `permissions_denied` response.
3. Resolves the component model via `ontology_node::get_model_by_tipo()`; refuses `add` for mono-value components (`component_common::$components_monovalue`).
4. **Runs the SQO** with `limit = 0` / `offset = 0` (full result set) through `search::get_instance($sqo)->search()`.
5. **Security total check:** if the server's row count is *greater* than the client-supplied `total`, it aborts — the SQO may have drifted between client and server, so a larger-than-expected match set is refused rather than silently over-writing more records than the user saw.
6. Creates a **bulk process** record (`section::get_instance(DEDALO_BULK_PROCESS_SECTION_TIPO)` → `create_record()`, label saved into `DEDALO_BULK_PROCESS_LABEL_TIPO`). The returned `bulk_process_id` is the audit handle for the whole run.
7. Iterates the result rows. For each record it instantiates the component in `'list'` mode, reads `get_data_lang($lang)`, computes `final_data` per action (replace overwrites; delete unsets matching items — locator-keyed for relation components, then re-indexes; add appends absent items), and **only saves when the data actually changed**. Before each save it calls `set_bulk_process_id($bulk_process_id)`, then `set_data_lang()` + `save()`, so every write is stamped with the same bulk id into the Time Machine — which is what makes the run reversible as a unit.
8. While `running_in_cli()`, it emits `print_cli()` progress (message, counter/total, current section_id, peak memory every 1000 rows). It returns `{result, msg, errors, action, section_label, total, counter, memory}`; per-row failures are collected in `errors` (and downgrade the message to "done with warnings") without aborting the batch.

The action is also listed in `BACKGROUND_RUNNABLE`, and the client always invokes it with `background_running: true`, so the actual work runs detached via `core/base/process_runner.php` and is followed through the standard process-status stream.

**Client** (`tools/tool_propagate_component_data/js/`):

- `tool_propagate_component_data.js` is the instance. On `build()` it locates the `main_element` ddo (the component being propagated) and calls `get_component_to_propagate()`, which spins up a **temporary, standalone instance** of that same component (fake `section_id`, `is_temporal`, `id_variant: 'propagate_…'`) seeded with the caller's current value — the editable widget the user composes the propagation value in. `propagate_component_data(action)` reads the live SQO from the section (`self.caller.caller?.caller.rqo.sqo`, cleaned to `offset=0`/`limit=0`), builds the `dd_tools_api` / `tool_request` RQO with `background_running:true`, and fires it through `data_manager.request` with a long timeout (one retry, 3600 s).
- `render_tool_propagate_component_data.js` builds the UI: the temporary component widget, a **Replace / Add / Delete** button row (the Add button is hidden when the model is mono-value, read from the `components_monovalue` client config), and an info line stating the field and the affected record count. It refuses to render if the caller is not a section in `edit` mode. On click it confirms with the user (a second, stronger confirmation when **no filter** is applied — the action would touch *all* records), then streams live progress through `dd_utils_api::get_process_status` (`render_stream` / `read_stream`), locking the UI until the process reports done.

## Actions & options

`API_ACTIONS = ['propagate_component_data']` and `BACKGROUND_RUNNABLE = ['propagate_component_data']`. The action is declared in **list form**; the permission check is **imperative inside the method** (`assert_tipo_permission` at level 2), which is also the defense-in-depth gate for the CLI/background path that `process_runner.php` does not re-gate.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `propagate_component_data` | imperative: `security::assert_tipo_permission(section_tipo, component_tipo, 2)` (write) | yes (`BACKGROUND_RUNNABLE`; client sends `background_running:true`) | see below |

Key options read by `propagate_component_data`:

| Option | Type | Meaning |
| --- | --- | --- |
| `section_tipo` | string (req.) | Target section. Used for the write gate and component instantiation. |
| `component_tipo` | string (req.) | The component to write. Model resolved via `ontology_node::get_model_by_tipo()`. |
| `action` | string (req.) | `replace` \| `delete` \| `add`. Any other value is refused. |
| `lang` | string (req.) | Language the data is read/written in (`get_data_lang` / `set_data_lang`). |
| `propagate_data_value` | mixed | The value to propagate. For replace: the full new value. For add/delete: the item(s) to append/remove (cast to array; delete on relations matches by `section_tipo`+`section_id` locator). Optional for delete-nothing/replace-with-empty. |
| `sqo` | object (req.) | The selection to act on. Server forces `limit=0`, `offset=0` (full set). |
| `total` | int (req.) | Record count the client saw. Server aborts if its match count **exceeds** this (anti-drift security check). |
| `bulk_process_label` | string (opt.) | Human-readable name stored on the bulk process record; defaults to `"Propagate <action> to <component_label>"`. |
| `background_running` | bool | Set `true` by the client to run the action detached via CLI `process_runner`. |

Response: `{ result, msg, errors, action, section_label, total, counter, memory }` — `counter` is the number of rows actually processed; `errors` holds any per-row warnings.

## How it is registered & surfaced

`tools/tool_propagate_component_data/register.json` is a **legacy v6** file (a raw record dump with `components`/`relations` keys); it is auto-converted at registration by `tools_register` (the `components` key triggers the v6 converter). The essentials it carries:

- `dd1326` name = `tool_propagate_component_data`; `dd1327` version (`2.0.4`); `dd1328` minimum Dédalo version (`6.2.5`); `dd1644` developer (`Dédalo team`); `dd799` label / `dd612` description (multi-language).
- `dd1330` affected_models — a long list of **component models** (resolved against the models section dd1342). The tool therefore attaches to the components it can edit, not to whole sections.
- `dd1331` show_in_inspector = `true` and `dd1332` show_in_component = `true` (the relation targets resolve to dd64 section_id `1` = yes), so the button can render both in the inspector panel and inline on the component. `dd1333` require_translatable = `false` (dd64 section_id `2` = no); `dd1354` active = `true`.
- `dd1633` default_config carries `components_monovalue` (flagged `"client": true`) — the list of mono-value component models the client uses to hide the **Add** button and the server uses to refuse the `add` action.
- `dd1372` labels supply the localized UI strings (`do_replace`, `tool_do_add`, `tool_do_delete`, `content_will_be_added_removed`, `will_replaced_all_records`, `bulk_process_label`, …).

Surfacing (in `common::get_tools()`): because `affected_models` lists component models, the **Propagate** button appears on those components while a section is in **edit** mode — the client explicitly refuses to render unless its caller chain resolves to a `section` in `edit` mode.

## Examples

Client-side `tool_request` (built by `tool_propagate_component_data.js::propagate_component_data`, sent through `dd_tools_api`):

```js
const source = create_source(self, 'propagate_component_data') // → tool_propagate_component_data::propagate_component_data

const sqo = clone(section.rqo.sqo)
sqo.offset = 0
sqo.limit  = 0

const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : source,
    options : {
        background_running   : true,                 // run detached via process_runner
        section_tipo         : 'rsc167',             // Coins section
        section_id           : self.main_element.section_id,
        component_tipo       : 'rsc167-conservation',// the component being propagated
        action               : 'replace',            // replace | add | delete
        lang                 : 'lg-eng',
        propagate_data_value : self.component_to_propagate.data.entries, // the composed value
        bulk_process_label   : 'Data propagation | Replace',
        sqo                  : sqo,                   // the current filtered selection
        total                : self.total            // anti-drift count the user saw
    }
}

const api_response = await data_manager.request({ use_worker:true, body:rqo, retries:1, timeout:3600*1000 })
// api_response → { pid, pfile, ... }; progress is then streamed via dd_utils_api::get_process_status
```

A successful (non-background) response object:

```json
{
    "result": true,
    "msg": "OK. replace data of 'Conservation' in section 'Coins' successfully.",
    "errors": [],
    "action": "replace",
    "section_label": "Coins",
    "total": 800,
    "counter": 800,
    "memory": "42.5 MB"
}
```

To undo the whole run, find the matching bulk process in the Time Machine and revert it — every write in the batch was stamped with the same `bulk_process_id`.

## Related

- [tool_export](tool_export.md) — the read-side bulk operation over a section selection; see [Exporting data](../../../core/exporting_data.md). `tool_propagate_component_data` is the write-side bulk counterpart over the same SQO model.
- `tool_update_cache` — another background, chunked bulk operation over a component's records (cache regeneration), following the same `BACKGROUND_RUNNABLE` + process-status-stream pattern.
- [tool_time_machine](tool_time_machine.md) — where a bulk run is reverted as a unit (every write in the batch shares one `bulk_process_id`); source `core/services/service_time_machine/`, `core/tm_record/`.
- Search subsystem (SQO): the selection contract this tool consumes — `core/search/class.search.php`, `core/common/class.search_query_object.php`.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS`, gates, background execution and lifecycle this page builds on.
- Source: `tools/tool_propagate_component_data/class.tool_propagate_component_data.php`, `tools/tool_propagate_component_data/js/{tool_propagate_component_data,render_tool_propagate_component_data}.js`, `tools/tool_propagate_component_data/register.json`.
