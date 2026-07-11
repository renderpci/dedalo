// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_select} from './view_default_list_select.js'
	import {view_mini_list_select} from './view_mini_list_select.js'
	import {view_text_list_select} from './view_text_list_select.js'



/**
* RENDER_LIST_COMPONENT_SELECT
* View router for component_select in list and time-machine (tm) modes.
*
* Acts as the prototype host for the `list` method that is assigned to
* component_select.prototype.list and component_select.prototype.tm in
* component_select.js. The constructor itself is never instantiated; it is
* used purely so that the prototype method can be declared and later copied
* onto the component class.
*
* Supported views (resolved from self.context.view):
*   - 'mini'    → view_mini_list_select   (compact; used by autocomplete/datalist services)
*   - 'text'    → view_text_list_select   (plain text span; used in print/export contexts)
*   - 'default' → view_default_list_select (standard list cell with click-to-edit modal)
*/
export const render_list_component_select = function() {

	return true
}//end render_list_component_select



/**
* LIST
* Render the component_select cell for list (and tm) mode.
*
* Reads `self.context.view` to select the appropriate view module, then
* delegates rendering entirely to that module's static `render` function.
* Falls through to 'default' for any unrecognised view string.
*
* Called via component_select.prototype.list and component_select.prototype.tm
* (both point to this method — see component_select.js prototype assignments).
*
* @param {Object} options - Render options forwarded verbatim to the view module
* @returns {Promise<HTMLElement>} The wrapper element produced by the chosen view
*/
render_list_component_select.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_select.render(self, options)

		case 'text':
			return view_text_list_select.render(self, options)

		case 'default':
		default:
			return view_default_list_select.render(self, options)
	}
}//end list



// @license-end
