// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_security_access} from './view_default_list_security_access.js'
	import {view_mini_list_security_access} from './view_mini_list_security_access.js'
	import {view_text_list_security_access} from './view_text_list_security_access.js'



/**
* RENDER_LIST_COMPONENT_SECURITY_ACCESS
* View router for component_security_access in list and time-machine (tm) modes.
*
* Acts as the prototype host for the `list` method that is assigned to both
* component_security_access.prototype.list and component_security_access.prototype.tm
* in component_security_access.js. The constructor itself is never instantiated; it
* exists purely so that the prototype method can be declared and later copied onto
* the component class via prototype assignment.
*
* component_security_access stores per-item access levels in self.data.entries as an
* array of objects keyed by tipo + section_tipo, and augments that dataset during
* build() into self.filled_value (zero-padded to cover every datalist entry). List
* views receive this already-resolved instance and render a compact read-only
* representation appropriate for their context.
*
* Supported views (resolved from self.context.view at render time):
*   - 'mini'    → view_mini_list_security_access   (compact; used by autocomplete / datalist services)
*   - 'text'    → view_text_list_security_access   (plain text span; used in print / export contexts)
*   - 'default' → view_default_list_security_access (standard list cell)
*
* Note: as of this writing all three view implementations return a placeholder
* string ('View list unavailable', 'View mini unavailable', 'View text unavailable')
* rather than a fully rendered permission grid. Full list rendering is handled by
* the edit view (view_default_edit_security_access.js) which contains the interactive
* radio-button matrix.
*/
export const render_list_component_security_access = function() {

	return true
}//end render_list_component_security_access



/**
* LIST
* Render the component_security_access cell for list (and tm) mode.
*
* Reads `self.context.view` (supplied by the server context layer) to select the
* appropriate view module, then delegates rendering entirely to that module's
* static `render` function. Falls through to 'default' for any unrecognised view
* string, ensuring the component degrades gracefully when a new view is configured
* server-side but not yet handled here.
*
* Called via component_security_access.prototype.list and
* component_security_access.prototype.tm — both prototype slots point to this
* method (see component_security_access.js).
*
* @param {Object} options - Render options forwarded verbatim to the chosen view module
* @returns {Promise<HTMLElement>} The wrapper element produced by the chosen view renderer
*/
render_list_component_security_access.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_security_access.render(self, options)

		case 'text':
			return view_text_list_security_access.render(self, options)

		case 'default':
		default:
			return view_default_list_security_access.render(self, options)
	}
}//end list



// @license-end
