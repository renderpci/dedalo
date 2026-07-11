// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_EXTERNAL
* Compact 'mini' view renderer for component_external in list / tm mode.
*
* Produces a minimal <span> wrapper — via `ui.component.build_wrapper_mini` —
* that carries the joined display value of all resolved external-API entries.
* This view is selected by `render_list_component_external.prototype.list` when
* `context.view === 'mini'`, typically when the component appears inside a
* service-autocomplete overlay or a compact datalist where interactive chrome
* would be intrusive.
*
* Unlike the 'default' list view this renderer does NOT attach a click handler
* to switch the component into edit mode. The wrapper is intentionally
* interaction-free so the host UI (autocomplete, portal cell, etc.) can
* control pointer events without interference.
*
* @see render_list_component_external  — dispatcher that selects this view
* @see view_default_list_component_external — interactive 'default' list view
* @see view_text_list_component_external   — bare-span 'text' / 'line' view
* @see ui.component.build_wrapper_mini     — wrapper factory (adds CSS classes
*      `mini` and `<model>_mini`; does not pre-fill `value_string` unless
*      passed in options — this renderer injects the value itself via
*      `insertAdjacentHTML` after the wrapper is created)
*/
export const view_mini_list_external = function() {

	return true
}//end view_mini_list_external



/**
* RENDER
* Builds the DOM node for component_external in 'mini' view mode.
*
* Reads `self.data.entries` (an array of strings resolved server-side from
* the configured `api_config` + `fields_map`), joins them with ' | ', and
* injects the resulting string as HTML into the mini wrapper element.
*
* Contract notes:
* - `self.data` is expected to exist; `entries` defaults to `[]` when absent,
*   yielding an empty wrapper (no error thrown).
* - The wrapper is built via `ui.component.build_wrapper_mini(self)` WITHOUT
*   passing `value_string` in the options object. The value is injected
*   afterwards via `insertAdjacentHTML('afterbegin', …)`. This differs from
*   `view_default_list_component_external`, which passes `value_string` to the
*   builder directly; the two approaches produce the same visual result.
* - Because external-API values may contain HTML entities emitted by the remote
*   service, `insertAdjacentHTML` is used (rather than `textContent`) to
*   preserve them. Callers should ensure the server sanitises the resolved
*   entries before returning them in `data.entries`.
*
* @param {Object} self - component_external instance in list / tm mode;
*   must have `self.data.entries` (array of resolved display strings) and
*   properties consumed by `ui.component.build_wrapper_mini` (`self.model`, etc.)
* @returns {Promise<HTMLElement>} the populated mini <span> wrapper element
*/
view_mini_list_external.render = async function(self) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		const value_string = entries.join(' | ')

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
