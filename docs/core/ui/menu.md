# menu

> The server-side **menu** resolver plus its client widget — the back-office
> **main navigation menu**: the permission-filtered tree of ontology *areas*
> and *sections* the logged user may reach, the top utility bar (user,
> language, theme, AI assistant, inspector toggle) and the developer
> debug-info bar.

> See also: [Architecture overview](../architecture_overview.md) ·
> [area](../areas/area.md) · [Ontology](../ontology/index.md) ·
> [Tools](../../development/tools/creating_tools.md) · [dd_object](../dd_object.md)

This page is the developer reference for the **menu** subsystem: on the TS
server it is a small, dependency-free resolver module
(`src/core/resolve/menu.ts`, `getMenuTreeDatalist()`) called from the `menu`
read action (`readMenu()` in `src/core/api/dispatch.ts`); the client is the
same copied-as-is widget (`menu.js` + render/view files) that turns the
resulting datalist into the desktop dropdown tree, the mobile menu and the top
utility bar. The menu is *not* a section: it stores nothing, owns no record,
and exists only to route the user into areas/sections.

!!! note "PHP reference"
    The PHP oracle for this subsystem is `core/menu/class.menu.php`
    (`class menu extends common`) plus its controller `menu_json.php`. The TS
    port intentionally does not carry over the class/inheritance shape — see
    below.

## Role

`getMenuTreeDatalist()` (in `src/core/resolve/menu.ts`) is a plain async
function whose single job is to produce the **navigation datalist** — a flat
array of `{tipo, model, parent, label, config?}` items describing the areas
and sections the current user is authorised to open. The sibling
`buildInfoData()` (in `src/core/resolve/environment.ts`) assembles the
**info_data** object for the developer debug bar (the PHP
`menu::get_info_data()` equivalent). Both are invoked by `readMenu()` in
`src/core/api/dispatch.ts`, which also stamps the menu's `{context}` entry via
the shared `buildStructureContext()` (fixed at permission level 2, matching
PHP's `menu_json.php`).

It sits at the top of the back-office UI, between the ontology (the source of
the area/section tree) and the page shell:

| layer | role |
| --- | --- |
| **[area](../areas/area.md)** | The ontology areas (`area_root`, `area_resource`, `area_admin`, `area_thesaurus`, …) that are the *roots* of the menu tree. `getMenuTreeDatalist()` walks the ontology directly (no separate `area::get_areas()` call — the walk is inlined in `menu.ts`). |
| **principal / security gates** | Resolves *who can see what*: the caller passes `{userId, isGlobalAdmin, isDeveloper}` (the request's `Principal`, see [security](../system/security.md)); `getMenuTreeDatalist()` filters the areas through these flags plus the per-user authorized-areas table. |
| **`menu.ts` resolver** *(this subsystem, server side)* | Builds the permission-filtered, re-parented datalist; `readMenu()` packs it with `info_data`/`show_ontology`/`username` into the `{context, data}` datum. |
| **`menu.js` (client)** | Consumes the datum and renders the desktop tree, the mobile menu and the top utility bar; publishes `user_navigation` events when an item is clicked. |

`menu` is a singleton-ish page element: the client keeps the menu instance alive
across section navigations (it is in `page.js`'s `base_models = ['menu']`, so it
is never destroyed on page refresh) and only its `section_label` is updated as
the user moves between records.

!!! note "No class, no inheritance"
    The PHP `menu` class extended `common` and inherited its magic accessors
    and instance-cache machinery (see the PHP reference note above). The TS
    port has no `menu` object at all — `getMenuTreeDatalist()` /
    `buildInfoData()` are stateless functions, and the menu's `{context}` is
    produced by the same generic `buildStructureContext()` every model
    (`section`, `area_*`, `menu`, …) goes through, at a hardcoded permission
    level of `2` (matching the PHP override's behaviour, not its shape).

The menu is fixed to the same identity quintet the PHP class pinned in its
constructor (`readMenu()` passes these into `buildStructureContext()` /
`getMenuTreeDatalist()`):

| field | value |
| --- | --- |
| `tipo` | `dd85` (the ontology node of the `menu` model) |
| `section_tipo` | `dd1` (the ontology root, `DEDALO_ROOT_TIPO` in the PHP config) |
| `mode` | `'list'` (the mode `readMenu()` requests for the context stamp) |
| `lang` | the current application language (`currentApplicationLang()`, request-scoped and set by `change_lang`) |

## Responsibilities

- **Enumerate the areas** — `getMenuTreeDatalist()` walks the ontology's area
  roots directly (fixed root order: `area_root`, `area_activity`,
  `area_resource`, `area_tool`, `area_thesaurus`, `area_graph`, `area_admin`,
  `area_maintenance`, `area_development`, `area_ontology`), depth-first,
  keeping only area/section/section_tool nodes.
- **Permission-filter** — keep only the areas the user may open: global
  admins + developers see everything; everyone else is intersected with the
  caller's authorized-areas set, and the *Maintenance* and *Development* areas
  are gated to admins/developers regardless of stored permissions.
- **Flatten + re-parent the tree** — rewrite each item's `parent` so that
  "skip" grouping tipos (`getEffectiveMenuSkipTipos(config.menu.skipTipos)`,
  runtime-editable via the maintenance area) are removed from the visible tree while their children
  are lifted up to the nearest non-skipped ancestor (`getVisibleParent()`).
- **Resolve special area models** — rewrite `section_tool` areas into a real
  `section` plus a tool context, and the two thesaurus virtual areas into
  `area_thesaurus` with a `swap_tipo` / view-mode config.
- **System info** — `buildInfoData()` assembles `info_data` (Dédalo/runtime/
  PostgreSQL versions, DB name, entity, server IP, …) for the developer debug
  bar.
- **Context** — `readMenu()` stamps a minimal menu `dd_object` context carrying
  the menu's own tools (e.g. `tool_user_admin`) via the shared
  `buildStructureContext()`.
- **Client render** — build the desktop dropdown tree, the mobile menu and the
  top utility bar; cache the API datum in local DB per `(lang, version, user)`
  and invalidate it on logout.

## Data model

The menu does not persist anything. Its wire shape is the standard
`{context, data}` datum: `readMenu()` (`src/core/api/dispatch.ts`) returns
`{result: {context, data}, msg}` for the `menu` read action, unchanged from the
PHP `common::get_json()` / `menu_json.php` shape.

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

The context carries only the menu's identity and its **tools** (resolved by
the shared `buildStructureContext()` tool-resolution step, e.g.
`tool_user_admin`); it has no `properties`, `css` or `request_config` payload,
unlike a section/component context.

```json
{
    "label"       : "Menu",
    "tipo"        : "dd85",
    "model"       : "menu",
    "lang"        : "lg-eng",
    "mode"        : "list",
    "permissions" : 2,
    "tools"       : [ /* tool contexts, e.g. tool_user_admin */ ]
}
```

## Files & structure

```text
core/menu                              # client (copied as-is)
├── css
│   └── menu.less                      # styles (compiled into main.css)
└── js
    ├── menu.js                        # client widget: init/build/refresh, cache, lang change
    ├── render_menu.js                 # view dispatcher (edit) + render_section_label
    ├── view_default_edit_menu.js      # the top bar layout + debug_info_bar + assistant
    ├── render_menu_tree.js            # desktop dropdown tree (hover/click/keyboard)
    └── render_menu_mobile.js          # collapsible mobile menu

src/core/resolve/menu.ts               # server: getMenuTreeDatalist() (tree + re-parenting)
src/core/resolve/environment.ts        # server: buildInfoData() (debug-bar system info)
src/core/api/dispatch.ts               # server: readMenu() (the menu read action)
```

The PHP `core/menu/class.menu.php` + `menu_json.php` pair is **not** carried
over; the TS server has no `menu` class file to mirror.

### Server: dispatch (no instance, no constructor)

There is no `menu` object on the TS server — `getMenuTreeDatalist()` is a
plain, stateless async function, called directly from the `menu` read action:

```ts
// src/core/api/dispatch.ts — readMenu()
const menuContext = await buildStructureContext({
	tipo: menuTipo, sectionTipo: source.section_tipo ?? menuTipo,
	mode: 'list', lang, permissions: 2, addRequestConfig: false,
})
const { tree_datalist } = await getMenuTreeDatalist({
	userId: principal.userId,
	isGlobalAdmin: principal.isGlobalAdmin,
	isDeveloper: principal.isDeveloper,
})
const dataItem = {
	tipo: menuTipo, model: 'menu', tree_datalist,
	info_data: await buildInfoData(),
	show_ontology: principal.isDeveloper,
	username: context.session?.username ?? null,
}
```

!!! note "No instance cache to clear"
    The PHP class kept no static instance cache and did not override
    `common::clear()` either — it built its datalist fresh on every page
    bootstrap. The TS function is the same: nothing is cached server-side. The
    expensive output (the datalist) is cached on the **client** in local DB, not
    on the server, exactly as before.

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

### Server (`src/core/resolve/menu.ts`, `environment.ts`, `dispatch.ts`)

| function | module | purpose |
| --- | --- | --- |
| `getMenuTreeDatalist(viewer?)` | `resolve/menu.ts` | Build the permission-filtered, re-parented array of menu items (areas + sections), applying the `section_tool` and thesaurus special-case rewrites. `viewer` carries `{userId, isGlobalAdmin, isDeveloper}`; admins/developers get the walk unfiltered. |
| `getVisibleParent(node, skipByTipo)` | `resolve/menu.ts` (private) | Recursively resolve an item's *visible* parent by hopping over any ancestor whose tipo is a configured skip tipo (`config.menu.skipTipos`, overridable at runtime via `getEffectiveMenuSkipTipos()`). |
| `buildInfoData()` | `resolve/environment.ts` | Assemble the system-info object (Dédalo/runtime/PostgreSQL versions, DB name, entity, server software/IP) for the developer debug bar. |
| `readMenu(rqo, context, principal)` | `api/dispatch.ts` | The `menu` read action: stamps the context via the shared `buildStructureContext()` at a hardcoded permission level of `2`, then packs `tree_datalist` + `info_data` + `show_ontology` + `username` into the single data item. |

!!! note "The context stamp is generic, not overridden"
    PHP's `menu::get_structure_context()` was a bespoke override of
    `common`'s cache-backed builder. The TS server has only **one**
    context builder (`buildStructureContext()`, used by every model); `readMenu()`
    simply calls it with `mode:'list'` and `permissions:2` — there is no
    menu-specific context code path to override.

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

- **[area](../areas/area.md)** is the source of the tree roots; `menu.ts`'s
  internal `getOntologyAreas()` walk enumerates `area_root / area_activity /
  area_resource / area_tool / area_thesaurus / area_graph / area_admin /
  area_maintenance / area_development / area_ontology` (minus the effective
  `menu.areasDeny` config) in that fixed order. The menu only filters and
  flattens that list; it does not share the walk with the (separately-ported)
  `getAreas()` in `resolve/security_access_datalist.ts`.
- **The `Principal` gates** decide visibility: non-admin users see the
  intersection of all areas with their authorized-areas set; Maintenance
  and Development are extra-gated by `isGlobalAdmin` / `isDeveloper`.
- **[Tools](../../development/tools/creating_tools.md)** ride in two ways: the menu's own tools
  (`tool_user_admin`, the AI assistant via `tool_assistant`) come through the
  shared `buildStructureContext()` tool-resolution step into the context; and
  `section_tool` areas are rewritten into a real section + a `tool_context`
  built inline in `menu.ts` (`buildSectionToolItem()`).
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

```ts
// src/core/api/dispatch.ts — readMenu(), on every menu read request
const { tree_datalist } = await getMenuTreeDatalist({
	userId: principal.userId,
	isGlobalAdmin: principal.isGlobalAdmin,
	isDeveloper: principal.isDeveloper,
})
// [
//   { tipo:'dd241', model:'area_resource', parent:'dd1',   label:'Resources' },
//   { tipo:'rsc197', model:'section',       parent:'tch188', label:'People' },
//   ...
// ]

// the menu context (identity + tools), added to the page context
const menuContext = await buildStructureContext({
	tipo: 'dd85', sectionTipo: 'dd1', mode: 'list', lang, permissions: 2, addRequestConfig: false,
})
```

### Client: instantiate and build the menu

```js
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
