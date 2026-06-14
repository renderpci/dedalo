# menu

> The server class `menu` plus its client widget — the back-office **main
> navigation menu**: the permission-filtered tree of ontology *areas* and
> *sections* the logged user may reach, the top utility bar (user, language,
> theme, AI assistant, inspector toggle) and the developer debug-info bar.

> See also: [Architecture overview](../architecture_overview.md) ·
> [area](../areas/area.md) · [Ontology](../ontology/index.md) ·
> [Tools](../../development/tools/creating_tools.md) · [dd_object](../dd_object.md)

This page is the developer reference for the **menu** subsystem: one small PHP
class (`menu`) that builds the navigation datalist on the server, its JSON
controller, and a client widget (`menu.js` + render/view files) that turns that
datalist into the desktop dropdown tree, the mobile menu and the top utility
bar. The menu is *not* a section: it stores nothing, owns no record, and exists
only to route the user into areas/sections.

## Role

`menu` (in `core/menu/class.menu.php`, `class menu extends common`) is a thin
runtime object whose single job is to produce the **navigation datalist** — a
flat array of `{tipo, model, parent, label, config?}` items describing the
areas and sections the current user is authorised to open — together with a
small **info_data** object for the developer debug bar.

It sits at the top of the back-office UI, between the ontology (the source of
the area/section tree) and the page shell:

| layer | role |
| --- | --- |
| **[area](../areas/area.md)** | The ontology areas (`area_root`, `area_resource`, `area_admin`, `area_thesaurus`, …) that are the *roots* of the menu tree. `menu` calls `area::get_areas()` to enumerate them. |
| **`security`** | Resolves *who can see what*: `security::is_global_admin()`, `security::is_developer()`, `security::get_ar_authorized_areas_for_user()`. `menu` filters the areas through these. |
| **`menu`** *(this class)* | Builds the permission-filtered, parent-rewritten datalist and the system info object; emits a `{context, data}` datum through `common::get_json()`. |
| **`menu.js` (client)** | Consumes the datum and renders the desktop tree, the mobile menu and the top utility bar; publishes `user_navigation` events when an item is clicked. |

`menu` is a singleton-ish page element: the client keeps the menu instance alive
across section navigations (it is in `page.js`'s `base_models = ['menu']`, so it
is never destroyed on page refresh) and only its `section_label` is updated as
the user moves between records.

!!! note "Inheritance"
    `menu extends common`, so it inherits the shared object machinery: the
    `$tipo`, `$section_tipo`, `$mode`, `$lang`, `$label` identity fields and
    methods such as `load_structure_data()`, `get_tipo()` / `get_mode()` /
    `get_label()` / `get_lang()`, `get_tools()` and the magic `get_X()`/`set_X()`
    accessors. It **overrides** `get_structure_context()` with a bespoke,
    lightweight implementation (see below) rather than using `common`'s
    cache-backed `build_structure_context()`.

The menu is fixed to the identity quintet set in its constructor:

| field | value |
| --- | --- |
| `tipo` | `dd85` (the ontology node of the `menu` class) |
| `section_tipo` | `DEDALO_ROOT_TIPO` (`dd1`, the ontology root) |
| `mode` | `'edit'` by default (the only mode the controller handles) |
| `lang` | `DEDALO_APPLICATION_LANG` (labels are resolved in the *interface* language) |

## Responsibilities

- **Enumerate the areas** — pull every installed area via `area::get_areas()`.
- **Permission-filter** — keep only the areas the user may open: global
  admins + developers see everything; everyone else is intersected with
  `security::get_ar_authorized_areas_for_user()`, and the *Maintenance* and
  *Development* areas are gated to admins/developers regardless of stored
  permissions.
- **Flatten + re-parent the tree** — rewrite each item's `parent` so that
  "skip" grouping tipos (`DEDALO_ENTITY_MENU_SKIP_TIPOS`) are removed from the
  visible tree while their children are lifted up to the nearest non-skipped
  ancestor (`get_my_parent()`).
- **Resolve special area models** — rewrite `section_tool` areas into a real
  `section` plus a tool context, and the two thesaurus virtual areas into
  `area_thesaurus` with a `swap_tipo` / view-mode config.
- **System info** — assemble `info_data` (Dédalo/PHP/PostgreSQL versions, DB
  name, SAPI, entity, server IP, …) for the developer debug bar.
- **Context** — emit a minimal menu `dd_object` context carrying the menu's own
  tools (e.g. `tool_user_admin`).
- **Client render** — build the desktop dropdown tree, the mobile menu and the
  top utility bar; cache the API datum in local DB per `(lang, version, user)`
  and invalidate it on logout.

## Data model

The menu does not persist anything. Its wire shape is the standard
`{context, data}` datum produced by `common::get_json()` via the controller
`menu_json.php`.

### `data` — the navigation datalist + info

The single data item has shape:

```json
{
    "tipo"          : "dd85",
    "model"         : "menu",
    "tree_datalist" : [ /* flat array of menu items, see below */ ],
    "info_data"     : { /* system info for the debug bar */ },
    "show_ontology" : true,
    "username"      : "alex"
}
```

A `tree_datalist` item (one per visible area/section):

```json
{
    "tipo"   : "rsc197",
    "model"  : "section",
    "parent" : "tch188",
    "label"  : "People",
    "config" : { /* present only for special cases, see below */ }
}
```

- `parent` is the **re-parented** parent (skip-grouping tipos already removed),
  so the client builds the tree by grouping items on `parent`.
- `config` is added only for the special-case rewrites:
    - **`section_tool` area** → `model` becomes `'section'`, `tipo` becomes the
      `properties->config->target_section_tipo`, and
      `config = properties->config` with an added `config.tool_context` (built
      by `tool_common::create_tool_simple_context()`). This is how a tool-backed
      menu entry opens the *real* target section but with tool behaviour layered
      on. If the named tool is not in the user's tool set, the area is skipped.
    - **`DEDALO_THESAURUS_VIRTUALS_AREA_TIPO`** (`hierarchy56`) → `model`
      becomes `'area_thesaurus'`, `config = { swap_tipo: DEDALO_THESAURUS_TIPO }`
      (`dd100`). The client swaps `tipo` to `swap_tipo` on click.
    - **`DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO`** (`hierarchy57`) → same as
      above plus `thesaurus_view_mode: 'model'` and a matching `url_vars`.

### `context` — the menu dd_object

The context carries only the menu's identity and its **tools** (resolved from
`common::get_tools()`, e.g. `tool_user_admin`); it has no `properties`, `css` or
`request_config` payload, unlike a section/component context.

```json
{
    "label"       : "Menu",
    "tipo"        : "dd85",
    "model"       : "menu",
    "lang"        : "lg-eng",
    "mode"        : "edit",
    "permissions" : 1,
    "tools"       : [ /* tool contexts, e.g. tool_user_admin */ ]
}
```

## Files & structure

```text
core/menu
├── class.menu.php                 # server: builds tree_datalist + info_data + context
├── menu_json.php                  # JSON controller (included by common::get_json)
├── css
│   └── menu.less                  # styles (compiled into page.css)
└── js
    ├── menu.js                    # client widget: init/build/refresh, cache, lang change
    ├── render_menu.js             # view dispatcher (edit) + render_section_label
    ├── view_default_edit_menu.js  # the top bar layout + debug_info_bar + assistant
    ├── render_menu_tree.js        # desktop dropdown tree (hover/click/keyboard)
    └── render_menu_mobile.js      # collapsible mobile menu
```

### Server: instantiation & lifecycle

`menu` has a plain public constructor (no `get_instance()` factory):

```php
public function __construct(string $mode = 'edit')
```

It is created on the page bootstrap request in
`dd_core_api` when the user is already logged and the page needs a menu:

```php
// core/api/v1/common/class.dd_core_api.php (already-logged branch)
$menu = new menu();
$menu->set_lang(DEDALO_DATA_LANG);
$context[] = $menu->get_structure_context();
```

The constructor pins `tipo = 'dd85'`, `section_tipo = DEDALO_ROOT_TIPO`,
`lang = DEDALO_APPLICATION_LANG`, the given `mode`, then calls
`parent::load_structure_data()` to pull its ontology label/model.

!!! note "No instance cache, no `clear()` override"
    Unlike `section` / `component_common`, `menu` keeps no static instance
    cache and does not override `common::clear()`. It is a cheap, short-lived
    object: one is built per page bootstrap. Its expensive output (the datalist)
    is cached on the **client** in local DB, not on the server.

### Client: lifecycle

`menu.js` follows the standard client element contract (it borrows
`render` / `destroy` from `common.prototype`):

- **`init(options)`** — sets `tipo` (default `dd85`), `model`, the datum, and
  subscribes to the login `quit` event to flush the local cache.
- **`build(autoload=true)`** — when autoloading, issues a `read` RQO
  (`source = get_data`) and caches the API response in local DB under
  `build_cache_id()` (`menu_cache_<lang>_<version>_<user_id>`); then pins the
  instance's `context` / `data` from the returned datum.
- **`edit(options)`** / **`list(options)`** — both render the `default` view
  (`view_default_edit_menu.render`). The menu has only a `default` view.
- **`refresh(options)`** — deletes the local cache (when `build_autoload`) then
  calls the generic `common.refresh`.
- **`delete_cache()`** — drops every `menu_cache_*` local DB entry (all langs).

## Public API / Key methods

### Server (`class.menu.php`)

| method | static? | purpose |
| --- | --- | --- |
| `__construct($mode='edit')` | | Pin identity (`dd85` / `dd1` / app lang / mode) and load the ontology structure. |
| `get_tree_datalist()` | | Build the permission-filtered, re-parented array of menu items (areas + sections), applying the `section_tool` and thesaurus special-case rewrites. Returns `[]` (with a warning) when there is no logged user. |
| `get_my_parent($area, $skip_parents)` | ✓ (private) | Recursively resolve an item's *visible* parent by hopping over any ancestor whose tipo is in `DEDALO_ENTITY_MENU_SKIP_TIPOS`. |
| `get_info_data()` | | Assemble the system-info object (Dédalo version/build, DB name + PostgreSQL version, PHP version/JIT/memory/SAPI/user, entity, server software/IP) for the developer debug bar. |
| `get_structure_context($permissions=1, $add_request_config=false)` | | Build the menu's `dd_object` context: identity fields + the menu's resolved tools (via `get_tools()` + `tool_common::create_tool_simple_context()`). **Overrides** `common::get_structure_context()` with a bespoke, un-cached build. |

!!! warning "`get_structure_context()` is overridden, not inherited"
    `menu` does **not** use `common`'s cache-backed `build_structure_context()`
    /  `$cache_structure_context` path. It builds a fresh `dd_object` on every
    call, with only `label/tipo/model/lang/mode/permissions/tools` (and a
    `debug` block under `SHOW_DEBUG`). The `$add_request_config` parameter is
    accepted for signature compatibility but ignored. The `$permissions`
    argument defaults to `1` (read-only) and is stamped verbatim.

### Server (`menu_json.php` controller)

The controller is included inside the menu instance scope by
`common::get_json()`. It:

1. Adds the context (`get_structure_context(2, false)`) when `get_context`.
2. When `get_data`, calls `get_tree_datalist()` + `get_info_data()` and packs a
   single data item that also carries `show_ontology` (= `security::is_developer()`)
   and `username` (= `logged_user_username()`).
3. Returns `common::build_element_json_output($context, $data)`.

### Client (`menu.js`)

| method | purpose |
| --- | --- |
| `init(options)` | Initialise instance fields; subscribe to `quit` → `delete_cache`. |
| `build(autoload=true)` | Load+cache the menu datum (RQO `read` / `get_data`), then pin `context`/`data`. |
| `edit(options)` / `list(options)` | Render the `default` view (top bar + tree). |
| `refresh(options={})` | Drop the local cache and re-build. |
| `build_cache_id(lang?)` | Compose the local DB key `menu_cache_<lang>_<version>_<user_id>`. |
| `delete_cache()` | Remove all `menu_cache_*` local DB entries. |
| `open_ontology(e)` | Open the v5 ontology editor in a new tab. |
| `open_tool_user_admin_handler()` | Open `tool_user_admin` from the context tools (the username button). |
| `update_section_label(options)` | Replace the menu's *current section* label (called by `section` after render); retries up to 3× if the node is not ready. |
| `change_lang(options)` | Fire the `dd_utils_api` `change_lang` action and publish a `change_lang` event (then the page reloads). |

### Client render files

| file / export | purpose |
| --- | --- |
| `render_menu.edit` / `render_section_label` | View dispatcher; builds the empty section-label slot. |
| `view_default_edit_menu.render` | The full top bar: quit, Dédalo icon, desktop tree, mobile icon, username, language selectors, theme toggle, AI-assistant button, section-label + inspector toggle, and (for developers) the `debug_info_bar`. A `ResizeObserver` switches between the desktop tree and the mobile icon on overflow. |
| `render_menu_tree.render_tree` | Build the desktop dropdown tree from `tree_datalist`, grouping items by `parent` (`items_by_parent` Map) and rendering levels **lazily** on hover/click. Wires global click / mousedown / Escape handlers to open/close drop menus. |
| `render_menu_mobile.render_menu` | Build the collapsible mobile menu (recursive `render_menu_node`). |

## How it fits with the rest of Dédalo

- **[area](../areas/area.md)** is the source of the tree roots; `area::get_areas()`
  enumerates `area_root / area_resource / area_admin / area_thesaurus / area_tool /
  area_graph / area_maintenance / area_development / area_ontology` (minus the
  installation `areas_deny`). The menu only filters and flattens that list.
- The **`security`** class decides visibility: non-admin users see the
  intersection of all areas with `get_ar_authorized_areas_for_user()`; Maintenance
  and Development are extra-gated by `is_global_admin()` / `is_developer()`.
- **[Tools](../../development/tools/creating_tools.md)** ride in two ways: the menu's own tools
  (`tool_user_admin`, the AI assistant via `tool_assistant`) come through
  `common::get_tools()` into the context; and `section_tool` areas are rewritten
  into a real section + a `tool_context` built by
  `tool_common::create_tool_simple_context()`.
- **[Ontology](../ontology/index.md)** supplies the area/section nodes, labels
  (resolved in the interface language) and the special tipos (`dd1`, `dd85`,
  `dd100`, `hierarchy56`, `hierarchy57`).
- **Navigation**: clicking an item publishes a `user_navigation` event
  (`{source:{tipo, model, mode:'list', config}}`) that `page.js` consumes to
  swap the page element — the menu instance itself is preserved across the swap
  (it is a `base_model`).
- **[dd_object](../dd_object.md)**: the context is a `dd_object`, the same
  normalized shape every element emits.

## Examples

### Server: build the navigation datalist

```php
// built on the page bootstrap, already-logged branch
$menu = new menu();              // tipo dd85, section_tipo dd1, app lang, mode 'edit'
$menu->set_lang(DEDALO_DATA_LANG);

// the permission-filtered, re-parented list of areas/sections
$datalist = $menu->get_tree_datalist();
// [
//   { tipo:'dd241', model:'area_resource', parent:'dd1',   label:'Resources' },
//   { tipo:'rsc197', model:'section',       parent:'tch188', label:'People' },
//   ...
// ]

// the menu context (identity + tools), added to the page context
$context = $menu->get_structure_context(); // dd_object
```

### Client: instantiate and build the menu

```javascript
// page.js forces a per-user id_variant so different users never share an instance
const instance_options = {
    model      : 'menu',
    tipo       : 'dd85',
    mode       : 'list',
    lang       : page_globals.dedalo_application_lang,
    id_variant : page_globals.user_id   // menu-specific, avoids cross-user id clashes
}
const menu_instance = await get_instance(instance_options)
await menu_instance.build(true)   // loads + caches the datum, then renders on render()
```

!!! note "Why the per-user `id_variant`"
    `page.js` sets `instance_options.id_variant = page_globals.user_id` for the
    `menu` model, and the client cache key
    (`menu_cache_<lang>_<version>_<user_id>`) is likewise user-scoped. Both
    guard against a *persistent worker / shared client cache* serving one user's
    permission-filtered menu to another — the same state-bleed concern the
    server caches address with user-id-prefixed keys.

## Related

- [area](../areas/area.md) — the ontology areas that are the menu's tree roots.
- [Architecture overview](../architecture_overview.md) — the areas → sections →
  components → data hierarchy the menu navigates.
- [Ontology](../ontology/index.md) — the active schema that supplies the nodes
  and labels.
- [Tools](../../development/tools/creating_tools.md) — `tool_user_admin`,
  `tool_assistant`, and the `section_tool` rewrite path.
- [dd_object (ddo)](../dd_object.md) — the normalized context object the menu
  emits.
- [Events](../events.md) — the `user_navigation` / `quit` / `change_lang`
  events the menu publishes and subscribes to.
