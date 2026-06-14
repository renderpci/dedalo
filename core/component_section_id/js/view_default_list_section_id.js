// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_SECTION_ID
* Namespace object carrying the static render method for the default list view
* of component_section_id.
*
* This is the standard list-cell renderer used when context.view is 'default' (or
* absent/unrecognised). It wraps the raw section id value in a list wrapper element
* produced by ui.component.build_wrapper_list, which applies ontology-defined CSS
* classes and an optional value <span> child.
*
* Called from render_list_component_section_id.prototype.list (the shared list/tm
* dispatch switch) and never instantiated directly — the constructor returns true
* solely to satisfy the export pattern used across all view_* modules.
*/
export const view_default_list_section_id = function() {

	return true
}//end view_default_list_section_id



/**
* RENDER
* Builds the DOM wrapper for a component_section_id cell in list (and tm) mode.
*
* The section id is stored in self.data.entries as a single-element array. Each
* entry is either a plain scalar (the id integer/string) or an object with a
* 'value' property — the object form is used when the datum has been enriched (e.g.
* by a dataframe pairing). Either shape is normalised here to a plain string so
* that build_wrapper_list can insert it as a <span> text node.
*
* The returned wrapper element carries the ontology CSS classes applied by
* ui.component.build_wrapper_list and, when value_string is truthy, a child <span>
* holding the id text.
*
* @param {Object} self - The component_section_id instance. Must expose:
*   self.data.entries {Array} — one-element array holding the id (scalar or object).
*   All other properties (tipo, section_tipo, model, context, …) are read by
*   ui.component.build_wrapper_list for class assignment.
* @param {Object} options - Render options forwarded from the list dispatcher;
*   not consumed by this view but accepted for API parity with other view modules.
* @returns {HTMLElement} The constructed list-wrapper div, ready for DOM insertion.
*/
view_default_list_section_id.render = function(self, options) {

	// Value as string
	// entries[0] is normally an integer (the section_id), but enriched data shapes
	// wrap it in an object {value: <id>, ...}. Both cases are collapsed to a string.
		const entries		= self.data.entries || []
		const value_string	= (entries[0] && typeof entries[0]==='object') ? entries[0].value : entries[0]

	// wrapper
	// build_wrapper_list applies ontology CSS classes to the div and, when
	// value_string is truthy, appends a <span> child with the raw text.
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})

	return wrapper
}//end render



// @license-end
