// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_INFO
* Compact read-only renderer for component_info in 'mini' view mode.
*
* Responsibilities:
*   - Produce a lightweight <span> wrapper (via ui.component.build_wrapper_mini) that
*     displays the component's computed info entries as a single flat string.
*   - Serve contexts that need an inline, non-interactive preview of info values —
*     for example autocomplete suggestions, datalist popups, portal row previews,
*     and table cells where the full 'default' list or edit view would be too heavy.
*
* View routing:
*   render_list_component_info.prototype.list  dispatches here when context.view === 'mini'.
*   render_edit_component_info.prototype.edit  also dispatches here for the same view value.
*   Other list views:
*     'default' → view_default_list_info  (builds full widget tree via get_content_data)
*   Other edit views:
*     'line'    → view_line_edit_info     (edit wrapper with content_data)
*     'default' → view_default_edit_info  (full edit UI with widget instances)
*
* Data contract:
*   self.data.entries  — Array of pre-rendered strings delivered by the server; each
*                        element is one resolved display value from the info component's
*                        configured widgets.  May be null/undefined if the server omits
*                        it when there is nothing to display (falls back to []).
*   self.context.fields_separator — String separator used to join multiple entries
*                                   (e.g. ', ' or ' | ').  Comes from the ddo or
*                                   the ontology properties.fields_separator attribute.
*                                   (!) No default is applied before joining; if
*                                   fields_separator is null/undefined, Array.join()
*                                   will coerce it to the string "undefined" which
*                                   produces garbled output — same behaviour as the
*                                   analogous mini views in other components.
*
* Exports:
*   view_mini_info          — constructor (no-op stub; all logic is on the static render method)
*   view_mini_info.render   — the async render function called by the dispatcher
*/
export const view_mini_info = function() {

	return true
}//end view_mini_info



/**
* RENDER
* Builds and returns the mini wrapper node for a component_info in list or edit context.
*
* Joins all resolved entry strings in data.entries into a single delimited string and
* injects it as HTML into a <span class="mini component_info_mini"> element produced by
* ui.component.build_wrapper_mini.
*
* No widget instances are initialised and no interactive listeners are attached — this
* view is intentionally read-only.  For an interactive, widget-aware view use
* view_default_list_info (list) or view_default_edit_info (edit).
*
* Called by:
*   render_list_component_info.prototype.list  (when context.view === 'mini')
*   render_edit_component_info.prototype.edit  (when context.view === 'mini')
*
* @param {Object} self    - The component_info instance.
*                           Must expose:
*                             self.data.entries  {Array<string>|null} server-resolved display strings
*                             self.context.fields_separator {string|null} join delimiter
*                             self.model  {string} used by build_wrapper_mini for the CSS class suffix
* @param {Object} options - Reserved options object passed through from the dispatcher;
*                           not currently consumed by this view.
* @returns {Promise<HTMLElement>} wrapper - The rendered <span> element ready to be inserted into the DOM.
*/
view_mini_info.render = async function(self, options) {

	// short vars
		const data	= self.data.entries
		const value	= data || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		// (!) fields_separator has no fallback; a null/undefined value will produce the
		// literal string "undefined" as the join separator — consistent with sibling mini views.
		const value_string = value.join(self.context.fields_separator)

	// Set value
		// insertAdjacentHTML is used (rather than textContent) to preserve any HTML markup
		// that may be present in the server-resolved entry strings (e.g. <mark> highlight tags).
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
