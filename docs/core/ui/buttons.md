# buttons

> The ontology-driven **UI action** family — `button_*` nodes that a section (or
> area) declares as children and that the server resolves into a `buttons`
> context array the client turns into clickable action buttons (New, Delete,
> import/tool triggers, …).

> See also: [common contract](../system/common.md) · [Sections](../sections/index.md) ·
> [section class reference](../sections/section.md) · [dd_object (ddo)](../dd_object.md) ·
> [Tools](../../development/tools/creating_tools.md) · [Ontology](../ontology/index.md)

## Role

Buttons are **not data**. A button is an ontology node whose `model` starts with
`button_` (e.g. `button_new`, `button_delete`, `button_import`,
`button_trigger`) declared as a child of a *section* (or, on the PHP oracle,
an *area*). Unlike a component, a button stores nothing in the matrix and
renders no value: it is a declaration that *"this section offers this
action"*. At build time the section collects its `button_*` children, filters
them by permission, and emits one `dd_object` of `type:'button'` per surviving
button into the `buttons` array of the context envelope. The client (`section`
list/edit views) reads that array and builds the actual DOM `<button>`
elements, wiring each `model` to a concrete handler.

So the subsystem spans three layers:

| layer | what it is |
| --- | --- |
| **Ontology** | `button_*` nodes declared as children of a section/area, carrying a `label` (term) and `properties` (e.g. `disable`, `css.style`, `tool_config`). |
| **Server (TS)** | `buildSectionButtons()` (`src/core/section/buttons.ts`) resolves a section's `button_*` children into `ButtonContext` objects; called from `stampSectionContext()` (`src/core/section/context.ts`), which stamps `entry.buttons` only when the element's `model === 'section'` — there is no `button_*` class hierarchy at all, TS-side. |
| **Client (JS)** | the section views' `get_buttons()` build the `buttons_container` DOM and attach the per-`model` click behaviour (unchanged, copied as-is). |

!!! note "PHP reference"
    The PHP oracle resolves buttons through `common::get_buttons_context()`,
    with a thin `button_common` class (`core/button_common/class.button_common.php`,
    extended by empty `button_new` / `button_delete` subclasses) kept around
    only for a legacy per-button controller/JSON path — **not** for the
    per-section button list, which PHP itself already produces from
    `common`/`section`, not by instantiating the button classes. The TS port
    carries over the resolver, not the legacy class hierarchy: see
    [Legacy controller path](#legacy-controller-path-php-oracle-only) below.

!!! warning "Gap: area buttons are not yet resolved server-side"
    PHP's `get_buttons_context()` produces buttons for **both** `section` and
    `area*` models (`class.common.php:4189-4193`). `stampSectionContext()` is
    only invoked for `model === 'section'` (`structure_context.ts`) — an
    `area_*` context currently gets no `buttons` array on the TS server. Track
    against [STATUS.md](../../../rewrite/STATUS.md) before relying on
    area-level buttons.

## Responsibilities

- **Declare actions** on a section/area through ontology `button_*` child nodes.
- **Resolve** those nodes into the `buttons` context array
  (`buildSectionButtons()`, `src/core/section/buttons.ts`), filtered by
  permission and by the node's `disable` property.
- **Carry per-button configuration** in the node `properties`: a `disable` flag,
  an optional `css.style` class hint, and (for tool-dispatching buttons) a
  `tool_config` map keyed by tool name — see the gap below for what the TS
  port currently surfaces of this.
- **Bridge to tools** *(PHP oracle only — not yet ported)*: `button_import` /
  `button_trigger` resolve the user's tools and attach a `tools` array of tool
  contexts to the button ddo so the client can open the matching tool.
- **Legacy controller path** *(PHP oracle only)*: a `button_common` PHP class
  provided a thin `target`/`id`/`context_tipo` carrier and a `*_json.php` /
  `*.phtml` controller used by older flows — see the warnings below. The TS
  server has no equivalent class or controller; it doesn't need one.

## Key concepts

### What is a button node

A button is an ordinary ontology node. The load-bearing fields are the same as
any node:

- `model` — a `button_*` model (this is what makes it a button).
- the `lg-*` term keys — the button's **label**, resolved to the application
  language.
- `properties` — the per-button descriptor (see below).
- `parent` — the section (or area) it is attached to.

### Button `properties`

| property | PHP oracle effect | TS (`buildSectionButtons`) |
| --- | --- | --- |
| `disable: true` | the button is skipped entirely (not emitted into the context). | same — read via `getNode(tipo)`, skipped before emit. |
| `css.style` | a CSS class name the client adds to the rendered `<button>` (e.g. `"css": { "style": "import_files" }`). | **not surfaced** — `ButtonContext` carries no `properties` field at all, so a `css.style` hint never reaches the client via this path. |
| `tool_config` | (only for `button_import` / `button_trigger`) an object keyed by tool name; each value is a tool config (notably a `ddo_map`) used to build the tool context attached to the button. | **not read** — see the tool-bridge gap below. |

### The button ddo (wire shape)

Each surviving button becomes a `dd_object` with `type:'button'`. The PHP
`get_buttons_context()` fields are:

```json
{
    "type"       : "button",
    "tipo"       : "<button node tipo>",
    "model"      : "button_new",
    "label"      : "New",
    "properties" : { },
    "tools"      : null
}
```

`tools` is `null` for plain buttons (`button_new`, `button_delete`) and an array
of tool contexts for `button_import` / `button_trigger`. The whole array lands
under `context.buttons` of the section/area envelope.

!!! warning "TS wire shape is narrower: no `properties`, no `tools`"
    `buildSectionButtons()`'s `ButtonContext` (`src/core/section/buttons.ts`)
    only emits `{typo:'ddo', type:'button', tipo, model, label}` — there is no
    `properties` or `tools` key on the object at all, and `button_import` is
    excluded outright (`BUTTON_EXCLUDE_MODELS`) rather than resolved with a
    tool context. `button_trigger` is not special-cased either, so it would be
    emitted as a bare button with no `tools` array for the client's
    `current_button.tools[0]` lookup to read. **A section header that relies
    on `button_import`/`button_trigger` to open a tool will not work against
    the TS server yet** — check [STATUS.md](../../../rewrite/STATUS.md) before
    depending on it.

### Concrete button models

| model | meaning | client behaviour |
| --- | --- | --- |
| `button_new` | create a new record in the section | publishes `new_section_<id>` (the section creates a record). |
| `button_delete` | delete record(s) of the section | opens the delete dialog (`render_delete_record_dialog`) over the current SQO; in the list view it is gated to global admins for multiple delete, and a per-row trash-can `button_delete` is also rendered from the same context entry. |
| `button_import` / `button_trigger` | dispatch a **tool** from the section header (v5-compat) | opens the tool via `open_tool(...)` using `current_button.tools[0]`. The two are treated identically in code; the comments note they are intended to merge into a future `button_tool` model. **`button_import` never reaches the client on the TS server** (excluded server-side); `button_trigger` reaches it without a `tools` array — see the gap above. |
| *(other `button_*`)* | any other button model | falls through to the default: publishes `click_<model>` on the event manager so a subscriber can handle it. |

!!! note "button, button_print, button_stats"
    The directories `core/button`, `core/button_print` and `core/button_stats`
    exist but currently contain **no PHP class** (only stray `.DS_Store` /
    leftover CSS such as `button_common.less`'s `button stats` block). `button`
    is the bare type name; `button_print` / `button_stats` are legacy/placeholder
    families with no active v7 server model. Do not assume a working class exists
    for them — verify against the ontology before relying on them.

## Files & structure

```text
src/core/section/
├── buttons.ts                     # buildSectionButtons() + sectionRelationListTipo()
└── context.ts                     # stampSectionContext() — calls buttons.ts, model==='section' only

src/core/resolve/structure_context.ts   # buildStructureContext() — invokes stampSectionContext()
```

On the PHP oracle, this same resolution used to live spread across a small
class family under `core/button*/` (kept only for a legacy per-button
controller path — see [Legacy controller path](#legacy-controller-path-php-oracle-only)):

```text
core/
├── button/                       (no PHP class; placeholder)
├── button_common/
│   ├── class.button_common.php   the base: extends common; target/id/context_tipo + define_* helpers
│   └── css/button_common.less    shared button styling (incl. legacy "button stats" rules)
├── button_delete/
│   ├── class.button_delete.php   empty subclass of button_common
│   └── button_delete.php         legacy controller: mode→.phtml include (SEC-054 hardened)
├── button_new/
│   ├── class.button_new.php      empty subclass of button_common
│   └── button_new_json.php       JSON controller: emits {context:[…], data:[]}
├── button_print/                 (no PHP class; placeholder)
└── button_stats/                 (no PHP class; placeholder)
```

The client half is unchanged (copied as-is):

- The client section views → `get_buttons()` in
  `core/section/js/view_default_list_section.js`,
  `view_base_list_section.js`, `view_graph_list_section.js`,
  `view_default_edit_section.js`, and the per-row delete in
  `core/section/js/render_list_section.js`.

## How a section resolves its buttons (server)

`buildSectionButtons()` (`src/core/section/buttons.ts`) is the TS resolver,
called from `stampSectionContext()`. Outline (PHP reference:
`common::get_buttons_context()`, `class.common.php:4179-4326`):

1. **Model gate** — `stampSectionContext()` is only invoked for
   `model === 'section'` in `buildStructureContext()`; `area*` callers get no
   `buttons` array yet (the gap noted above — PHP resolves both).
2. **Collect tipos** — a direct SQL query for the section's `button_%` model
   children, `ORDER BY order_number NULLS LAST, tipo`. There is no separate
   virtual-section merge step here (§9 in `engineering/SECTION_SPEC.md` tracks this
   against the PHP `section::get_section_buttons_tipo()` virtual-section
   behaviour).
3. **Per button**, in order:
   - **Model exclude** — skip if the model is in `BUTTON_EXCLUDE_MODELS`
     (currently just `button_import`).
   - **Permission** — with a `principal`, the real per-button ACL
     `getPermissions(principal, sectionTipo, buttonTipo) < 2` → skip (matches
     PHP's `common::get_permissions() < 2` gate); without one, the caller-level
     permission was already checked `>= 2` before the loop (an admin-path proxy).
   - **Properties** — `getNode(tipo)`; skip if `properties.disable === true`.
   - **Label** — `labelByTipo(tipo)` (application language).
   - **Tools** — **not implemented**: `button_import`/`button_trigger` never
     get a resolved `tools` array (see the wire-shape gap above).
   - **Build ddo** — a `ButtonContext` with `typo/type/tipo/model/label` only
     (no `properties`, no `tools`).
4. The array is returned fresh on every call — there is no server-side cache
   to invalidate (unlike PHP's `$cache_buttons_tools` / `$buttons_context`
   statics, which needed `common::clear()`).

`buildStructureContext()` calls `stampSectionContext()` and writes the result
under `buttons` in the context; the **simple** context path
(`section_elements_context.ts`'s `toSimple()`) deliberately **strips** `tools`
and `buttons` from a full context, mirroring PHP's
`get_structure_context_simple()` behaviour.

## How the client renders buttons

The section list views read `self.context.buttons` and build a
`buttons_container`. Beyond the per-model buttons it also synthesises the
non-ontology **Search** / **Show all** controls and a collapse toggle. The
per-model wiring (from `view_default_list_section.js`):

```js
switch (current_button.model) {
    case 'button_new':
        event_manager.publish('new_section_' + self.id)
        break
    case 'button_delete':
        self.render_delete_record_dialog({ section:self, section_id:null,
            section_tipo:self.section_tipo, sqo:delete_sqo })
        break
    case 'button_import':
    case 'button_trigger':
        open_tool({ tool_context:current_button.tools[0], caller:self,
            caller_options:{ section_tipo:self.section_tipo, button_tipo:current_button.tipo } })
        break
    default:
        event_manager.publish('click_' + current_button.model)
}
```

- The DOM class is `'warning ' + model.replace('button_','')`, plus
  `properties.css.style` when present.
- `button_delete` (multiple-record) is hidden unless
  `page_globals.is_global_admin===true`; the per-row trash-can in
  `render_list_section.js` reuses the same `button_delete` context entry but
  publishes a per-record `delete_section_<id>` event.

## Public API / key methods

### The active resolver (TS: `src/core/section/buttons.ts` + `context.ts`)

| function | module | purpose |
| --- | --- | --- |
| `buildSectionButtons(sectionTipo, callerPermissions, principal?)` | `section/buttons.ts` | Resolve the section's `button_%` children into an array of `ButtonContext` (`typo:'ddo', type:'button'`); the single source of the `buttons` context array. Not cached — rebuilt on every call. |
| `sectionRelationListTipo(sectionTipo)` | `section/buttons.ts` | The section's `relation_list` child tipo (virtual-section-aware); feeds `context.config.relation_list_tipo`, not the buttons array itself, but lives in the same module. |
| `stampSectionContext(entry, params)` | `section/context.ts` | Calls `buildSectionButtons()` and writes the result onto `entry.buttons`; only invoked for `model === 'section'`. |

!!! note "PHP reference — the class family this replaces"
    PHP's resolver lived on `common::get_buttons_context()` +
    `section::get_section_buttons_tipo()` (`$ar_buttons` field,
    `$cache_buttons_tools` static cache purged by `common::clear()`), fronted by
    a thin `button_common` base class
    (`core/button_common/class.button_common.php`: `__construct($tipo, $target,
    $section_tipo)` + `define_id`/`define_tipo`/`define_lang`/`define_mode`,
    everything else via `common`'s magic `__call`) with empty `button_new` /
    `button_delete` subclasses. None of this class hierarchy exists on the TS
    server — there is no `button::get_instance()` factory and no per-button
    "execute" method there either; the behaviour of a button is the pair
    *(ontology declaration → client handler)*, and on the TS side the resolver
    is two plain functions.

## Legacy controller path (PHP oracle only)

The TS server has **no equivalent** of this section — it is PHP-only legacy,
described here for completeness. `button_new_json.php` and `button_delete.php`
are per-button controllers that predate the centralised `get_buttons_context()`
flow:

- **`button_new_json.php`** is a standard component-style JSON controller: it
  guards against direct HTTP access (SEC-026), builds a `context` via
  `get_structure_context()` / `get_structure_context_simple()` and returns
  `common::build_element_json_output($context, [])` (empty `data`). It produces a
  `{context, data}` envelope for a *single* button, not the section's button
  array.
- **`button_delete.php`** is an HTML controller that maps `mode` to a
  `html/<class>_<file_name>.phtml` template and `include`s it. It was hardened
  (SEC-054) with a `['edit','list','list_of_values']` allowlist and a `realpath`
  confinement against the class directory to block path traversal from the
  client-supplied `mode`.

!!! warning "Missing `.phtml` templates"
    `button_delete.php` includes `core/button_delete/html/<class>_<mode>.phtml`,
    but **no `html/` directory exists** under `core/button_delete` (nor
    `core/button_new`) in this checkout. The realpath check therefore fails
    closed and the controller returns an `Invalid mode` error div. In the live
    v7 list/edit flow, delete is driven entirely by the client `get_buttons()`
    handler + the delete API, not by this controller — treat `button_delete.php`
    as legacy. Verify before relying on it.

!!! note "get_debugger() etc. are accessor side-effects"
    `button_delete.php` calls things like `$this->get_debugger()`. `debugger`
    is not a declared property, so the magic `__call` GetAccessor returns
    `false` rather than a real object — another sign this controller is legacy.

## Examples

### Declaring a button (ontology node)

A `button_import` attached to a section, configured to dispatch a tool and to
get a custom CSS class on the client:

```json
{
    "tipo"   : "rsc500",
    "parent" : "rsc197",
    "model"  : "button_import",
    "lg-eng" : "Import",
    "properties" : {
        "css"         : { "style": "import_files" },
        "tool_config" : {
            "tool_import" : {
                "ddo_map": [ { "tipo": "rsc85", "section_tipo": "rsc197" } ]
            }
        }
    }
}
```

### The resulting context (server → client), PHP oracle

```json
{
    "context": {
        "tipo"    : "rsc197",
        "model"   : "section",
        "buttons" : [
            { "type":"button", "tipo":"rsc500", "model":"button_import",
              "label":"Import", "properties":{ "css":{"style":"import_files"} },
              "tools":[ { "type":"tool", "model":"tool_import", "name":"tool_import" } ] },
            { "type":"button", "tipo":"...", "model":"button_new",
              "label":"New", "properties":{}, "tools":null }
        ]
    },
    "data": [ ]
}
```

### The resulting context (server → client), TS server today

The same section, resolved by `buildSectionButtons()`: `button_import` is
dropped entirely (excluded model), and the surviving buttons carry no
`properties`/`tools` keys at all —

```json
{
    "context": {
        "tipo"    : "rsc197",
        "model"   : "section",
        "buttons" : [
            { "typo":"ddo", "type":"button", "tipo":"...", "model":"button_new",
              "label":"New" }
        ]
    },
    "data": [ ]
}
```

### Adding a brand-new button behaviour

There are two pieces, and **no server-side class is required** for a plain UI
button:

1. Create a `button_<x>` node in the ontology under the target section, with a
   label and (optionally) a `disable` / `css.style` property.
2. Handle it on the client: the default branch of the list-view switch publishes
   `click_button_<x>`, so a subscriber to that event (or a new `case` in
   `get_buttons()`) implements the action.

On the PHP oracle, add a `button_<x>` PHP class only if you need the legacy
per-button controller behaviour — the v7 context flow never required it, and
the TS server carries no such class at all.

## How it fits with the rest of Dédalo

- **[Sections](../sections/index.md) / [section class](../sections/section.md)** —
  the principal owner: on the TS server, `buildSectionButtons()` (called from
  `stampSectionContext()`) decides which buttons a section exposes; the
  section's list/edit views render them unchanged.
- **[common](../system/common.md)** — the PHP oracle's `get_buttons_context()`
  and structure-context stamp lived here; the TS server has no single
  `common`-equivalent class — `buildStructureContext()` /
  `stampSectionContext()` are the closest analogues, and neither keeps a
  server-side buttons/tools cache to invalidate.
- **[Tools](../../development/tools/creating_tools.md)** — on the PHP oracle,
  `button_import` / `button_trigger` are the bridge from a section header into
  the tools subsystem, carrying built tool contexts
  (`tool_common::create_tool_simple_context()` / `get_user_tools()` /
  `get_tool_configuration()`). **Not yet ported** — see the gap noted above.
- **[dd_object (ddo)](../dd_object.md)** — each button is emitted as a
  `dd_object`-shaped object of `type:'button'`.
- **[Ontology](../ontology/index.md)** — buttons are plain ontology nodes; their
  `model` (`button_*`) and `properties` are the whole declaration.
- **[request_config](../request_config.md)** — the context stamp that includes
  `buttons` is the same one that carries permissions, tools and request_config.

## Related

- [Sections concept](../sections/index.md) · [section class reference](../sections/section.md)
- [Components](../components/index.md) — the data-bearing siblings of buttons under a section.
- [dd_object (ddo)](../dd_object.md) — the wire object every button becomes.
- [Architecture overview](../architecture_overview.md) — where the context/data
  envelope and the ontology-as-schema model come from.
