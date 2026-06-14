// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_date} from './view_default_list_date.js'
	import {view_mini_date} from './view_mini_date.js'
	import {view_text_list_date} from './view_text_list_date.js'


/**
* RENDER_LIST_COMPONENT_DATE
* Client-side list renderer for component_date.
*
* Mixin applied to a component_date instance: the `list` method is
* installed on the prototype by component_date.js and is invoked by the
* component lifecycle whenever `mode === 'list'`. Time Machine mode (tm)
* also reuses this renderer via the same prototype assignment:
*   component_date.prototype.tm = render_list_component_date.prototype.list
*
* Dispatches to one of three view implementations depending on `context.view`:
*   - 'default' — full wrapper built by ui.component.build_wrapper_list, with
*                 a click-to-edit-modal handler and optional dataframe entries
*   - 'mini'    — compact wrapper for service overlays and autocomplete contexts
*   - 'text'    — bare <span> with the joined value string and no chrome,
*                 used by export/print pipelines that need plain text output
*
* The concrete date-string serialisation (dd_date → display string) is handled
* inside each view by `get_ar_raw_data_value` from render_edit_component_date.js,
* which applies the global `page_globals.dedalo_date_order` ('dmy' / 'ymd' / 'mdy')
* and `context.fields_separator` to produce the final display strings.
*
* @see view_default_list_date  — 'default' view implementation
* @see view_mini_date          — 'mini' view implementation
* @see view_text_list_date     — 'text' view implementation
*/
export const render_list_component_date = function() {

	return true
}//end render_list_component_date



/**
* LIST
* Builds and returns the DOM node for this component in list (and tm) mode.
*
* Reads `context.view` to select the appropriate view renderer and delegates
* entirely to that view's static `render(self, options)` method. Unknown view
* values fall through to the 'default' renderer.
*
* Supported views: 'default' (fallback), 'mini', 'text'.
*
* @param {Object} options - render options forwarded verbatim to the view renderer
* @returns {Promise<HTMLElement>} the rendered wrapper element
*/
render_list_component_date.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_date.render(self, options)

		case 'text':
			return view_text_list_date.render(self, options)

		case 'default':
		default:
			return view_default_list_date.render(self, options)
	}
}//end list



// @license-end
