// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_INPUT_TEXT
* Headless text view for component_input_text — produces a plain <span> containing
* the component's current value as a string.
*
* This view is used by service consumers that need a lightweight DOM node without
* any interactive chrome (no edit handles, no save buttons, no dataframe columns).
* Typical callers: autocomplete datalists, export-preview widgets, and any context
* that needs a fast text representation of the component value.
*
* The view applies the standard multi-language fallback strategy via get_fallback_value:
* entries in the current language are used directly; missing-language slots are replaced
* with the corresponding fallback_value item wrapped in <mark> so callers can style
* untranslated content.  Multiple entries are joined with the separator defined in
* self.context.fields_separator (set by the PHP server from the component's
* records_separator property; defaults to ' | ' when absent from context).
*
* Exports: view_text_input_text (constructor), view_text_input_text.render (static method)
*/
export const view_text_input_text = function() {

	return true
}//end view_text_input_text



/**
* RENDER
* Builds and returns a plain <span> node containing the component's text value.
*
* Applies the get_fallback_value strategy across all entries: for each positional
* slot, the primary-language value is used when present; otherwise the fallback
* value for that slot (if any) is inserted wrapped in <mark> tags so untranslated
* content is visually distinguishable from translated content.
* All resolved values are then joined with self.context.fields_separator before
* being injected as innerHTML of the wrapper span.
*
* Data contract (self.data shape):
*   entries        {Array}  - array of item objects ({ value: string, lang: string })
*                             for the active language; may contain null slots when a
*                             language has no translation for that positional entry.
*   fallback_value {Array}  - parallel array of item objects from the fallback language;
*                             used to fill null slots in entries (same positional index).
*
* The returned node is intentionally stateless and has no event listeners attached;
* it can safely be inserted into any container or discarded.
*
* @param {Object} self    - component instance; must expose self.data, self.context,
*                           self.model, self.mode, and self.view
* @param {Object} options - reserved for future use; currently unused by this view
* @returns {HTMLElement} a <span> node ready for DOM insertion
*/
view_text_input_text.render = async function(self, options) {

	// short vars
		const data				= self.data
		const entries			= data.entries || []
		const fallback_value	= data.fallback_value || []
		// resolve per-slot values: primary language entries take precedence;
		// missing slots fall back to the fallback_value item wrapped in <mark>
		const fallback			= get_fallback_value(entries, fallback_value)
		// join all resolved slot strings into a single display string using the
		// separator configured in the component's ontology properties (e.g. ' | ')
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper. Set as span
	// CSS class encodes model/mode/view so host layouts can target this node
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
