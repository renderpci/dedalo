// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_LIST_PASSWORD
* Default list-mode renderer for component_password.
*
* Password values MUST never be exposed in the UI — this view intentionally
* replaces any stored datum with a fixed mask string ('****************').
* It exists as a safe fallback for contexts that include a password component
* inside a list layout (e.g. a section configured to show all its components
* as columns). Without this view, such configurations would crash; with it,
* they render silently without leaking credentials.
*
* Dispatched by: render_list_component_password.prototype.list (view 'default').
* Other list views: view_mini_password (view 'mini'), view_text_list_password (view 'text').
*
* Exports: {Function} view_default_list_password constructor (no-op),
*          {Function} view_default_list_password.render static async renderer.
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_PASSWORD
* No-op constructor; all functionality lives on the static `render` method.
* The constructor pattern is consistent with every other view_* module in
* Dédalo so that renderers can be swapped in uniformly by render_list_*.
*/
export const view_default_list_password = function() {

	return true
}//end view_default_list_password



/**
* RENDER
* Builds and returns the wrapper DOM node for a password component rendered
* inside a list context (mode 'list', 'tm', or 'search').
*
* Security contract: the actual password stored in `self.data.entries` is
* intentionally NEVER used for display. A fixed mask string is passed to
* `build_wrapper_list` so the column renders without exposing credentials.
*
* Note: `value_string` (the joined entries) is computed but then discarded —
* the hard-coded mask is used instead. This is by design: password values
* must not appear in list views even when data is present.
*
* The `wrapper.type = 'password'` expando property signals to upstream
* consumers (e.g. export/print utilities) that this column holds credential
* data, allowing them to skip or redact it as needed.
*
* @param {Object} self - component_password instance providing `.data`,
*   `.context`, `.tipo`, `.section_tipo`, `.mode`, and `.view`.
* @param {Object} options - render options passed down from render_list_component_password.
* @returns {Promise<HTMLElement>} The constructed wrapper div with password-type marker.
*/
view_default_list_password.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		const value_string	= entries.join(' | ')

	// wrapper
	// (!) value_string (real data) is intentionally replaced with the mask below.
	// Never pass the real value_string here — password data must not reach the DOM.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : '****************'
		})
		wrapper.type = 'password'


	return wrapper
}//end render



// @license-end
