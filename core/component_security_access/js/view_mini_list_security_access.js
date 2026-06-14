// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_LIST_SECURITY_ACCESS
* Compact read-only list renderer for component_security_access in 'mini' view mode.
*
* This module is a STUB. Full mini-list rendering for the permission grid is not yet
* implemented — `render` returns a <span> containing the placeholder text
* 'View mini unavailable' instead of a real access-level summary.
*
* Responsibilities (intended, once implemented):
*   - Produce a lightweight <span> wrapper (via ui.component.build_wrapper_mini) that
*     displays a condensed representation of the component's permission entries.
*   - Serve contexts that embed component values inline without interaction — for example
*     autocomplete suggestions, datalist popups, portal row previews, and table cells
*     where the full interactive radio-button grid would be too heavy.
*
* View routing:
*   render_list_component_security_access.prototype.list dispatches to this module when
*   self.context.view === 'mini'. The other list views are:
*     'default' → view_default_list_security_access (standard list cell; also a stub)
*     'text'    → view_text_list_security_access    (plain-text span; also a stub)
*   The interactive permission matrix is only available in edit mode
*   (view_default_edit_security_access.js).
*
* Data contract (for future implementation):
*   self.data.entries  — Array of access-entry objects prepared by the server; each has
*                        the shape { tipo, section_tipo, value } where value is an integer
*                        access level (0 = no access, 1+ = increasing permission levels).
*   self.filled_value  — Zero-padded version of entries built during component.build();
*                        covers every item in the datalist, not just those with non-zero values.
*   self.context.fields_separator — Delimiter for joining multiple display values.
*
* Exports:
*   view_mini_list_security_access — constructor stub; all logic is on the static render method.
*   view_mini_list_security_access.render — async render function called by the list dispatcher.
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_SECURITY_ACCESS
* Constructor stub. Never instantiated — exists only as a namespace for the static
* render method assigned below. The list dispatcher (render_list_component_security_access)
* calls view_mini_list_security_access.render(self, options) directly.
*/
export const view_mini_list_security_access = function() {

	return true
}//end view_mini_list_security_access



/**
* RENDER
* Builds and returns the mini wrapper node for component_security_access in list context.
*
* Current implementation is a STUB: instead of rendering the actual access-level entries
* (self.data.entries / self.filled_value), it injects the static placeholder string
* 'View mini unavailable' into the wrapper element. This mirrors the behaviour of the
* other stub list views (view_default_list_security_access, view_text_list_security_access).
*
* The commented-out line
*   // const value_string = data.value.join(self.context.fields_separator)
* shows the originally planned approach of joining flat entry values with the
* context separator — note that `data.value` does not exist on the current server
* response shape (the correct property is `data.entries`), so that line would have
* thrown at runtime.
*
* No interactive listeners are attached. For the interactive permission matrix,
* see view_default_edit_security_access.js.
*
* Called by:
*   render_list_component_security_access.prototype.list  (when context.view === 'mini')
*
* @param {Object} self - The component_security_access instance.
*   Must expose:
*     self.data         {Object} server data bag (data.entries, data.datalist, etc.)
*     self.model        {string} component model name, used by build_wrapper_mini for the CSS class
* @returns {Promise<HTMLElement>} wrapper - The rendered <span class="mini component_security_access_mini">
*   element, containing the placeholder text, ready to be inserted into the DOM.
*/
view_mini_list_security_access.render = async function(self) {

	// short vars
		const data = self.data

	// Value as string
		// (!) Stub placeholder — real rendering of data.entries is not yet implemented.
		// The original plan (data.value.join(...)) was also incorrect: the server shape
		// uses data.entries, not data.value.
		// const value_string = data.value.join(self.context.fields_separator)
		const value_string = 'View mini unavailable'

	// wrapper
		// ui.component.build_wrapper_mini creates a <span> with classes 'mini' and
		// 'component_security_access_mini', and inserts value_string via insertAdjacentHTML.
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end render



// @license-end
