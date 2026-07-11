// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_USER_ADMIN — index.js
* Entry-point barrel for the tool_user_admin ES module.
*
* Re-exports every named export from tool_user_admin.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_user_admin') using a single, stable import path:
*
*   import {tool_user_admin} from '.../tool_user_admin/js/index.js'
*
* The tool lets a logged-in user change their own profile data — full name,
* password, e-mail address, and avatar — without requiring administrator
* intervention.  It always operates on the user's own record in section dd128
* (the Dédalo users section), identified at runtime via page_globals.user_id.
*
* Displayed components are partitioned by edit permission:
*   - Read-only (permissions: 1): section ID (dd330), username (dd132),
*     user profile/role (dd1725).
*   - Editable: full name (dd452), password (dd133), e-mail (dd134),
*     user image (dd522).
*
* A demo-mode guard in build() blocks any mutation attempt when
* page_globals.dedalo_entity is 'dedalo_demo' and the username is 'dedalo',
* preventing accidental corruption of the shared demo installation.
* The server-side security layer enforces the same restriction independently.
*
* Main exports (defined in tool_user_admin.js):
*   - tool_user_admin  — constructor + prototype chain for the tool instance
*
* Related modules in this directory:
*   - tool_user_admin.js         — constructor, prototype assignments (init, build,
*                                  get_component, get_ddo_map, build_user_section,
*                                  on_close_actions)
*   - render_tool_user_admin.js  — DOM/view rendering (edit view, get_content_data)
*
* @module tool_user_admin/index
*/


export * from './tool_user_admin.js'


// @license-end
