// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_publication} from './view_default_list_publication.js'
	import {view_mini_list_publication} from './view_mini_list_publication.js'
	import {view_text_list_publication} from './view_text_list_publication.js'



/**
* RENDER_LIST_COMPONENT_PUBLICATION
* View-router for component_publication in list and time-machine (tm) modes.
*
* This module is a thin dispatch layer: it reads `self.context.view` and
* delegates DOM construction to the appropriate view module:
*
*   - 'default' → view_default_list_publication  (standard list row; clicking
*                  in edit mode transitions to 'line' edit view)
*   - 'mini'    → view_mini_list_publication      (compact pill for datalists /
*                  autocomplete dropdowns, joins entries with fields_separator)
*   - 'text'    → view_text_list_publication      (plain <span> for embedding in
*                  rich text or read-only contexts, joins entries with fields_separator)
*
* component_publication assigns this module's `list` prototype method to both
* `component_publication.prototype.list` and `component_publication.prototype.tm`,
* so time-machine diff rows reuse the same rendering path without duplication.
*
* The constructor is never called directly; it exists solely as a prototype
* carrier, following the Dédalo render-module pattern where the exported symbol
* is a no-op function and all real behaviour lives on its prototype.
*/
export const render_list_component_publication = function() {

	return true
}//end render_list_component_publication



/**
* LIST
* Entry point for rendering a component_publication instance in list (or tm) mode.
* Reads `self.context.view` (defaulting to 'default') to select the appropriate
* view renderer and delegates to it, forwarding the live component instance
* (`self`) and any caller-supplied `options`.
*
* Called by `common.prototype.render` via `component_publication.prototype.list`
* (and `prototype.tm`). The returned wrapper is appended to the section's list row
* by the calling render orchestrator.
*
* View selection:
*   - 'mini'    → compact representation joining `data.entries` with the context
*                  `fields_separator`; used in datalist / autocomplete contexts.
*   - 'text'    → minimal <span> wrapper; used when the value must be inlined in
*                  rich text or other read-only embedding scenarios.
*   - 'default' → full list row with a click handler that triggers a mode change
*                  to 'edit'/'line' when the component is not read-only.
*
* @param {Object} options - Caller options forwarded verbatim to the view renderer.
*   Contents vary by view; most views ignore this parameter in list mode.
* @returns {Promise<HTMLElement>} Resolves to the DOM wrapper built by the chosen view.
*/
render_list_component_publication.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_publication.render(self, options)

		case 'text':
			return view_text_list_publication.render(self, options)

		case 'default':
		default:
			return view_default_list_publication.render(self, options)
	}
}//end list



// @license-end
