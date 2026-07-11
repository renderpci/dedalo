// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_DEFAULT_LIST_FILTER_RECORDS
* Read-only list ("default" sub-view) for component_filter_records in list mode.
*
* This module renders the per-record access-control data as a compact, non-interactive
* text string inside a standard Dédalo list wrapper. It is the sibling of
* view_mini_list_filter_records (compact) and view_text_list_filter_records (plain text),
* and is selected by render_list_component_filter_records when context.view is 'default'
* or absent.
*
* Context and data consumed from the component instance (`self`):
*   self.data.entries  {Array<{id:number|null, tipo:string, value:number[]}>}
*     Each entry maps a section tipo (e.g. 'oh1') to the list of section_id integers
*     the user is allowed to access. Provided by the server; the client does not
*     re-resolve section labels in this view.
*   self.context.fields_separator {string}
*     Separator string inserted between serialised entries (e.g. ' | ').
*     Defined in the ontology component properties.
*
* Rendering strategy:
*   Each entry is JSON-serialised via JSON.stringify so the user can see the raw
*   {id, tipo, value} shape without ambiguity. The resulting strings are joined by
*   fields_separator and handed to ui.component.build_wrapper_list, which wraps them
*   in a standard <span> child inside the list wrapper <div>.
*
* This view is intentionally read-only: no click handler activates edit mode.
* The commented-out click listener below (original code) was an early prototype
* that would have promoted the component to 'edit'/'line' mode inline — it was
* disabled before shipping and should not be re-enabled here without a corresponding
* change in render_edit_component_filter_records.
*
* Exported symbol: view_default_list_filter_records
*   .render(self, options) → Promise<HTMLElement>
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_FILTER_RECORDS
* Constructor stub required by the Dédalo view module convention.
* All behaviour is attached as a static method on the function object itself.
* Returns true so that callers can detect a live module object.
*/
export const view_default_list_filter_records = function() {

	return true
}//end view_default_list_filter_records



/**
* RENDER
* Build the read-only list wrapper node for component_filter_records (default sub-view).
*
* Serialises every entry in self.data.entries to a JSON string, joins them with
* the ontology-defined fields_separator, and delegates final DOM construction to
* ui.component.build_wrapper_list. The builder creates a <div> with the standard
* component CSS classes (wrapper_component, model, tipo, section_tipo_tipo, 'list',
* view_default) and inserts the joined string inside a <span> child when non-empty.
*
* Note on the serialisation choice: entries are objects ({id, tipo, value}), not
* flat scalars, so JSON.stringify is used to produce an unambiguous human-readable
* representation without requiring a datalist lookup on the client side.
*
* The commented-out click listener was an early prototype for inline mode switching;
* it was intentionally disabled before the initial release and must NOT be restored
* here without coordinating with the edit-view module.
*
* @param {Object} self - The component_filter_records instance.
*   Must expose self.data (entries array) and self.context (view, fields_separator).
* @param {Object} options - Reserved for future use; not currently consumed.
* @returns {Promise<HTMLElement>} The constructed list wrapper element.
*/
view_default_list_filter_records.render = async function(self, options) {


	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		// const value_flat	= entries.flat()
		// Serialise each entry object to a JSON string so the user sees the full
		// {id, tipo, value} shape rather than a lossy toString() representation.
		const string_values = entries.map(el => {
			return JSON.stringify(el)
		})
		// Join all serialised entries with the ontology-configured separator (e.g. ' | ').
		const value_string = string_values.join(self.context.fields_separator)

	// wrapper
		// build_wrapper_list produces a <div> with standard CSS classes and appends
		// a <span> containing value_string when it is non-empty.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		// wrapper.addEventListener('click', function(e){
		// 	e.stopPropagation()

		// 	self.change_mode({
		// 		mode : 'edit',
		// 		view : 'line'
		// 	})
		// })


	return wrapper
}//end render



// @license-end
