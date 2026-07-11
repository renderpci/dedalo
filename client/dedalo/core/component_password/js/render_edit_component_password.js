// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_password} from './view_default_edit_password.js'
	import {view_mini_password} from './view_mini_password.js'



/**
* RENDER_EDIT_COMPONENT_PASSWORD
* Edit-mode render mixin for component_password.
*
* This module is NOT a standalone class. It is a prototype-assignment vehicle:
* component_password.prototype.edit is wired to
* render_edit_component_password.prototype.edit (see component_password.js).
* The constructor itself is a no-op placeholder that enables the standard
* Dédalo prototype-assignment pattern.
*
* Exports (named):
*   render_edit_component_password — constructor (prototype carrier only)
*
* View routing handled by the edit method:
*   'mini'    — compact representation; used by autocomplete service dropdowns
*   'print'   — forces read-only (permissions=1) then falls through to 'default'
*   'line'    — same layout as 'default' but renders without a label row
*   'default' — full wrapper with label, buttons, and password input (or masked
*               read-only display when permissions===1)
*
* Security note: the component never exposes the stored Argon2id hash or the
* legacy AES blob to the client. All edit views render a fixed placeholder
* ('****************') as the initial input value; the actual saved credential
* is NEVER returned in context/data to the browser. A real change is signalled
* only when the user types into the input field (see view_default_edit_password).
*
* Global references (declared in host pages; resolved at runtime):
*   get_label, page_globals, SHOW_DEBUG, flatpickr — declared in the
*   /*global*\/ directive above but none of these are used directly in this
*   module. They are listed for eslint compatibility with the host environment.
*/
export const render_edit_component_password = function() {

	return true
}//end render_edit_component_password



/**
* EDIT
* Render node for use in modes: edit, edit_in_list.
*
* Dispatches to the appropriate view renderer based on self.context.view.
*
* View routing:
*   'mini'    — compact <span>; delegates to view_mini_password.render
*   'print'   — forces permissions to 1 (read-only) then falls through to
*               'default'. The 'disabled_component' CSS class on the resulting
*               wrapper identifies print-mode nodes in stylesheets.
*   'line'    — same renderer as 'default' (view_default_edit_password) but
*               the absence of a label row is handled inside view_default by
*               checking self.context.view === 'line'.
*   'default' — full wrapper: label, empty buttons container, password input
*               (or masked static text when permissions===1).
*
* (!) The 'print' case intentionally falls through to 'default' (no break or
*     return after setting self.permissions = 1). This mutation is side-effectful
*     on the component instance for the duration of the render call; it causes
*     view_default_edit_password to render a read-only masked div instead of a
*     live <input type="password">.
*
* (!) The semicolon after `self.permissions = 1` differs from the convention used
*     in sibling components (e.g. render_edit_component_input_text uses no
*     semicolon). This is a pre-existing style inconsistency; do not change.
*
* @param {Object} options - Render options forwarded verbatim to the selected view renderer
* @returns {Promise<HTMLElement>} Resolved component wrapper node
*/
render_edit_component_password.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_password.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1;

		case 'line':
		case 'default':
		default:
			return view_default_edit_password.render(self, options)
	}
}//end edit



// @license-end
