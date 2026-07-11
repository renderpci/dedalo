// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_input_text} from './view_default_list_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_ip_list_input_text} from './view_ip_list_input_text.js'



/**
* RENDER_LIST_COMPONENT_INPUT_TEXT
* Client-side list renderer for component_input_text.
*
* Mixin applied to a component_input_text instance: the `list` method is
* installed on the prototype and is called by the component lifecycle when
* `mode === 'list'` (including Time Machine mode, which reuses the list render).
*
* Dispatches to one of four view implementations depending on `context.view`:
*   - 'default' — full wrapper with one <span> per value item and dataframe support
*   - 'text'    — bare <span> with the joined value string, no chrome
*   - 'mini'    — minimal wrapper used by service autocomplete overlays
*   - 'ip'      — renders the IP string and asynchronously resolves a country-flag link
*
* The `fields_separator` guard in `list()` ensures a fallback separator is
* available even when the ontology model omits `records_separator`.
*
* @see view_default_list_input_text  — 'default' view implementation
* @see view_text_input_text          — 'text' view implementation
* @see view_mini_input_text          — 'mini' view implementation
* @see view_ip_list_input_text       — 'ip' view implementation
*/
export const render_list_component_input_text = function() {

	return true
}//end render_list_component_input_text



/**
* LIST
* Builds and returns the DOM node for this component in list (and tm) mode.
*
* Guards `context.fields_separator` so the view layer always has a safe
* separator string to use when joining multiple value items. Then selects
* the appropriate view renderer from `context.view` and delegates to it.
*
* Supported views: 'default' (fallback), 'text', 'mini', 'ip'.
* Unknown view values fall through to the 'default' renderer.
*
* @param {Object} options - render options passed through to the view renderer
* @returns {Promise<HTMLElement>} the rendered wrapper element
*/
render_list_component_input_text.prototype.list = async function(options) {

	const self = this

	// self.context.fields_separator
	// Guard: the server resolves records_separator from the ontology, but it
	// may be absent when the context is minimal (e.g. embedded portal widgets).
	// Default to ', ' so multiple value items are always separated visibly.
		if (!self.context.fields_separator) {
			self.context.fields_separator = ', '
		}

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'text':
			return view_text_input_text.render(self, options)

		case 'mini':
			return view_mini_input_text.render(self, options)

		case 'ip':
			return view_ip_list_input_text.render(self, options)

		case 'default':
		default:
			return view_default_list_input_text.render(self, options)
	}
}//end list



// @license-end
