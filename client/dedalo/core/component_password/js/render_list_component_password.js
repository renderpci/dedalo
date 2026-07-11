// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_password} from './view_default_list_password.js'
	import {view_mini_password} from './view_mini_password.js'
	import {view_text_list_password} from './view_text_list_password.js'



/**
* RENDER_LIST_COMPONENT_PASSWORD
* Client-side list renderer for component_password.
*
* This constructor function's prototype method `list` is mixed into the
* component_password prototype (see component_password.js), making it the
* entry point for all read-only render contexts:
*   - mode === 'list'   → component_password.prototype.list
*   - mode === 'tm'     → component_password.prototype.tm  (Time Machine; reuses list)
*   - mode === 'search' → component_password.prototype.search (reuses list)
*
* Passwords are NEVER shown in plain text in any list view. Every view
* implementation unconditionally renders the obfuscation string '****************'
* regardless of the actual stored value, ensuring stored credentials are not
* leaked into list or search result DOM.
*
* Supported views (resolved from `context.view`):
*   - 'default' — full wrapper element via ui.component.build_wrapper_list()
*   - 'mini'    — compact wrapper used by autocomplete service overlays
*   - 'text'    — bare <span> element, no chrome; intended for embedded/text contexts
*
* @see view_default_list_password — 'default' view implementation
* @see view_mini_password         — 'mini' view implementation
* @see view_text_list_password    — 'text' view implementation
* @see component_password         — prototype assignments that install `list` as `tm`/`search`
*/
export const render_list_component_password = function() {

	return true
}//end render_list_component_password



/**
* LIST
* Builds and returns the DOM node for this component in list, tm, and search modes.
*
* Reads `context.view` (set by the server-side context layer) to select the
* appropriate view renderer. Falls through to 'default' for any unrecognised
* view value. The chosen renderer is responsible for producing the wrapper
* element with the obfuscated placeholder string in place of the real value.
*
* All three renderers set `wrapper.type = 'password'` on the returned node so
* that container code can identify the component type at the DOM level.
*
* @param {Object} options - render options forwarded unchanged to the view renderer
* @returns {Promise<HTMLElement>} the rendered wrapper element with obfuscated content
*/
render_list_component_password.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_password.render(self, options)

		case 'text':
			return view_text_list_password.render(self, options)

		case 'default':
		default:
			return view_default_list_password.render(self, options)
	}
}//end list



// @license-end
