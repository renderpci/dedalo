# tool_user_admin

Self-service account panel: lets the logged-in user view and edit their own basic data (full name, password, email, avatar) from the username link in the header, without granting them access to the user-management section.

## What it does / why & when to use it

`tool_user_admin` opens a small panel — launched by clicking the **username** in the main menu header — that renders a few components of the current user's own record from the Users section (`dd128`): the user's id, username and profile (read-only), plus their full name, password, email and avatar image (editable). It exists so any logged-in person can maintain their own credentials and profile picture even when their profile does **not** grant write (or any) access to the Users management section as a whole.

The tool itself is **UI-only**: it declares an empty `API_ACTIONS` and has **no remotely callable methods of its own**. Every save it performs goes through the ordinary, already-gated component/section save pipeline against the user's own `dd128` record. The one piece of server machinery that makes it work is a targeted permission override in `section_record::get_permissions()` (see below).

Concrete heritage scenario: a documentalist at a museum is given a profile that lets them catalogue objects but explicitly **not** administer other users. They notice their displayed name is misspelled and they want to set a recognisable avatar and rotate their password after onboarding. They click their name in the top bar; the User admin panel opens showing their id / username / profile as read-only context, and editable fields for full name, password, email and a user image (with the standard upload tool enabled on the image). They fix the name, set a new password, upload a portrait, and close the panel — all without ever touching the Users section or seeing any other account.

Use it when: you want end users to self-manage their own account essentials from the header. Do not expect it to administer *other* users, to expose admin actions, or to dispatch any server action on this class — it is a front-end editor over the logged user's own Users-section record.

## How it works (server + client)

**Server.** `tools/tool_user_admin/class.tool_user_admin.php` is a near-empty subclass of `tool_common`. Its only declared member is:

```php
// SEC-024 (§9.2): UI-only tool. No remotely callable methods. The empty
// allowlist prevents inherited tool_common static methods from being
// dispatched via dd_tools_api::tool_request against this tool name.
public const API_ACTIONS = [];
```

An empty (but present) `API_ACTIONS` satisfies the SEC-024 dispatch requirement while exposing **nothing** to `dd_tools_api::tool_request` — including the inherited `tool_common` statics, which would otherwise be reachable under this tool name. It overrides no lifecycle hooks and inherits all registry/config/context plumbing from `tool_common`.

The behaviour that lets a low-privilege user edit their own data lives in core, not in the tool: `core/section_record/class.section_record.php::get_permissions()` has a special case — when the section is the Users section (`DEDALO_SECTION_USERS_TIPO`, `dd128`) **and** the record being accessed is the logged user's own (`section_id == logged_user_id()`), the permission level is forced to `1` (read-only at the section level) specifically "to allow tool_user_admin access regardless of the general user-management permission level". Field-level edits the tool offers (full name, password, email, image) are then saved through each component's normal save path; the individual editable ddos in the tool's map are not flagged read-only, while the contextual ones are pinned to `permissions: 1`.

**Client** (`tools/tool_user_admin/js/`). The instance is `tool_user_admin.js`; `render_tool_user_admin.js` builds the body; `index.js` re-exports the module. Notable points:

- **Launch path.** It is *not* surfaced by matching an element. The header username link wires a click/Enter handler (`core/menu/js/view_default_edit_menu.js`) that calls `menu.open_tool_user_admin_handler()` (`core/menu/js/menu.js`), which finds the tool context in `self.context.tools` (built server-side by `menu::get_tools()` / `create_tool_simple_context`) and calls the shared `open_tool({tool_context, caller})` from `tool_common.js`.
- **Fixed target = the logged user.** Unlike element-driven tools, this one hard-codes its target: `section_tipo = 'dd128'` and `section_id = page_globals.user_id`. `build_user_section()` builds a dedicated `dd128` section instance with its own `request_config` whose `show.ddo_map` is supplied by `get_ddo_map()` (overriding the section's default show map), with `filter` and `inspector` disabled.
- **The ddo_map** (the components rendered, all `section_tipo: 'dd128'`):

  | tipo | model | role |
  | --- | --- | --- |
  | `dd330` | `component_section_id` | section id — read-only (`permissions: 1`) |
  | `dd132` | `component_input_text` | username — read-only |
  | `dd1725` | `component_select` | user profile — read-only |
  | `dd452` | `component_input_text` | full user name — editable |
  | `dd133` | `component_password` | password — editable |
  | `dd134` | `component_email` | email — editable |
  | `dd522` | `component_image` | user image — editable (upload tool enabled via `show_interface.tools: true`) |

  All non-image components set `show_interface.tools: false` to hide inline tooling; the image keeps `tools: true` so the upload tool is available. (A `dd170` projects/filter ddo is present but commented out.)
- **Rendering.** `render_tool_user_admin.js::edit` builds a standard tool wrapper (`ui.tool.build_wrapper_edit`); `get_content_data` lays out one `component_column` per ddo inside a CSS grid `components_container`, resolving each ddo to a live instance via `self.get_component(ddo)` (which itself fixes `section_id = page_globals.user_id`, `section_tipo = 'dd128'`, `lang = page_globals.dedalo_data_lang`) and rendering them in parallel.
- **Demo guard.** `build()` throws (and the panel surfaces an error instead of editable fields) when `page_globals.dedalo_entity === 'dedalo_demo'` and `page_globals.username === 'dedalo'`, so the demo's shared account cannot be mutated; the comment notes the server security controls already enforce this independently.
- **Close.** `on_close_actions('modal')` destroys the tool instance without refreshing the caller (the caller is the menu, not a `component_json`).

## Actions & options

This tool declares **no** API actions of its own:

| `API_ACTIONS` | Value |
| --- | --- |
| `tool_user_admin` | `[]` (empty — UI-only, nothing dispatchable on this class) |

There is therefore no `tool_request` envelope, no permission gate spec and no `BACKGROUND_RUNNABLE` for this tool. Saves are issued by the rendered component instances through their normal save paths against the logged user's own `dd128` record; each is gated by the ordinary `section_record` / component permission checks (with the own-record override above granting access). The client-side inputs the tool effectively works with are not request options but fixed globals it reads:

| Reads (client global) | Used for |
| --- | --- |
| `page_globals.user_id` | `section_id` of the target Users record (the logged user) |
| `page_globals.dedalo_data_lang` / `dedalo_data_nolan` | component / section language and no-language context |
| `page_globals.dedalo_entity`, `page_globals.username` | demo-account guard in `build()` |
| fixed `'dd128'` | target `section_tipo` (Users section) and the ddo_map parent/section tipos |

## How it is registered & surfaced

`tools/tool_user_admin/register.json` is a **legacy v6** file (a raw record dump with `components`/`relations` keys); `tools_register` auto-converts it at registration (the `components` key triggers the v6 converter). Essentials it carries:

- `dd1326` name = `tool_user_admin`; `dd1327` version `2.0.2`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *User admin* (localized across project languages — Administración de usuario, Administration des utilisateurs, etc.); `dd612` description = "Manages logged user basic data directly from the menu link".
- `dd1350` **affected_tipos** = `["dd85"]`.
- `dd999` config carries an empty `ddo_map` (the operative ddo_map is built client-side in `get_ddo_map()`, not from config).
- The affected_models / show_in_inspector / show_in_component / require_translatable / always_active / active flags (`dd1330` / `dd1331` / `dd1332` / `dd1333` / `dd1601` / `dd1354`) appear as **relations** to their ontology records in this v6 dump rather than as inline values.

Surfacing: this tool is **menu-launched, not element-attached**. It is delivered in the menu's tool context list (`menu::get_tools()`), and the header username link is the trigger. It does **not** render as an inspector panel or as an inline component button on ordinary records — there is no `show_in_*` button placement that exposes it next to a section or component the way data tools do. It opens as the User admin panel from the username menu (see `core/menu/js/menu.js` and `core/menu/js/view_default_edit_menu.js`).

## Examples

There is no server `tool_request` to show — the tool issues none. The realistic "usage" is the launch path and the fixed target it builds.

Launch (what the username-link click handler does):

```js
// core/menu/js/menu.js
menu.prototype.open_tool_user_admin_handler = function() {
    const self = this
    // find the tool in the menu's server-provided tool list
    const tool_user_admin = self.context.tools.find(el => el.model === 'tool_user_admin')
    if (!tool_user_admin) {
        console.error('Tool user admin is not available in tools. Check your user profile tools.')
        return
    }
    // shared opener from tool_common.js
    open_tool({ tool_context: tool_user_admin, caller: self })
}
```

Target the tool builds (the logged user's own Users record), from `build_user_section()`:

```js
const section_tipo = 'dd128'                 // Users section
const section_id   = '' + page_globals.user_id   // the logged user
const request_config = [{
    api_engine : 'dedalo',
    type       : 'main',
    show       : { ddo_map : self.get_ddo_map() }, // overrides the section default show map
    sqo        : { section_tipo: [section_tipo], limit: 1, offset: 0 }
}]
// section instance is built with filter=false, inspector=false
```

The own-record access that makes this editable for any user (core, not the tool):

```php
// core/section_record/class.section_record.php :: get_permissions()
if ($this->section_tipo===DEDALO_SECTION_USERS_TIPO && $this->section_id==logged_user_id()) {
    $this->permissions = 1; // allow tool_user_admin to reach the user's own record
}
```

## Related

- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `API_ACTIONS` (incl. the empty-array UI-only case), gates and lifecycle this page builds on.
- [tool_indexation](tool_indexation.md), [tool_diffusion](tool_diffusion.md) — other UI-only tools with an empty `API_ACTIONS` (front-end orchestrators over existing component/section pipelines).
- [tool_export](tool_export.md) — contrast: a section tool with a real dispatchable action and a permission-gated map-form `API_ACTIONS`; see [Exporting data](../../../core/exporting_data.md).
- Core glue: `core/menu/js/menu.js` (`open_tool_user_admin_handler`), `core/menu/js/view_default_edit_menu.js` (username link handler), `core/section_record/class.section_record.php::get_permissions()` (own-record override).
- Source: `tools/tool_user_admin/class.tool_user_admin.php`, `tools/tool_user_admin/register.json`, `tools/tool_user_admin/js/{tool_user_admin,render_tool_user_admin,index}.js`, `tools/tool_user_admin/css/tool_user_admin.less`.
