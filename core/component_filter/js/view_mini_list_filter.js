// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_FILTER
* Compact inline renderer for component_filter in 'mini' list-mode view.
*
* Activated when `context.view === 'mini'` is selected in
* render_list_component_filter. It is the most compact of the four list views
* (default / mini / text / collapse) and is intended for autocomplete
* suggestion rows, datalist service popups, and other space-constrained
* contexts where a flat, single-line representation is sufficient.
*
* Unlike the 'default' view this module does NOT attach a click handler — the
* wrapper is purely read-only. Unlike the 'text' view it uses
* `ui.component.build_wrapper_mini` (which produces a <span> carrying the
* 'mini' and '<model>_mini' CSS classes) rather than a bare <span> built
* directly from `ui.create_dom_element`.
*
* Data shape:
*   `self.data.entries` is an Array<string> of pre-resolved, human-readable
*   project-label strings supplied by the server in list/tm mode (see
*   component_filter_json.php → get_list_value()). The raw locator objects
*   ({id, section_id, section_tipo}) stored in edit mode are NOT present here.
*   Falls back to an empty array when entries is absent.
*
* Separator: entries are joined with ' | ' (space–pipe–space), producing a
* compact single line such as "Archaeology | Photography | Archive".
*
* Main exports:
*   - view_mini_list_filter        – view namespace / constructor stub
*   - view_mini_list_filter.render – async factory that returns the wrapper node
*/
export const view_mini_list_filter = function() {

	return true
}//end view_mini_list_filter



/**
* RENDER
* Build the compact inline wrapper node for component_filter in 'mini' view.
*
* Joins the server-resolved label strings from `data.entries` with ' | ' and
* inserts the result as HTML into a <span> element built by
* `ui.component.build_wrapper_mini`. The wrapper carries the CSS classes
* 'mini' and '<model>_mini' (e.g. 'component_filter_mini'), consistent with
* the convention used by all other mini-view modules.
*
* No click handler is attached; callers that need an interactive mini cell
* should use the 'default' view instead.
*
* (!) The caller in render_list_component_filter passes an `options` argument,
* but this function's signature only declares `self`. The extra argument is
* silently ignored by the JS runtime. This is not a bug to fix here — see flag.
*
* @param {Object} self - component_filter instance. Must expose:
*                        `self.data`  {Object}        containing
*                        `self.data.entries` {Array<string>}  pre-resolved
*                        project label strings for currently selected projects;
*                        may be absent (falls back to []).
*                        `self.model` {string}  component model name used for
*                        CSS class suffix inside build_wrapper_mini.
* @returns {Promise<HTMLElement>} The constructed <span> wrapper element,
*                                 ready for insertion into the DOM.
*/
view_mini_list_filter.render = async function(self) {

	// short vars
		const data		= self.data
		// data.entries holds pre-resolved display strings for selected projects;
		// fall back to an empty array when no projects are selected yet.
		const entries	= data.entries || []

	// wrapper
		// build_wrapper_mini creates a <span> with CSS classes 'mini' and
		// '<model>_mini'. Content is injected via insertAdjacentHTML below rather
		// than the options.value_string path so the call matches the existing code.
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		// Join with ' | ' for a compact, scannable single-line representation.
		const value_string = entries.join(' | ')

	// Set value
		// insertAdjacentHTML('afterbegin', …) prepends the text before any child
		// nodes that build_wrapper_mini may have added (currently none, but kept
		// future-safe).
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
