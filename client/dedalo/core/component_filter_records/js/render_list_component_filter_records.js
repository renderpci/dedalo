// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_filter_records} from './view_default_list_filter_records.js'
	import {view_mini_list_filter_records} from './view_mini_list_filter_records.js'
	import {view_text_list_filter_records} from './view_text_list_filter_records.js'



/**
* RENDER_LIST_COMPONENT_FILTER_RECORDS
* Client-side list renderer for component_filter_records.
*
* This constructor is used exclusively as a prototype mixin source: its `list`
* method is copied onto `component_filter_records.prototype` (and aliased as
* `prototype.tm` for Time Machine mode). It is never instantiated directly.
*
* component_filter_records stores filter criteria for associated records as
* an `entries` array inside `data`. Each entry holds a section tipo and the
* set of integer record IDs that pass the filter. In list mode those entries
* are serialised to JSON strings and joined with `context.fields_separator`
* before being handed to the view layer.
*
* Dispatches to one of three view implementations depending on `context.view`:
*   - 'default' — standard list wrapper built by ui.component.build_wrapper_list,
*                 with the serialised entries string as the visible value
*   - 'mini'    — compact wrapper built by ui.component.build_wrapper_mini,
*                 entries injected via insertAdjacentHTML
*   - 'text'    — bare <span> whose entries are flattened one level and joined
*                 with newlines, producing a plain-text rendering
*
* @see view_default_list_filter_records — 'default' view implementation
* @see view_mini_list_filter_records    — 'mini' view implementation
* @see view_text_list_filter_records    — 'text' view implementation
*/
export const render_list_component_filter_records = function() {

	return true
}//end render_list_component_filter_records



/**
* LIST
* Builds and returns the DOM node for this component in list (and tm) mode.
*
* Reads `context.view` to select the appropriate view renderer. When the
* context provides no view, 'default' is used as the fallback. The switch
* falls through to the 'default' case for any unknown view identifier.
*
* The method delegates all DOM construction to the chosen view module; this
* function's only responsibility is view dispatch.
*
* Note: the `return null` after the switch is unreachable in practice because
* every branch of the switch either returns or falls through to the default
* case — but it acts as an explicit sentinel value for any future view added
* to the switch without a return statement.
*
* @param {Object} options - render options passed through unchanged to the view renderer
* @returns {Promise<HTMLElement|null>} the rendered wrapper element, or null if no view matched
*/
render_list_component_filter_records.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_filter_records.render(self, options)

		case 'text':
			return view_text_list_filter_records.render(self, options)

		case 'default':
		default:
			return view_default_list_filter_records.render(self, options)
	}

	return null
}//end list



// @license-end
