// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_MINI_SECTION_ID
* Compact ("mini") view for component_section_id used in autocomplete suggestions
* and datalist chips.
*
* This module is one of three list-mode views for component_section_id:
*   - view_default_list_section_id — standard list-cell wrapper (full width)
*   - view_text_section_id         — inline <span> with raw text (no wrapper chrome)
*   - view_mini_section_id (this)  — compact chip via ui.component.build_wrapper_mini
*
* The 'mini' view is selected when context.view === 'mini' in
* render_list_component_section_id.prototype.list, which is shared by both
* component_section_id.prototype.list and component_section_id.prototype.tm.
*
* Typical use-case: a datalist dropdown shows each matching record as a small chip
* containing only the section id value (e.g. "42"), with no label or toolbar chrome.
*
* Exports:
*   view_mini_section_id          – hollow constructor (no instance state needed)
*   view_mini_section_id.render() – static factory that produces the chip element
*/

// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_SECTION_ID
* Hollow constructor — all logic is on the static render() method.
* No instance state is needed; the view is stateless and re-entered per render call.
* @returns {boolean} Always true (Dédalo stub convention for view constructors).
*/
export const view_mini_section_id = function() {

	return true
}//end view_mini_section_id



/**
* RENDER
* Produce a compact chip element displaying the section id for use in autocomplete
* suggestion lists or any datalist drop-down.
*
* Data shape: `self.data.entries` is expected to be an Array whose first element is
* either a plain integer/string (the section id) or an object `{ value, ... }` when
* the server has pre-formatted the entry (e.g. as part of a search result set).
* The object branch extracts `entries[0].value`; the scalar branch uses the entry
* directly. A missing or empty entries array resolves to `undefined`, which
* ui.component.build_wrapper_mini silently ignores (no text is inserted).
*
* Output: delegates to `ui.component.build_wrapper_mini`, which builds a <span>
* with CSS classes `mini` and `component_section_id_mini`, then inserts the
* value_string via insertAdjacentHTML. The caller is responsible for appending the
* returned node to the DOM.
*
* @param {Object} self    - The component_section_id instance being rendered.
*   @param {Object}        self.data          - Component datum object.
*   @param {Array}         self.data.entries  - Single-element array holding the id value
*                                               or an entry object; may be empty or absent.
*   @param {string}        self.model         - Component model name used for the CSS class
*                                               suffix on the wrapper (e.g. 'component_section_id').
* @param {Object} options - Render options (currently unused; reserved for forward-compatibility).
* @returns {HTMLElement} A <span> chip element containing the formatted section id string.
*/
view_mini_section_id.render = function(self, options) {

	// short vars
		const data = self.data

	// Value as string
		// entries[0] may be a plain scalar (the raw section id integer) or an object
		// with a .value property when the API has already formatted the entry.
		const entries		= data.entries || []
		const value_string	= (entries[0] && typeof entries[0]==='object') ? entries[0].value : entries[0]

	// wrapper
		// build_wrapper_mini produces a <span class="mini component_section_id_mini">
		// and inserts value_string via insertAdjacentHTML when it is truthy.
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end render




// @license-end
