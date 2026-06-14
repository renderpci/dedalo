// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_CHECK_BOX
* Compact read-only list renderer for component_check_box in 'mini' view mode.
*
* Responsibilities:
*   - Produce a lightweight <span> wrapper (via ui.component.build_wrapper_mini) that
*     displays the component's selected checkbox labels as a single flat string.
*   - Serve contexts that embed component values inline without interaction — for example
*     autocomplete suggestions, datalist popups, portal row previews, and table cells
*     where the full 'default' list view (with click-to-edit) would be too heavy.
*
* View routing:
*   render_list_component_check_box.list() dispatches to this module when
*   self.context.view === 'mini'.  The other list views are:
*     'default' → view_default_list_check_box  (adds click-to-edit handler)
*     'text'    → view_text_list_check_box     (uses a plain <span>, not the ui wrapper)
*
* Data contract:
*   self.data.entries  — Array of resolved label strings already prepared by the server;
*                        each element is a human-readable label for one selected option.
*   self.context.fields_separator — String delimiter used to join multiple labels
*                                   (e.g. ', ' or ' | ').
*                                   (!) No fallback default is applied here; unlike
*                                   view_text_list_check_box which falls back to ', ',
*                                   this view passes self.context.fields_separator directly
*                                   to Array.join — an undefined separator will coerce to
*                                   the string "undefined" in the joined result.
*
* Exports:
*   view_mini_list_check_box — constructor (no-op stub; all logic is on the static render method)
*   view_mini_list_check_box.render — the async render function called by the list dispatcher
*/
export const view_mini_list_check_box = function() {

	return true
}//end view_mini_list_check_box



/**
* RENDER
* Builds and returns the mini wrapper node for a component_check_box in list context.
*
* Joins all resolved label strings in data.entries into a single delimited string and
* injects it as innerHTML into a <span class="mini component_check_box_mini"> element
* produced by ui.component.build_wrapper_mini.
*
* No interactive listeners are attached — this view is intentionally read-only.
* For a clickable list view that allows in-place editing, use view_default_list_check_box.
*
* Called by:
*   render_list_component_check_box.prototype.list  (when context.view === 'mini')
*
* @param {Object} self    - The component_check_box instance.
*                           Must expose:
*                             self.data.entries  {Array<string>} resolved label strings
*                             self.context.fields_separator {string} join delimiter
*                             self.model  {string} used by build_wrapper_mini for CSS class
* @param {Object} options - Reserved options object passed through from the list dispatcher;
*                           not currently consumed by this view.
* @returns {HTMLElement} wrapper - The rendered <span> element ready to be inserted into the DOM.
*/
view_mini_list_check_box.render = async function(self, options) {


	// Options vars
		const data		= self.data
		const entries	= data.entries || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		// (!) self.context.fields_separator has no fallback here; if undefined, join()
		// will produce the literal string "undefined" as the separator between labels.
		const value_string = entries.join(self.context.fields_separator)

	// Set value
		// insertAdjacentHTML is used (rather than textContent) to preserve any HTML
		// markup that may be present in the resolved label strings (e.g. <mark> tags).
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
