# inspector

> The client-side **side panel** of the section edit view — a context-aware dashboard that shows record/component metadata, tools, projects, relations, time-machine history and save activity for the section currently being edited.

> See also: [Sections](../sections/index.md) · [Components](../components/index.md) · [dd_object](../dd_object.md) · [Events](../events.md)

This page is the **subsystem reference** for the inspector. The inspector is a
pure **client (JavaScript + LESS) subsystem** — it has no server-side
counterpart. It lives in `client/dedalo/core/inspector/` and is driven
entirely by the data its caller section already holds (`context`, `data`,
`tools`) plus a handful of small API calls. Everything it displays is
resolved server-side by the
[section](../sections/section.md) and [tool](../components/index.md#tools)
machinery; the inspector only *renders* and *reacts*.

## Role

The inspector is the right-hand panel of the **section edit view** (`mode==='edit'`).
It is created by the section instance and rendered into `#inspector_container`
by `view_default_edit_section.js`. Conceptually it is the section's "developer +
curator console": for the active record it surfaces identity (tipo, model,
matrix table, section_id), creation/modification/publication metadata, the
record's project assignment, its inbound relations, recent change history and a
live activity feed; for the **currently focused component** it swaps that record
view for component-level info (tipo, model, translatable flag, current value,
per-component history).

It is a plain constructor function (`inspector`) whose prototype is patched
with a few methods borrowed from the shared client `common` (`render`,
`refresh`) plus its own `edit`/`init`/`build`/`destroy`/`get_raw_record*`. It
sits next to these neighbouring client subsystems:

| subsystem | relationship |
| --- | --- |
| **section** (`client/dedalo/core/section/js/section.js`) | The inspector's `caller`. The section constructs the inspector in `mode==='edit'` with permissions, owns its lifecycle, and is the source of all `context`/`data`/`tools`/`rqo` the inspector reads. |
| **view_default_edit_section** (`client/dedalo/core/section/js/view_default_edit_section.js`) | Builds `#inspector_container`, renders the inspector wrapper into it, attaches the resize handle, applies the persisted rail/width state, and moves the section paginator into the inspector. |
| **service_time_machine** (Time Machine) | Instanced on demand by the inspector for the section "Latest changes" list and the per-component history. The inspector never reads `dd15` history itself; it delegates to the service. |
| **open_tool** | Every tool button in the inspector calls `open_tool()`; the inspector only decides *which* tools to show (`show_in_inspector`) and renders their buttons. |
| **relation_list** | Instanced on demand to render the "Relations" block. |

!!! note "No server counterpart"
    The inspector itself has no server-side object. The data it shows is
    produced by ordinary section/component reads, the tools registry
    (including the `show_in_inspector` flag — see below), and the Time
    Machine read path. The client creates the inspector whenever a section
    renders in `mode==='edit'` with sufficient permissions — there is no
    separate server-side toggle for it.

## Responsibilities

- **Own the panel lifecycle** — `init` (wire events), `build` (no-op, kept for
  lifecycle parity), `edit`/`render` (build the DOM), `destroy` (unsubscribe).
- **Render the record dashboard** — the paginator, the top button bar
  (search / new / duplicate / delete / open-relationships / graph / diffusion),
  the inspector tool buttons, selection info, element-info block, project block,
  relation list, time-machine list, component history, activity feed and the
  bottom "view record data" / register-download buttons.
- **React to the active component** — on the `activate_component` event swap the
  element-info block from *section* info to *component* info, load that
  component's history, and (in developer mode) re-point an open ontology window.
- **React to saves** — on the `save` event refresh the selected component's
  history, refresh the section time-machine list, and push an activity bubble.
- **Manage panel chrome** — rail collapse/expand, live drag-resize, and persist
  both states (rail + width) in the IndexedDB `status` table as global keys.
- **Fetch the raw record** — build a `read_raw` RQO and request the full
  database record for the "view record data" link and the `dd1340` register
  download.
- **Resolve ontology documentation links** — build docu / local-ontology /
  master-ontology URLs per tipo and open them in a recycled window.
- **Worker/instance hygiene** — keep its event tokens and on-demand service
  instances so `destroy` can tear them down cleanly.

## Key concepts

### The caller is the single source of truth

The inspector holds `self.caller` — the **section instance**. Almost everything
it renders is read straight off the caller, *not* re-fetched:

- `self.caller.context.tools` — filtered by `show_in_inspector` to decide which
  tool buttons appear.
- `self.caller.context.buttons` — to detect `button_new` / `button_delete`.
- `self.caller.context.config.relation_list_tipo` — present ⇒ render the
  Relations block.
- `self.caller.data.entries[0]` — the record metadata (created/modified/
  published dates and users).
- `self.caller.tools` — to detect `tool_diffusion` (the dedicated diffusion
  button) and to open tools via `open_tool`.
- `self.caller.section_tipo` / `section_id` / `model` / `label` / `mode` /
  `view` / `rqo` — identity, paginator and the `read_raw` RQO.

The inspector only issues its own API calls for two things: the raw-record
fetch (`get_raw_record`) and the on-demand `service_time_machine` /
`relation_list` instances.

### Section view vs component view

The **element-info** block (the "Info" card) is dual-mode and shares one body
node, `self.element_info_container`:

- **Section view** — `render_section_info()` fills it with the record's tipo,
  docu links, model, matrix table, section_id, view+mode, created, modified and
  published metadata. Shown when no component is active.
- **Component view** — `render_component_info()` fills it with the focused
  component's tipo, docu links, model, translatable flag, view+mode and a
  collapsible JSON dump of the component's current `data.entries` (with a copy
  button). It subscribes to `update_value_<component.id_base>` so the value
  re-renders live as the user edits, and unsubscribes the previous token each
  time the selection changes.

The switch is event-driven: `activate_component` → component view;
`deactivate_component` (debounced 250 ms, only if no component is active) and
`render_<section.id>` → section view.

### Lazy, collapsible blocks

Each card is a header + body wired through `ui.collapse_toggle_track`, with the
collapsed/expanded state persisted under a stable `collapsed_id`
(`inspector_main_block`, `inspector_element_info_block`, `inspector_project_block`,
`inspector_relation_list`, `inspector_time_machine_list`,
`inspector_component_history_block`, `inspector_activity_info`,
`inspector_component_value`). The heavy blocks (relation list, time-machine
list, component history) default to **closed** and only fetch their data in the
`expose` callback (lazy load), guarding every async load with a
"still open / not destroyed" check.

### Persisted panel state (rail + width)

Two **global** IndexedDB `status` keys persist across sections and reloads:

| key | meaning | default |
| --- | --- | --- |
| `inspector_rail_state` | `true` ⇒ collapsed to the icon rail | not collapsed |
| `inspector_width` | user-chosen panel width (e.g. `'24rem'`) | `'19rem'` (`DEFAULT_WIDTH`) |

Width is applied by writing the CSS custom property `--inspector_width` on
`:root`; the section content and the panel position are `calc()` consumers of
that var, so the layout reflows automatically. Rail mode and resize are inert
below the narrow breakpoint (`max-width: 1024px`), where the panel is inline and
full-width.

## Files & structure

```text
client/dedalo/core/inspector/
├── js/
│   ├── inspector.js          # the instance: lifecycle, events, RQO helpers, ontology URLs
│   └── render_inspector.js   # the DOM: edit() builder + every block renderer/loader
└── css/
    ├── inspector.less        # panel + card styling (included from main.less)
    └── inspector.css.map
```

- **`inspector.js`** is the entry: it exports the `inspector` constructor and
  patches its prototype. It owns `init` (event wiring), `build`, `destroy`,
  `get_raw_record` / `get_raw_record_rqo`, the module-level
  `update_section_info()` helper, and the exported `get_ontology_url()`.
  `inspector.prototype.edit` is borrowed from `render_inspector.prototype.edit`.
- **`render_inspector.js`** is the view layer: `edit()` assembles the wrapper and
  `get_content_data()` builds every card. It also exports the chrome helpers
  (`toggle_inspector_rail`, `apply_inspector_state`, `init_inspector_resize`) and
  the per-block render/load functions consumed by `inspector.js`'s event handlers.

### DOM shape

```text
#inspector_container            (built by view_default_edit_section.js)
├── .inspector_resize_handle    (left-edge drag handle)
└── #inspector .inspector       (the wrapper returned by edit())
    ├── .label .icon_arrow      (collapsible header + rail toggle)
    └── .content_data.inspector_content_data
        ├── .paginator_container        (section paginator moved in here + .section_id)
        ├── .buttons_container.top      (search / new / duplicate / delete / open-rel / graph / diffusion)
        ├── .tools_container.top        (inspector tool buttons, when >1)
        ├── .selection_info             (current element label + List button)
        ├── .element_info_wrap          (the dual-mode "Info" card → .element_info)
        ├── .project_wrap                (component_filter, when relation_list config present)
        ├── .relation_list_container     (when context.config.relation_list_tipo)
        ├── .time_machine_list           ("Latest changes", section-level)
        ├── .component_history            (per active component)
        ├── .activity_info                (save/error bubbles)
        └── .buttons_container.bottom    (view record data + dd1340 register download)
```

## Instantiation & lifecycle

The inspector is **not** built through the `get_instance()` factory. The section
instantiates it directly with `new inspector()` when it renders in edit mode and
the user has permissions (`client/dedalo/core/section/js/section.js`):

```js
// in section build, mode 'edit' only
if (self.inspector==null && self.mode==='edit' && self.permissions) {
    const current_inspector = new inspector()
    current_inspector.init({
        section_tipo : self.section_tipo,
        section_id   : self.section_id,
        caller       : self          // the section instance
    })
    self.inspector = current_inspector
}
```

`init(options)` sets `self.caller` (the section), `self.id` =
`'inspector_' + section_tipo`, `self.mode = 'edit'`, the placeholder node
pointers (`paginator_container`, `element_info_container`,
`component_history_container`, …) and subscribes the event handlers (below). It
has a double-init guard (`is_init`) and tracks `self.status`
(`initializing → initialized → building → built → destroyed`).

Then the view builds and renders it (`client/dedalo/core/section/js/view_default_edit_section.js`):

```js
const inspector_container = ui.create_dom_element({ id:'inspector_container', /* … */ })
await self.inspector.build()                       // no-op, lifecycle parity
const inspector_wrapper = await self.inspector.render()   // → edit()
inspector_container.appendChild(inspector_wrapper)
apply_inspector_state(self.inspector, inspector_container) // rail/width before paint (no flicker)
// + resize handle and the section paginator moved into inspector.paginator_container
```

!!! note "Setting `inspector: false` suppresses the panel"
    The section accepts an `inspector` option. A section built with
    `inspector: false` (e.g. notes/modal cases) skips the panel entirely; the
    view then adds the `no_inspector` class to the section wrapper. When the
    option is `null`/undefined the section creates the inspector itself under the
    edit-mode + permissions guard above.

### Events the inspector subscribes to (in `init`)

| event | handler effect |
| --- | --- |
| `render_<caller.id>` | `update_section_info()` — reset active component, re-render section info, reload the time-machine list, clear component history, sync the paginator section_id. |
| `activate_component` | Store `self.actived_component`, update selection label, `render_component_info()`, load that component's history; in developer mode re-point an open ontology window. |
| `save` | If the saved instance is the active component, reload its history; always reload the section time-machine list and push an `activity_info` bubble. |
| `deactivate_component` | After a 250 ms debounce, if no component is active, `update_section_info()` (back to the section view). |
| `render_component_filter_<section_tipo>` | Capture the rendered `component_filter` node (published by `render_edit_section_record`) and refresh the project block body. |

### Teardown

`destroy(delete_self=true, delete_dependencies=false, remove_dom=false)`
overrides `common.destroy`: it unsubscribes the live
`update_value_*` token stored on `element_info_container`, then delegates to
`common.prototype.destroy`. (Event tokens collected in `self.events_tokens` and
the on-demand `service_time_machine` instance are cleaned up through the common
destroy / service destroy paths.)

## Key methods

Grouped by concern. The inspector spans two files; *file* marks where each lives.
Functions exported from `render_inspector.js` are consumed by `inspector.js`'s
event handlers and by the section view.

### Lifecycle & instance (inspector.js)

| method | static? | purpose |
| --- | --- | --- |
| `inspector.prototype.init(options)` | | Wire identity, node pointers and all event subscriptions; double-init guarded. |
| `inspector.prototype.build()` | | No-op kept for lifecycle parity (`status` → built). |
| `inspector.prototype.edit(options)` | | *(borrowed from `render_inspector`)* Build the wrapper: label + rail toggle + `content_data`. `render_level:'content'` returns just the content node. |
| `inspector.prototype.render` / `refresh` | | Borrowed from the client `common` prototype. |
| `inspector.prototype.destroy(delete_self, delete_dependencies, remove_dom)` | | Unsubscribe the live value-update token, then call `common.destroy`. |

### Raw record & RQO (inspector.js)

| method | static? | purpose |
| --- | --- | --- |
| `inspector.prototype.get_raw_record()` | | Build the RQO, call `data_manager.request`, return the first result (or `false`). |
| `inspector.prototype.get_raw_record_rqo()` | | Build a `read_raw` RQO filtered by the caller's `section_tipo`/`section_id` (limit 1, `filter_by_locators`). Used by both the "view record data" link and the dd1340 register download. |
| `get_ontology_url(tipo, target)` | export | Resolve a documentation/ontology URL for a tipo. `target` ∈ `docu_link` \| `local_ontology` \| `local_ontology_search` \| `master_ontology`. |

### Panel chrome (render_inspector.js)

| function | export? | purpose |
| --- | --- | --- |
| `toggle_inspector_rail(self)` | export | Collapse to / expand from the icon rail, reflow via `--inspector_width`, persist `inspector_rail_state`. Inert on narrow viewports. |
| `apply_inspector_state(inspector, container)` | export | Apply the persisted rail/width to the fresh container *before* attach (no flicker). |
| `init_inspector_resize(handle, inspector)` | export | Wire the left-edge drag handle: rAF-coalesced live resize, clamped (14rem … min(60vw, 40rem)), persist `inspector_width` on release. Disabled while railed/narrow. |
| `decorate_block_header(header, icon_class, label_html)` | | Add the leading mask icon + text-label wrapper to a card header (icons: info\|gear\|link\|history\|note\|activity\|panel). |

### DOM builders (render_inspector.js)

| function | export? | purpose |
| --- | --- | --- |
| `edit(options)` | export (prototype) | Top-level builder: label, rail toggle, collapse tracking, `content_data`. |
| `get_content_data(self)` | | Build the whole content: paginator, top button bar, inspector tool buttons, and append every card block. |
| `render_selection_info(self)` | | The orange "current element" label card (+ List nav button via `update_label`). |
| `render_element_info(self)` | | The collapsible "Info" card shell; sets `self.element_info_container`. |
| `render_section_info(self)` | export | Fill Info with **section** metadata (tipo, model, matrix_table, created/modified/published, docu links). |
| `render_component_info(self, component)` | export | Fill Info with the **active component** (tipo, model, translatable, live JSON value + copy); subscribes `update_value_<id_base>`. |
| `render_project_block(self)` | | The "Project" card wrapping the section's `component_filter` node. |
| `update_project_container_body(self)` | export | Swap the project card body to the current filter node. |
| `render_relation_list(self)` | | The "Relations" card (lazy); built only when `context.config.relation_list_tipo` exists. |
| `render_time_machine_list(self)` | export | The section-level "Latest changes" card shell (lazy, default closed). |
| `render_component_history(self)` | | The per-component "Component history" card shell (lazy, default closed). |
| `render_activity_info(self)` | | The "Activity" card shell (save/error bubbles). |
| `render_docu_links(self, tipo)` | | Build the docu-link buttons; the developer-only local/tree/master ontology buttons appear when `SHOW_DEVELOPER===true`. |

### On-demand data loaders (render_inspector.js)

| function | export? | purpose |
| --- | --- | --- |
| `load_time_machine_list(self)` | export | Instance a `service_time_machine` (view `mini`) for the whole section and render it into the Latest-changes body; skips when collapsed/destroyed, destroys the previous service. |
| `load_component_history(self, component)` | export | Instance a `service_time_machine` (view `history`) for the active component + its notes (`rsc329`/`rsc832`) and render it; clears when `component` is null. |
| `load_activity_info(self, options)` | export | Render one notification bubble (`render_node_info`) and prepend it to the activity body. |
| `open_ontology_window(self, url, docu_type, focus=false)` | export | Open/recycle the shared `window.docu_window` at the given ontology URL. |

!!! warning "Verified surface only"
    The tables above list the *real* functions present in `client/dedalo/core/inspector/js/`.
    Module-internal helpers (`set_inspector_width`, `is_narrow_viewport`,
    `update_section_info`) are not exported and are listed only where they shape
    behaviour. No method names here are invented.

## How it fits with the rest of Dédalo

The inspector is a thin client renderer over data other subsystems resolve. The
load-bearing contracts:

### `show_in_inspector` — how tools opt into the panel

The inspector's tool buttons are not hardcoded. `get_content_data()` filters the
caller's tool contexts:

```js
const inspector_tools = self.caller.context.tools.filter( el => el.show_in_inspector )
```

That `show_in_inspector` flag is a **server-resolved** property of every tool's
context: a plain boolean field on the resolved tool context
(`src/core/tools/types.ts`), read off the tool's registration
(`SHOW_IN_INSPECTOR` in `src/core/tools/ontology_map.ts`, resolved by
`src/core/tools/registry.ts` / `register.ts`). A tool authored with
`show_in_inspector: true` in its `register.json` therefore appears as an
inspector button with no client change.
The companion flag `show_in_component` governs whether the same tool renders in a
component's own toolbar instead. See the tool context example in
[Components → Datum/context](../components/index.md#context) and the
[tools subsystem](../components/index.md#tools).

!!! note "Two diffusion paths"
    The dedicated **Diffusion** top button is rendered only when the caller has a
    `tool_diffusion` in `self.caller.tools`; other tools reach the panel through
    the generic `show_in_inspector` filter. Both ultimately call
    `open_tool({ tool_context, caller })` from `tool_common`.

### Time Machine

The "Latest changes" and "Component history" cards are rendered by instancing
`service_time_machine` (model `service_time_machine`) on demand and calling its
`build()` / `render()`. The inspector never queries `dd15` history directly. The
component-history loader also pairs the selected component (mode `tm`,
`fixed_mode`) with the annotation note component (`rsc329` in section `rsc832`),
so each historical change can carry a note.

### Relations & projects

- The **Relations** card builds a `relation_list` instance keyed by
  `context.config.relation_list_tipo` (set server-side in
  `common` when the section declares a relation-list trigger). It renders the
  inbound "who references me" view — see [component_relation_index](../components/component_relation_index.md)
  and [relation_list](../components/index.md#related-components).
- The **Project** card surfaces the section's [component_filter](../components/component_filter.md)
  node, captured from the `render_component_filter_<section_tipo>` event, letting
  the curator change the record's project assignment from the panel.

### Section coupling

The section orchestrates the client inspector's whole lifecycle: it
constructs the inspector whenever it renders in `mode==='edit'` with
sufficient permissions, feeds it `context`/`data`/`tools`, and the section
view moves the paginator into `inspector.paginator_container`. There is no
separate server-side flag gating it — the mode + permission check is the
whole gate. See [section](../sections/section.md) for the section instance
the inspector treats as its source of truth, and [dd_object](../dd_object.md)
for the `context`/`tools`/`show_in_inspector` shape it consumes.

## Examples

### A tool opting into the inspector (server registration)

A tool whose context arrives with `show_in_inspector: true` (resolved by
`tool_common`) becomes an inspector button automatically. The context the client
filters on looks like:

```json
{
    "name"              : "tool_propagate_component_data",
    "model"             : "tool_propagate_component_data",
    "label"             : "Propagates component data",
    "section_tipo"      : "dd1324",
    "mode"              : "edit",
    "icon"              : "/dedalo/tools/tool_propagate_component_data/img/icon.svg",
    "show_in_inspector" : true,
    "show_in_component" : true,
    "type"              : "tool"
}
```

The inspector then renders its button and, on `mousedown`, opens it:

```js
// render_inspector.js → get_content_data()
const inspector_tools = self.caller.context.tools.filter( el => el.show_in_inspector )
// for each tool_context: build a .light.blank button and …
open_tool({
    tool_context : tool_context,
    caller       : self.caller   // the section instance
})
```

### Reading the raw record behind the panel

The bottom "view record data" button and the `read_raw` RQO the inspector builds:

```js
// inspector.prototype.get_raw_record_rqo()
const rqo = {
    action  : 'read_raw',
    options : {
        type         : 'section',
        section_tipo : self.caller.section_tipo,
        tipo         : self.caller.section_tipo,
        model        : self.caller.model
    },
    sqo : {
        section_tipo : [ self.caller.section_tipo ],
        limit : 1,
        filter_by_locators : [{
            section_tipo : self.caller.section_tipo,
            section_id   : self.caller.section_id
        }]
    },
    pretty_print : true
}
```

### Toggling the rail and persisting width

```js
// collapse/expand to the icon rail; reflows the layout via --inspector_width
toggle_inspector_rail(self)   // persists { id:'inspector_rail_state', value:true } in the 'status' table
```

## Related

- [section](../sections/section.md) — the caller; owns the inspector's lifecycle
  and supplies its `context` / `data` / `tools` / paginator.
- [Sections concept](../sections/index.md) — the record model the panel reflects.
- [Components](../components/index.md) — components, the `context.tools` toolbar,
  and the `show_in_inspector` / `show_in_component` flags.
- [dd_object (ddo)](../dd_object.md) — the context object carrying
  `show_in_inspector`, `tools`, `config.relation_list_tipo`.
- [component_filter](../components/component_filter.md) — the node shown in the
  Project card.
- [component_relation_index](../components/component_relation_index.md) — the
  inbound relations surfaced by the Relations card.
- [Events](../events.md) — the `activate_component` / `deactivate_component` /
  `save` / `render_<id>` events the inspector subscribes to.
