// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_number} from './view_default_list_number.js'
	import {view_mini_number} from './view_mini_number.js'
	import {view_text_list_number} from './view_text_list_number.js'



/**
* RENDER_LIST_COMPONENT_NUMBER
* List-mode render dispatcher for component_number.
*
* This module is the client-side entry point for rendering a numeric component
* in read/list contexts. It acts as a thin dispatcher: it reads the requested
* view from context and delegates actual DOM construction to the matching
* view module. The constructor is a no-op placeholder used only to host
* prototype methods (standard Dédalo render-module pattern).
*
* Prototype method wired by component_number.js:
*   component_number.prototype.list = render_list_component_number.prototype.list
*   component_number.prototype.tm   = render_list_component_number.prototype.list
*   (the 'tm' alias means the same list render is reused for thesaurus-mode)
*
* Supported views (driven by context.view):
*   'default' — full list cell with click-to-edit-in-modal activation
*   'mini'    — compact autocomplete/datalist chip
*   'text'    — plain <span> with no interaction (portals, print, text export)
*/
export const render_list_component_number = function() {

	return true
}//end render_list_component_number



/**
* LIST
* Dispatch list-mode rendering to the appropriate view module.
*
* Ensures the fields_separator default (' | ') is set on context before
* delegating, so view modules can safely read self.context.fields_separator
* without their own null-guard.
*
* This method is aliased to both 'list' and 'tm' on component_number's
* prototype, meaning it handles both standard list cells and thesaurus-mode
* (tm) render calls with the same logic.
*
* @param {Object} options - Render options forwarded unchanged to the view module
* @returns {Promise<HTMLElement>} Resolves to the view's wrapper element
*/
render_list_component_number.prototype.list = async function(options) {

	const self = this

	// Guarantee fields_separator is defined before any view reads it.
	// Views join multiple entry values with this string when a component
	// holds more than one numeric datum (rare for numbers, but supported).
		if (!self.context.fields_separator) {
			self.context.fields_separator = ' | '
		}

	// Resolve the requested view from context; fall back to 'default'.
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			// Compact chip used by autocomplete / datalist services.
			return view_mini_number.render(self, options)

		case 'text':
			// Plain text output: no wrapper interaction, no dataframe glue.
			// Used for portals, print layouts, and plain-text exports.
			return view_text_list_number.render(self, options)

		case 'default':
		default:
			// Full list cell with click handler that opens edit-in-modal.
			return view_default_list_number.render(self, options)
	}
}//end list



// @license-end
