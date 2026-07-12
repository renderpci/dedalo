# tool_user_admin

Self-service account panel: lets the logged-in user view and edit their own basic data (full name, password, email, avatar) from the username link in the header, without granting them access to the user-management section.

## What it does / why & when to use it

`tool_user_admin` opens a small panel — launched by clicking the **username** in the main menu header — that renders a few components of the current user's own record from the Users section (`dd128`): the user's id, username and profile (read-only), plus their full name, password, email and avatar image (editable). It exists so any logged-in person can maintain their own credentials and profile picture even when their profile does **not** grant write (or any) access to the Users management section as a whole.

The tool itself is **UI-only**: it ships no server module and has **no remotely callable actions of its own**. Every save it performs goes through the ordinary, already-gated component/section save pipeline against the user's own `dd128` record. **The permission engine has no special case letting a low-privilege user write their own Users record independently of their profile's general Users-section grant** — a real, verified gap on this engine (see below).

Concrete heritage scenario: a documentalist at a museum is given a profile that lets them catalogue objects but explicitly **not** administer other users. They notice their displayed name is misspelled and they want to set a recognisable avatar and rotate their password after onboarding. They click their name in the top bar; the User admin panel opens showing their id / username / profile as read-only context, and editable fields for full name, password, email and a user image (with the standard upload tool enabled on the image). They fix the name, set a new password, upload a portrait, and close the panel — all without ever touching the Users section or seeing any other account.

Use it when: you want end users to self-manage their own account essentials from the header. Do not expect it to administer *other* users, to expose admin actions, or to dispatch any server action on this class — it is a front-end editor over the logged user's own Users-section record.

## How it works (server + client)

**Server.** `tools/tool_user_admin/` ships **no `server/` package** — confirmed: there is no `tools/tool_user_admin/server/` directory, so `dd_tools_api.tool_request` refuses any action named against it at dispatch gate 5 (`tool has no server module`). There is no `isAvailable`/`onRegister`/`onRemove` override.

The behaviour that would let a low-privilege user edit their own data regardless of their profile's general Users-section grant lives in core, not in the tool — and **this engine does not have it**. `getPermissions` (`src/core/security/permissions.ts`) resolves every permission check through the caller's profile grants; there is no `userId`-vs-`section_id` special case anywhere in its resolution order (confirmed by inspection), so it never forces a level for the Users section (`dd128`) when the target record happens to be the caller's own. Concretely: a user whose profile denies write on `dd128` is refused writing their own record through this tool — the panel opens and shows the fields, but the save is refused by the ordinary component save gate. This is a real, safety-relevant gap: confirm a user's profile actually grants at least write (level 2) on `dd128` before relying on `tool_user_admin`'s self-service edit.

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

| `apiActions` | Value |
| --- | --- |
| `tool_user_admin` | *(no server module)* — UI-only, nothing dispatchable on this tool in either engine |

There is therefore no `tool_request` envelope, no permission gate spec and no `backgroundRunnable` for this tool. Saves are issued by the rendered component instances through their normal save paths against the logged user's own `dd128` record; each is gated by the ordinary component permission checks, with no own-record carve-out (see the gap noted above). The client-side inputs the tool effectively works with are not request options but fixed globals it reads:

| Reads (client global) | Used for |
| --- | --- |
| `page_globals.user_id` | `section_id` of the target Users record (the logged user) |
| `page_globals.dedalo_data_lang` / `dedalo_data_nolan` | component / section language and no-language context |
| `page_globals.dedalo_entity`, `page_globals.username` | demo-account guard in `build()` |
| fixed `'dd128'` | target `section_tipo` (Users section) and the ddo_map parent/section tipos |

## How it is registered & surfaced

`tools/tool_user_admin/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). Essentials it carries:

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

## Related

- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions` (incl. the no-server-module UI-only case), gates and lifecycle this page builds on.
- [tool_indexation](tool_indexation.md), [tool_diffusion](tool_diffusion.md) — other UI-only tools with no server module (front-end orchestrators over existing component/section pipelines).
- [tool_export](tool_export.md) — contrast: a section tool with a real dispatchable action and a permission-gated declarative `apiActions` map; see [Exporting data](../../../core/exporting_data.md).
- Core glue (client): `core/menu/js/menu.js` (`open_tool_user_admin_handler`), `core/menu/js/view_default_edit_menu.js` (username link handler). Server-side permission resolution: `src/core/security/permissions.ts::getPermissions` — no own-record carve-out for `dd128` (see the gap above).
- Source: `tools/tool_user_admin/register.json` (no `server/` package), `tools/tool_user_admin/js/{tool_user_admin,render_tool_user_admin,index}.js`, `tools/tool_user_admin/css/tool_user_admin.less`.
