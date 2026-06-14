// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_LIST_PUBLICATION
* Compact read-only representation of a component_publication value for use in
* datalist dropdowns and autocomplete widgets.
*
* This module is one of three list-mode view renderers for component_publication
* (alongside view_default_list_publication and view_text_list_publication). It is
* selected when `self.context.view === 'mini'` by the render_list_component_publication
* router, which also wires it to the time-machine (tm) prototype slot.
*
* The rendered output is a bare <span> carrying only the resolved publication-state
* label (e.g., "Published") with no interactive controls or click handlers. This
* keeps the DOM surface minimal for contexts where the full list row would be too heavy.
*
* Exported symbols:
*   view_mini_list_publication        — namespace constructor (never instantiated)
*   view_mini_list_publication.render — static async render function
*
* @see render_list_component_publication (./render_list_component_publication.js)
* @see ui.component.build_wrapper_mini  (../../common/js/ui.js)
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_PUBLICATION
* Namespace constructor. Never instantiated directly; all logic lives on the
* static `render` method assigned below. The constructor returns `true` to
* satisfy module-pattern conventions used throughout Dédalo view modules.
*/
export const view_mini_list_publication = function() {

	return true
}//end view_mini_list_publication



/**
* RENDER
* Builds the compact mini wrapper for a component_publication instance in list
* (or time-machine) mode.
*
* In list/tm mode the server resolves `data.entries` to an array of human-readable
* label strings (e.g., `["Published"]`) rather than raw locator objects. This
* render function joins those strings with `context.fields_separator` and injects
* the result into a lightweight <span> built by `ui.component.build_wrapper_mini`.
*
* The resulting <span> receives CSS classes `'mini'` and `'<model>_mini'`
* (e.g., `'component_publication_mini'`) so that per-component mini-view styling
* can be applied without additional selectors.
*
* No click handler is attached — the mini view is intentionally read-only and
* the parent context (datalist row, autocomplete item, etc.) owns interaction.
*
* Data shape expected on `self.data` at call time (list/tm mode, server-resolved):
*   { entries: string[] }   — at most one element for publication components
*                             (empty array when the publication state is unset)
*
* @param {Object} self    - Live component_publication instance. Must expose:
*   @param {Object} self.data                        - Component data object.
*   @param {string[]} [self.data.entries=[]]         - Resolved label strings.
*   @param {Object} self.context                     - Component context object.
*   @param {string} [self.context.fields_separator]  - Glue string for joining
*     multiple entries (e.g., ' | '). Comes from the request config; a
*     publication component typically has at most one entry, so the separator
*     is only relevant when the data is unexpectedly multi-valued.
*   @param {string} self.model                       - Used by build_wrapper_mini
*     to set the `<model>_mini` CSS class.
* @param {Object} options - Caller-supplied render options (currently unused by
*   this view but forwarded for API consistency with other view renderers).
* @returns {Promise<HTMLElement>} Resolves to the constructed <span> wrapper node.
*/
view_mini_list_publication.render = async function(self, options) {

	// short vars
		const data			= self.data
		const entries		= data.entries || []
		const value_string	= entries.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
