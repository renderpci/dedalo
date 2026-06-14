// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_SECURITY_ACCESS
* Default list-mode view stub for the component_security_access component.
*
* This module provides the 'default' view branch that render_list_component_security_access
* dispatches to when self.context.view is 'default' (or unrecognised). Because the
* security-access permission grid is a complex interactive structure, a full read-only
* list rendering is intentionally deferred; the current implementation returns a
* placeholder wrapper. The authoritative interactive view lives in
* view_default_edit_security_access.js.
*
* Registered in render_list_component_security_access.js and consumed via
* component_security_access.prototype.list and .tm (time-machine).
*
* Data shape (self.data):
*   {
*     entries   : Array<{tipo: string, section_tipo: string, value: number}>,
*     datalist  : Array<{tipo: string, section_tipo: string, parent: string,
*                         label: string, model: string, ar_parent: string[]}>,
*     changes_files : string[]   // filenames of historical schema-change snapshots
*   }
*
* self.filled_value (built by component_security_access.prototype.build) is a zero-padded
* version of entries that covers every datalist node (items absent from entries get value 0).
*/



/**
* VIEW_DEFAULT_LIST_SECURITY_ACCESS
* Constructor stub. Assigned as a static-method host; never instantiated.
*/
export const view_default_list_security_access = function() {

	return true
}//end view_default_list_security_access



/**
* RENDER
* Build a list-mode wrapper node for component_security_access.
*
* The security-access permission grid is too complex to render meaningfully in a
* compact list cell, so this view intentionally returns a placeholder. The full
* interactive grid is only available in edit mode (view_default_edit_security_access).
*
* The `data.entries` array is extracted but not currently used in the placeholder
* path. The commented-out JSON.stringify call below shows the original intent to
* display raw values — left in place as a future reference.
*
* @param {Object} self    - component_security_access instance; must expose .data
* @param {Object} options - Render options forwarded by render_list_component_security_access
* @returns {Promise<HTMLElement>} Wrapper element produced by ui.component.build_wrapper_list
*/
view_default_list_security_access.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.entries || []

	// Value as string
		// const value_string = JSON.stringify(value, null, 2)
		const value_string = 'View list unavailable'

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
