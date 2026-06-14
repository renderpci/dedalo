// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_COLLAPSE_LIST_FILTER
* Collapsible list-mode view for component_filter.
*
* Activated when `context.view === 'collapse'` is selected in
* render_list_component_filter.js.  Renders the component_filter's resolved
* label entries as a summary string inside a standard list wrapper that starts
* in a collapsed (truncated) state and expands on click.
*
* Clicking the wrapper also propagates the expand/collapse toggle to every other
* `.view_collapse` element in the same section-record row so that all collapsible
* components in the row open and close in unison.
*
* Display format differs by host-section type:
*   - Activity section (dd542): entries are joined with '<br>' (one per line).
*   - All other sections:       entries are joined with ' | ' (pipe-separated).
*
* `data.entries` is an Array of pre-resolved display strings — one string per
* selected filter value, already formatted for HTML display by the server.
*
* The `.view_collapse` CSS class is added automatically by `build_wrapper_list`
* (it appends `view_` + the context view name); the `.collapsed` class is then
* managed by this module's click handler.  Both classes are styled in
* core/component_filter/css/component_filter.less.
*
* Main exports:
*   - view_collapse_list_filter        – view namespace / constructor stub
*   - view_collapse_list_filter.render – async factory that returns the wrapper node
*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_COLLAPSE_LIST_FILTER
* Namespace and constructor stub for the collapse list view of component_filter.
* This function is never called directly; it exists so that static methods
* (render) can be attached to it using the `view_collapse_list_filter.render`
* assignment pattern used throughout Dédalo views.
* @returns {boolean} Always returns true (stub; not used).
*/
export const view_collapse_list_filter = function() {

	return true
}//end view_collapse_list_filter



/**
* RENDER
* Render node for use in current view
*
* Builds a standard list-mode wrapper (via `ui.component.build_wrapper_list`),
* immediately marks it `.collapsed`, and attaches a click handler that:
*   1. Stops event propagation so the enclosing section-record click handler
*      does not interfere.
*   2. Toggles `.collapsed` on the clicked wrapper itself (expanding/collapsing it).
*   3. Propagates the same toggle to every other `.view_collapse` sibling element
*      found at `wrapper.parentNode.parentNode` (the section-record row), so all
*      collapsible components in the row expand/collapse together.
*
* The wrapper receives the CSS class `view_collapse` from `build_wrapper_list`
* (derived from `context.view === 'collapse'`), plus `.collapsed` added here.
* The stylesheet at core/component_filter/css/component_filter.less clips the
* height when `.collapsed` is present and uses cursor hints to signal the state.
*
* Data shape: `self.data.entries` is an Array<string> of pre-resolved label
* strings for all currently selected filter values.  Entries are joined into a
* single HTML string using '<br>' for the Activity log section (dd542) or ' | '
* for all other sections.  Falls back to an empty array when `entries` is absent.
*
* @param {Object} self    - component_filter instance.  Must expose:
*                           `self.data` {Object} with `entries` {Array<string>},
*                           `self.section_tipo` {string} (ontology tipo of the host section),
*                           `self.context` {Object} (context data including view, css, mode).
* @param {Object} options - Reserved; not used by this view.
* @returns {Promise<HTMLElement>} wrapper - The constructed, event-bound DOM node.
*/
view_collapse_list_filter.render = async function(self, options) {

	// short vars
		const data			= self.data
		const entries		= data.entries || []
		// Activity log (dd542) uses line-break separation; all other sections
		// use pipe-separation for a compact, scannable single line.
		const value_string	= (self.section_tipo==='dd542')
			? entries.join('<br>') // activity case
			: entries.join(' | ')

	// wrapper
		// build_wrapper_list adds the `view_collapse` CSS class automatically
		// (it appends 'view_' + context.view, which evaluates to 'view_collapse').
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		// Start the cell in the collapsed (clipped) state; the click handler toggles this.
		wrapper.classList.add('collapsed')
		wrapper.addEventListener('click', function(e) {
			e.stopPropagation()
			wrapper.classList.toggle('collapsed')

			// propagate to siblings
			// Walk up two levels to reach the section-record row, then find all
			// other .view_collapse elements in that row and keep them in sync.
			// Using a pre-cached length avoids repeated DOM lookups in the loop.
				const section_record = wrapper.parentNode.parentNode
				const elements_collapsed = section_record.querySelectorAll('.view_collapse')
				const elements_collapsed_length = elements_collapsed.length
				for (let i = 0; i < elements_collapsed_length; i++) {
					const item = elements_collapsed[i]
					// Skip the originating wrapper — it was already toggled above.
					if (item!==wrapper) {
						item.classList.toggle('collapsed')
					}
				}
		})


	return wrapper
}//end render



// @license-end
