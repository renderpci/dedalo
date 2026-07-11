// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_FILTER_RECORDS
* Static render namespace for the 'mini' list view of component_filter_records.
*
* Called by render_list_component_filter_records.prototype.list when
* self.context.view === 'mini'. Produces a compact inline <span> that
* serialises the per-section access-control entries as JSON strings separated
* by the ontology-configured fields_separator, giving list grids a short,
* machine-readable summary of the user's record-filter configuration.
*
* This module follows the Dédalo static-view pattern: the exported symbol is a
* no-op constructor whose only purpose is to serve as a namespace; all real
* logic lives on the static `.render` method assigned below.
*
* Main export: view_mini_list_filter_records (namespace + static .render)
*/
export const view_mini_list_filter_records = function() {

	return true
}//end view_mini_list_filter_records



/**
* RENDER
* Build the mini-list DOM node for a component_filter_records instance.
*
* Serialises each entry in self.data.entries to a JSON string and joins them
* with the separator defined in self.context.fields_separator. The resulting
* string is injected as HTML into a <span> wrapper built by
* ui.component.build_wrapper_mini, which adds the 'mini' and
* '<model>_mini' CSS classes.
*
* Note: unlike view_default_list_filter_records, the value_string is NOT
* passed through the ui helper's options; it is inserted directly via
* insertAdjacentHTML after the wrapper is created. This means ui sanitisation
* of value_string (if any) is bypassed — entries are raw JSON from
* self.data, which is server-authoritative.
*
* @param {Object} self - Component instance (component_filter_records).
*   self.data.entries  {Array<{id: number|null, tipo: string, value: Array<number>}>}
*     Per-section access lists. Each item holds a section tipo and the
*     section_id integers the user may access.
*   self.context.fields_separator {string}
*     Ontology-configured separator string injected between serialised entries
*     (e.g. ' | '). Comes from the server context object; never undefined
*     when the server response is well-formed.
* @param {Object} options - Reserved for future use; currently unused.
* @returns {Promise<HTMLElement>} Resolves with the constructed <span> wrapper.
*/
view_mini_list_filter_records.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// const value_flat	= entries.flat()
		const string_values = entries.map(el => {
			return JSON.stringify(el)
		})
		const value_string = string_values.join(self.context.fields_separator)

	// wrapper
		// Build the <span> with classes 'mini' and '<model>_mini'. value_string is
		// NOT passed in options here (unlike the default list view), so the ui helper
		// creates an empty wrapper; content is appended below.
		const wrapper = ui.component.build_wrapper_mini(self)

	// Value as string
		// const value_string = value.join(' | ')

	// Set value
		// Inject the serialised entries directly into the wrapper. Because entries
		// come from the trusted server data layer, no client-side escaping is applied.
		wrapper.insertAdjacentHTML('afterbegin', value_string)


	return wrapper
}//end render



// @license-end
