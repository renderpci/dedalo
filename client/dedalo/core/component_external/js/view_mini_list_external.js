// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {append_entries, append_source_status} from './external_render.js'



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
* @see external_render                     — the shared entry / status rules
* @see ui.component.build_wrapper_mini     — wrapper factory (adds CSS classes
*      `mini` and `<model>_mini`; its `value_string` option is deliberately NOT
*      used here, because that option is injected with `insertAdjacentHTML`)
*/
export const view_mini_list_external = function() {

	return true
}//end view_mini_list_external



/**
* RENDER
* Builds the DOM node for component_external in 'mini' view mode.
*
* Reads `self.data.entries` (an array of strings resolved server-side from
* the configured `api_config` + `fields_map`) and appends one node per entry,
* separated by ' | ' text nodes, followed by the degradation marker.
*
* Contract notes:
* - `self.data` may be absent; `entries` defaults to `[]`, yielding an empty
*   wrapper (no error thrown).
* - (!) CHANGED 2026-08-06 — the value used to be joined and injected with
*   `insertAdjacentHTML`, on the reasoning that "external-API values may contain
*   HTML entities … callers should ensure the server sanitises". The server did
*   not, so a remote service's markup ran in the curator's session. Entries now
*   render as text unless the server marked them 'markup' (external_render.js
*   rule 1). This view is the one that appears inside autocomplete overlays,
*   i.e. it renders values from a remote SEARCH — the least trusted of all.
* - The status marker is appended here too (rule 2): a mini chip that silently
*   shows nothing is how a curator picks a record believing it has no title.
*
* @param {Object} self - component_external instance in list / tm mode;
*   must have `self.data.entries` (array of resolved display strings) and
*   properties consumed by `ui.component.build_wrapper_mini` (`self.model`, etc.)
* @returns {Promise<HTMLElement>} the populated mini <span> wrapper element
*/
view_mini_list_external.render = async function(self) {

	// short vars
		const data = self.data || {}

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self)

	// value + status
		append_entries(wrapper, data)
		append_source_status(wrapper, data, {compact:true})


	return wrapper
}//end render



// @license-end
