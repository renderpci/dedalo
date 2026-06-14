// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_mini_list_radio_button} from './view_mini_list_radio_button.js'
	import {view_default_list_radio_button} from './view_default_list_radio_button.js'
	import {view_text_list_radio_button} from './view_text_list_radio_button.js'



/**
* RENDER_LIST_COMPONENT_RADIO_BUTTON
* View-router for component_radio_button in list and time-machine (tm) modes.
*
* This module acts as a thin dispatch layer: it inspects `self.context.view`
* and delegates actual DOM construction to the matching view module:
*
*   - 'default' → view_default_list_radio_button  (standard list row with click-to-edit)
*   - 'mini'    → view_mini_list_radio_button      (compact autocomplete / datalist pill)
*   - 'text'    → view_text_list_radio_button      (plain <span> for embedding in rich text)
*
* component_radio_button assigns this module's `list` prototype method to both
* `component_radio_button.prototype.list` and `component_radio_button.prototype.tm`,
* so time-machine rows reuse the same rendering path.
*
* The constructor itself is never called directly; it exists only to act as a
* prototype carrier (following the Dédalo render-module pattern where the export
* is a no-op function and real behaviour lives on its prototype).
*/
export const render_list_component_radio_button = function() {

	return true
}//end render_list_component_radio_button



/**
* LIST
* Entry point for rendering a component_radio_button instance in list (or tm) mode.
* Reads `self.context.view` to select the appropriate view renderer and delegates
* to it, passing the live component instance (`self`) and any caller-supplied
* `options`.
*
* Called by `common.prototype.render` via `component_radio_button.prototype.list`
* (and `prototype.tm`). The returned wrapper is appended to the section's list row.
*
* @param {Object} options - Caller options forwarded verbatim to the view renderer.
*   Contents vary by view; most views ignore this parameter in list mode.
* @returns {Promise<HTMLElement>} Resolves to the DOM wrapper built by the chosen view.
*/
render_list_component_radio_button.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_radio_button.render(self, options)

		case 'text':
			return view_text_list_radio_button.render(self, options)

		case 'default':
		default:
			return view_default_list_radio_button.render(self, options)
	}
}//end list



// @license-end
