# tool_diffusion

Publishing UI for a section: inspects the section's diffusion configuration and drives the publish/unpublish of its records to the configured diffusion targets (SQL / RDF / XML / Socrata) through the Bun diffusion engine. UI-only, available only on sections that have a diffusion definition.

## What it does / why & when to use it

`tool_diffusion` is the operator-facing front end of the **diffusion** subsystem — the machinery that copies *work* data out of Dédalo into one or more *published* targets (a MariaDB database read by a public website, an RDF graph, XML files, a Socrata portal…). The tool does not itself transform or write data; it reads the section's diffusion definition from the ontology, shows the engine's health and the publishing controls, and then asks the **Bun** diffusion engine to run the publish for the records the user has selected.

It is deliberately a thin, read-and-launch panel: every actual data operation is owned by the diffusion engine and `dd_diffusion_api`, never by the tool's own PHP class (which has **no remotely callable methods at all**).

Concrete heritage scenario: an oral-history archive keeps its master interviews, informants and indexation in Dédalo, and serves them on a public site backed by a published MariaDB database. A cataloguer finishes correcting a batch of *Interviews*, filters that list, opens the diffusion tool on it, sets **depth levels** to 2 (so each interview is published together with the informant and place records it links to through portals), and presses *Publish the N selected records*. The tool streams progress as the Bun engine resolves and writes each record group, then shows a per-table result (rows affected, time, success / partial / fail). If a record had previously been deleted while a target was offline, the panel also surfaces the count of **pending deletions** with a *Retry* button so the operator can re-attempt that delete propagation.

Use it when: someone needs to publish (or re-publish) a section's records to the live diffusion target(s), check whether the diffusion engine is reachable, tune how many relation *levels* get published with each record, or clear pending delete-propagations. It does **not** appear on sections that have no diffusion definition, and never on individual components.

## How it works (server + client)

**Server (PHP).** `tools/tool_diffusion/class.tool_diffusion.php` is intentionally minimal. It declares an **empty** `API_ACTIONS` (SEC-024 §9.2: a UI-only tool with no remotely callable methods) and implements one framework lifecycle hook:

```php
class tool_diffusion extends tool_common {

    public const API_ACTIONS = []; // UI-only: nothing is callable through dd_tools_api

    public static function is_available(object $context) : bool {
        if ($context->is_component === true) {
            return false; // components are never in the diffusion map
        }
        return diffusion_utils::have_section_diffusion($context->tipo) !== false;
    }
}
```

`is_available()` is called by `common::get_tools()` for every candidate element (it replaced a previously hardcoded core special-case). It hides the tool on components, and on sections it returns the result of `diffusion_utils::have_section_diffusion($section_tipo)` — an O(1) lookup into a persistent, entity-level *section→diffusion* map precomputed from the v7 flat virtual diffusion tree (rebuilding that tree per request cost ~70–175 ms, so the answer is cached and invalidated from the ontology / tool-registry write chokepoints). The result is also cached per user/tipo/section by `get_tools()`.

Because the tool has no API actions, none of the publish work goes through `dd_tools_api` / `tool_request`. The class exists only to (a) surface the button on the right sections and (b) carry the registry record (version, label, localized UI labels).

**Client (JS).** `tools/tool_diffusion/js/` holds the real behavior:

- `tool_diffusion.js` is the instance. It extends the standard `tool_common` lifecycle (`init` / `build` / `render` / `edit`). On `build()` it fetches three things in parallel — `get_diffusion_info()`, `get_diffusion_status()` and `get_active_processes()` — and resolves the default *resolve_levels* and *skip_publication_state_check* from the returned config.
- `render_tool_diffusion.js` builds the DOM: the Bun-engine status banner, the depth-levels input (persisted in `localStorage` as `diffusion_levels`, with an info modal explaining the exponential cost of more levels), the *skip publication-state check* toggle, the publish button, a streamed per-table result panel, and the pending-deletions row with its *Retry* button. The tool opens **as a modal** (`on_close_actions('modal')` destroys the instance; it deliberately never refreshes the caller, which is a `component_json`).

Critically, every server call the client makes targets the **diffusion API**, not the tools API: `data_manager.request(...)` (or `request_stream(...)` for the publish) to `DEDALO_DIFFUSION_API_URL` with `dd_api: 'dd_diffusion_api'`. That URL is the Bun middleware, which owns MariaDB and either resolves the request itself (engine status) or passes it through to PHP `dd_diffusion_api`.

## Actions & options

`tool_diffusion` itself exposes **no** API actions:

| `API_ACTIONS` | Form | Notes |
| --- | --- | --- |
| `[]` (empty) | — | UI-only tool (SEC-024 §9.2). No method is dispatchable through `dd_tools_api`; a `tool_request` to this class would be refused at the allowlist gate. There is **no** `BACKGROUND_RUNNABLE`. |

Lifecycle hook (called by the framework, never listed in `API_ACTIONS`):

| Hook | Signature | Reads | Effect |
| --- | --- | --- | --- |
| `is_available` | `(object $context): bool` | `context->is_component`, `context->tipo` | Returns `false` for components; on sections returns `diffusion_utils::have_section_diffusion(tipo)`. Decides whether the tool button renders on the element. |

All operational work is performed by **`dd_diffusion_api`** (`core/api/v1/common/class.dd_diffusion_api.php`, `API_ACTIONS = ['diffuse','get_diffusion_info','validate','get_ontology_map','retry_pending_deletions','rebuild_media_index']`). The client methods of `tool_diffusion.js` and the diffusion-API actions they call:

| Client method | `dd_diffusion_api` action | Transport | Key request fields | Purpose |
| --- | --- | --- | --- | --- |
| `get_diffusion_info()` | `get_diffusion_info` | `request` | `options.section_tipo` | Per-section diffusion config used to build the UI (default `resolve_levels`, `skip_publication_state_check`, available diffusion elements/types). |
| `get_diffusion_status({})` | `get_diffusion_status` | `request` | — | Bun engine health (running / configured / PHP bridge reachable). Resolved entirely by Bun, not PHP. |
| `get_active_processes()` | `list_processes` | `request` | — | Currently running diffusion processes (from the Bun middleware). |
| `export(options)` | `diffuse` | `request_stream` (NDJSON) | `sqo` (selection); `options.levels`, `skip_publication_state_check`, `additions_options`, `total`, `process_id`, `diffusion_element_tipo`, `diffusion_tipo`, `type` | Runs the publish for the selected records and streams progress/results. In `edit` mode the SQO targets the single record; in list mode it reuses the caller's `rqo.sqo`. |
| `retry_pending_deletions(options)` | `retry_pending_deletions` | `request` | `options.count_only` (badge count vs. retry), `options.limit` | Re-attempts delete propagation for records whose deletion never reached a target (dd1758 `unpublish_pending` rows). Pass-through Bun→PHP. |

> The `diffuse` request is built around a **SQO** (the search query object describing which records to publish). In `edit` mode it is a single-record SQO (`limit: 1`, `filter_by_locators`); in list mode it reuses `self.caller.rqo.sqo`, i.e. the user's current section selection/filter.

## How it is registered & surfaced

`tools/tool_diffusion/register.json` is a **legacy v6** file (a raw record dump with `components` / `relations` keys), auto-converted at registration by `tools_register` (the `components` key triggers the v6 converter). The essentials it carries:

- `dd1326` name = `tool_diffusion`; `dd1327` version (`2.0.5`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer (`Dédalo team`); `dd612` description.
- `dd799` label = *Diffusion* (localized across all project languages).
- `dd1372` labels supply the localized UI strings the client reads via `get_tool_label(...)`: `depth_levels`, `levels_note`, `publish_selected_records`, `skip_publication_state_check`, `combine_xml_files`, `diffusion_result`, `table_name`, `records_affected`, `total_time`, `success`, `partial_success`, `fail`, `rows_total`, `pending_deletions`, `retry`.

**Where it appears.** Unlike most tools, surfacing is **not** driven by `affected_models` here — this v6 register dump does not carry `affected_models` / `show_in_inspector` / `show_in_component` / `properties`. The button is gated entirely by the `is_available()` hook: it renders on a **section** if and only if that section has a diffusion definition in the ontology (and never on components). The tool opens **as a modal**. Profile authorization applies as for any tool (superusers see it; otherwise it must be granted on the profile's Tools).

## Examples

The tool is UI-only, so there is no `tool_request` to `tool_diffusion`. The load-bearing calls are the diffusion-API requests the client issues. Building the per-section config request (as in `get_diffusion_info()`):

```js
// Resolve the section's diffusion configuration to build the panel
const rqo = {
    dd_api  : 'dd_diffusion_api',
    action  : 'get_diffusion_info',
    source  : create_source(self, 'get_diffusion_info'),
    options : { section_tipo : self.caller.section_tipo }
}
const response = await data_manager.request({
    url  : DEDALO_DIFFUSION_API_URL,   // the Bun engine
    body : rqo
})
// response.result → { resolve_levels, skip_publication_state_check, … }
```

Launching a publish for the current selection and streaming progress (as in `export()`):

```js
const rqo = {
    dd_api  : 'dd_diffusion_api',
    action  : 'diffuse',
    source  : create_source(self, 'diffuse'),
    sqo     : self.caller.rqo.sqo,        // records to publish (the list selection)
    options : {
        levels                       : self.resolve_levels,            // depth: 1 = this section only
        skip_publication_state_check : self.skip_publication_state_check,
        diffusion_element_tipo       : item.element_tipo,
        diffusion_tipo               : item.diffusion_tipo,
        type                         : item.type                       // 'sql' | 'rdf' | 'xml' | 'socrata'
    }
}
const stream = await data_manager.request_stream({ url: DEDALO_DIFFUSION_API_URL, body: rqo })
// render_stream(stream) → live per-table results: rows affected, time, success/partial/fail
```

Reading just the pending-deletion badge count:

```js
await self.retry_pending_deletions({ count_only: true })  // → { result, count }
```

## Related

- [Creating new tools](../creating_tools.md) — the end-to-end tool tutorial.
- [Server contract](../server_contract.md) — the PHP class contract; note the lifecycle-hook rule (`is_available` is never listed in `API_ACTIONS`).
- [Tools catalog](index.md) — index of all per-tool reference pages.
- [`tool_export`](tool_export.md) — the *other* way data leaves Dédalo: a user-shaped flat-table export (CSV/spreadsheet/raw round-trip) rather than publishing to a live target. See also the core guide [Exporting data](../../../core/exporting_data.md).
- Diffusion subsystem core docs: [Diffusion](../../../core/system/diffusion.md), [`dd_diffusion_api` and the Bun engine](../../../diffusion/dd_diffusion_api_and_bun.md), [Diffusion data flow](../../../diffusion/diffusion_data_flow.md), [Diffusion config properties](../../../diffusion/diffusion_config_properties.md), [Multiple databases](../../../diffusion/diffusion_multiple_databases.md).
</content>
</invoke>
