// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_filter} from './view_default_list_filter.js'
	import {view_mini_list_filter} from './view_mini_list_filter.js'
	import {view_text_list_filter} from './view_text_list_filter.js'
	import {view_collapse_list_filter} from './view_collapse_list_filter.js'


/**
* RENDER_LIST_COMPONENT_FILTER
* View-router for component_filter in list mode.
*
* This module is responsible solely for dispatching to the correct view
* implementation based on `self.context.view`. It is not a standalone class —
* its `list` prototype method is assigned to `component_filter.prototype.list`
* (and also to `component_filter.prototype.tm`) in component_filter.js.
*
* Supported views (resolved from `context.view`):
*   - 'default' — standard list wrapper built by ui.component.build_wrapper_list;
*                  clicking the wrapper activates edit mode via a modal dialog.
*   - 'mini'    — compact inline representation, entries joined with ' | ', used
*                  for autocomplete/datalist service rows.
*   - 'text'    — plain <span> wrapper without click handler; entries are joined
*                  with context.fields_separator, suitable for read-only layouts.
*   - 'collapse' — collapsible list wrapper; clicking toggles the 'collapsed' CSS
*                  class on the wrapper and propagates the toggle to sibling
*                  .view_collapse elements within the same section record row.
*
* The constructor is an empty stub so that standard Dédalo prototype-assignment
* patterns can attach `list` to component_filter without instantiation overhead.
*/
export const render_list_component_filter = function() {

	return true
}//end render_list_component_filter



/**
* LIST
* View-router: resolves the correct list-mode view and delegates rendering to it.
*
* Reads `self.context.view` (default: 'default') and dispatches to the matching
* view module's static `render(self, options)` method. Each view returns a
* Promise that resolves to an HTMLElement ready to be inserted into the DOM.
*
* Called as `component_filter.prototype.list` and also aliased as
* `component_filter.prototype.tm` (time-machine mode reuses the list renderer).
*
* @param {Object} options - Render options forwarded verbatim to each view's
*   render() function. Content varies by view; most views accept `render_level`.
* @returns {Promise<HTMLElement>} Resolves to the wrapper element built by the
*   selected view. Falls through to 'default' for any unrecognised view string.
*/
render_list_component_filter.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_filter.render(self, options)

		case 'text':
			return view_text_list_filter.render(self, options)

		case 'collapse':
			return view_collapse_list_filter.render(self, options)

		case 'default':
		default:
			return view_default_list_filter.render(self, options)
	}
}//end list



// @license-end
