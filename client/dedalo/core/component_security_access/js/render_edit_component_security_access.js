// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_security_access} from './view_default_edit_security_access.js'



/**
* RENDER_EDIT_COMPONENT_SECURITY_ACCESS
* Edit-mode render controller for the security_access component.
*
* This constructor acts as a namespace for the prototype methods that are mixed
* into `component_security_access` via prototype assignment in
* `component_security_access.js`. The constructor itself is never called with
* `new`; its sole purpose is to anchor the prototype chain so that methods such
* as `edit` can be assigned to `component_security_access.prototype.edit`.
*
* The actual HTML rendering is fully delegated to
* `view_default_edit_security_access.render()`. This file is responsible only
* for selecting the correct view variant and applying any pre-render mutations
* (e.g. forcing read-only permissions for the `print` view).
*/
export const render_edit_component_security_access = function() {

	return true
}//end render_edit_component_security_access



/**
* EDIT
* Render the component DOM node for edit-mode views.
*
* Dispatches to the appropriate view renderer based on `self.context.view`.
* Supported views: 'default', 'line', 'print'. Unknown views fall through to
* the default renderer.
*
* Print view note: the `print` case intentionally falls through (no `break`) to
* the `default` case so that `view_default_edit_security_access.render()` is
* still called. Before the fall-through, `self.permissions` is forced to `1`
* (read-only) so the renderer produces a non-interactive, read-only tree.
* The wrapper element will carry the class `view_print disabled_component` to
* allow CSS-level print overrides:
*   <div class="component_security_access dd774 dd234_dd774 edit view_print disabled_component">
*
* @param {Object} options - Render options forwarded to the view renderer
* @returns {Promise<HTMLElement>} wrapper - The assembled component wrapper node
*/
render_edit_component_security_access.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'print':
			// (!) Intentional fall-through: no `break` here.
			// Force read-only mode so the view renderer produces a non-interactive
			// permissions tree. The wrapper class 'view_print disabled_component'
			// is added by the renderer based on the view string, which allows
			// CSS to target the print context without extra logic here.
			self.permissions = 1

		case 'line':
		case 'default':
		default:
			return view_default_edit_security_access.render(self, options)
	}
}//end edit



// @license-end
