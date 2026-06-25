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
`button_trigger`) declared as a child of a *section* (or an *area*). Unlike a
component, a button stores nothing in the matrix and renders no value: it is a
declaration that *"this section offers this action"*. At build time the section
collects its `button_*` children, filters them by permission, and emits one
`dd_object` of `type:'button'` per surviving button into the `buttons` array of
the context envelope. The client (`section` list/edit views) reads that array
and builds the actual DOM `<button>` elements, wiring each `model` to a concrete
handler.

So the subsystem spans three layers:

| layer | what it is |
| --- | --- |
| **Ontology** | `button_*` nodes declared as children of a section/area, carrying a `label` (term) and `properties` (e.g. `disable`, `css.style`, `tool_config`). |
| **Server (PHP)** | `common::get_buttons_context()` resolves those nodes into `dd_object`s. A thin `button_common` class (extended by `button_new` / `button_delete`) exists for the legacy per-button controller/JSON path, but the **list of buttons in a section's context is produced by `common`/`section`, not by instantiating the button classes**. |
| **Client (JS)** | the section views' `get_buttons()` build the `buttons_container` DOM and attach the per-`model` click behaviour. |

!!! note "Inheritance (PHP side)"
    `button_common extends common` (`core/button_common/class.button_common.php`).
    `button_delete` and `button_new` are empty subclasses
    (`class button_delete extends button_common {}`). Because it extends
    `common`, a button object inherits the magic `__call` accessors
    (`get_tipo()`, `get_label()`, `get_properties()`, `get_mode()`, …),
    `load_structure_data()`, `get_structure_context()` /
    `get_structure_context_simple()`, `get_permissions()` and the static cache
    machinery — see the [`common` contract](../system/common.md).

## Responsibilities

- **Declare actions** on a section/area through ontology `button_*` child nodes.
- **Resolve** those nodes into the `buttons` context array
  (`common::get_buttons_context()`), filtered by permission and by the node's
  `disable` property.
- **Carry per-button configuration** in the node `properties`: a `disable` flag,
  an optional `css.style` class hint, and (for tool-dispatching buttons) a
  `tool_config` map keyed by tool name.
- **Bridge to tools**: `button_import` / `button_trigger` resolve the user's
  tools and attach a `tools` array of tool contexts to the button ddo so the
  client can open the matching tool.
- **Legacy controller path** (`button_common` subclasses): provide a thin
  `target`/`id`/`context_tipo` carrier and a `*_json.php` / `*.phtml` controller
  used by older flows — see the warnings below.

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

`get_buttons_context()` reads these from the node's `properties`:

| property | effect |
| --- | --- |
| `disable: true` | the button is skipped entirely (not emitted into the context). |
| `css.style` | a CSS class name the client adds to the rendered `<button>` (e.g. `"css": { "style": "import_files" }`). |
| `tool_config` | (only for `button_import` / `button_trigger`) an object keyed by tool name; each value is a tool config (notably a `ddo_map`) used to build the tool context attached to the button. |

### The button ddo (wire shape)

Each surviving button becomes a `dd_object` with `type:'button'`. The fields set
in `get_buttons_context()` are:

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

### Concrete button models

| model | meaning | client behaviour |
| --- | --- | --- |
| `button_new` | create a new record in the section | publishes `new_section_<id>` (the section creates a record). |
| `button_delete` | delete record(s) of the section | opens the delete dialog (`render_delete_record_dialog`) over the current SQO; in the list view it is gated to global admins for multiple delete, and a per-row trash-can `button_delete` is also rendered from the same context entry. |
| `button_import` / `button_trigger` | dispatch a **tool** from the section header (v5-compat) | opens the tool via `open_tool(...)` using `current_button.tools[0]`. The two are treated identically in code; the comments note they are intended to merge into a future `button_tool` model. |
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

The **active** resolution code does not live here — it lives in:

- `core/common/class.common.php` → `get_buttons_context()` (the resolver) and the
  `$cache_buttons_tools` / `$buttons_context` caches.
- `core/section/class.section.php` → `get_section_buttons_tipo()` (which
  `button_*` child tipos a section exposes, incl. virtual-section merge) and the
  `$ar_buttons` field.
- The client section views → `get_buttons()` in
  `core/section/js/view_default_list_section.js`,
  `view_base_list_section.js`, `view_graph_list_section.js`,
  `view_default_edit_section.js`, and the per-row delete in
  `core/section/js/render_list_section.js`.

## How a section resolves its buttons (server)

`common::get_buttons_context()` is the single resolver. Outline:

1. **Model gate** — only runs for `section` and `area*` callers; returns `[]`
   for anything else.
2. **Collect tipos** — `section` callers use
   `section::get_section_buttons_tipo()` (which walks the section's children for
   model `button_`, and for a *virtual* section merges the real section's
   buttons with the virtual section's own, honouring the virtual section's
   `exclude_elements`). Area callers use
   `ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'button_', 'children', false)`.
3. **Per button**, in order:
   - **Permission** — `common::get_permissions($section_tipo, $button_tipo)`;
     skip if `< 2` (needs write).
   - **Model** — resolved via `ontology_node::get_model_by_tipo()`; skip if it is
     in `common::$ar_temp_exclude_models`.
   - **Label** — `ontology_node::get_term_by_tipo()` in
     `DEDALO_APPLICATION_LANG`.
   - **Properties** — from `ontology_node::get_instance(...)->get_properties()`;
     skip if `properties->disable === true`.
   - **Tools** (only `button_import` / `button_trigger`) — fetch
     `tool_common::get_user_tools()`, match each against the button's
     `properties->tool_config->{tool_name}`, let a registered/record
     configuration override the `ddo_map`, and build a tool context via
     `tool_common::create_tool_simple_context()`. The result is memoised in the
     static `self::$cache_buttons_tools` keyed by
     `user _ button_tipo _ tipo _ section_tipo` (trimmed by `manage_cache_size()`).
   - **Build ddo** — a `dd_object` with `type/tipo/model/label/properties/tools`.
4. The array is cached on the instance in `$buttons_context` and returned.

`get_structure_context()` (the per-call context stamp in `common`) calls
`get_buttons_context()` and writes the result under `buttons` in the context;
the **simple** context (`get_structure_context_simple()` / `simple===true`)
deliberately **skips** button (and tool) calculation, so simple subcontexts
carry no `buttons`.

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

### `button_common` (`core/button_common/class.button_common.php`)

| method | static? | purpose |
| --- | --- | --- |
| `__construct($tipo, $target, $section_tipo)` | | Sets `tipo`/`target`/`section_tipo`, calls `define_id(null)` + `define_lang(DEDALO_APPLICATION_LANG)`, then `parent::load_structure_data()`. Throws if `$target` is a non-empty non-int (it is normally an int matrix section id). |
| `define_id($id)` | | (protected) set `$id`. |
| `define_tipo($tipo)` | | (protected) set `$tipo`. |
| `define_lang($lang)` | | (protected) set `$lang`. |
| `define_mode($mode)` | | (protected) set `$mode`. |

Public fields: `$target` (string\|int\|null), `$id` (string\|int\|null),
`$context_tipo` (?string). Everything else (`get_tipo()`, `get_label()`,
`get_properties()`, `get_mode()`, `get_target()`, `get_structure_context*()`,
…) comes from `common` via the magic `__call` accessor.

`button_delete` and `button_new` add **no** methods of their own.

### The active resolver (lives on `common` / `section`)

| method | class | static? | purpose |
| --- | --- | --- | --- |
| `get_buttons_context()` | `common` | | Resolve the caller's `button_*` children into an array of `dd_object` (`type:'button'`); the single source of the `buttons` context array. Memoised in `$buttons_context`. |
| `get_section_buttons_tipo()` | `section` | | The list of `button_*` child tipos a section exposes, merging real + virtual section buttons and applying the virtual section's `exclude_elements`. |
| `$ar_buttons` | `section` | | (field) holder for a section's button elements. |
| `$cache_buttons_tools` | `common` | ✓ | Static cache of built tool contexts for `button_import`/`button_trigger`, purged in `common::clear()`. |

!!! warning "Do not invent button methods"
    There is **no** `button::get_instance()` factory and no per-button "execute"
    method on the PHP side of the v7 list flow. The behaviour of a button is the
    pair *(ontology declaration → client handler)*. The PHP `button_*` classes
    are thin carriers for the legacy controller path only.

## Legacy controller path (use with care)

`button_new_json.php` and `button_delete.php` are per-button controllers that
predate the centralised `get_buttons_context()` flow:

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

### The resulting context (server → client)

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

### Adding a brand-new button behaviour

There are two pieces, and **no PHP class is required** for a plain UI button:

1. Create a `button_<x>` node in the ontology under the target section, with a
   label and (optionally) a `disable` / `css.style` property.
2. Handle it on the client: the default branch of the list-view switch publishes
   `click_button_<x>`, so a subscriber to that event (or a new `case` in
   `get_buttons()`) implements the action.

Only add a `button_<x>` PHP class if you need the legacy per-button controller
behaviour; the v7 context flow does not require it.

## How it fits with the rest of Dédalo

- **[Sections](../sections/index.md) / [section class](../sections/section.md)** —
  the principal owner: `section::get_section_buttons_tipo()` decides which
  buttons a section exposes (incl. the virtual-section merge), and the section's
  list/edit views render them.
- **[common](../system/common.md)** — `get_buttons_context()` and the
  structure-context stamp live here; `$cache_buttons_tools` is one of the
  worker-state-bleed-sensitive statics cleared by `common::clear()`.
- **[Tools](../../development/tools/creating_tools.md)** — `button_import` /
  `button_trigger` are the bridge from a section header into the tools subsystem;
  they carry built tool contexts
  (`tool_common::create_tool_simple_context()` / `get_user_tools()` /
  `get_tool_configuration()`).
- **[dd_object (ddo)](../dd_object.md)** — each button is emitted as a
  `dd_object` of `type:'button'` (the type is in `dd_object::$ar_type_allowed`).
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
