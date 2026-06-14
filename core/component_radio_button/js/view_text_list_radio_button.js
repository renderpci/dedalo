// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_RADIO_BUTTON
* Plain-text read-only list renderer for component_radio_button in 'text' view mode.
*
* Produces the lightest possible representation of a radio-button component's
* currently selected value: a bare <span> whose innerHTML is the join of the
* resolved label strings from data.entries.  No click handler is attached and the
* heavier ui.component.build_wrapper_list/build_wrapper_mini builders are
* intentionally bypassed, making this view suitable for embedding inside rich-text
* contexts (e.g. a formatted report cell, a portal autocomplete suggestion, or any
* place where the full default-list chrome would be disruptive).
*
* View routing:
*   render_list_component_radio_button.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default' → view_default_list_radio_button  (click-to-edit, standard wrapper)
*     'mini'    → view_mini_list_radio_button      (compact span via ui.component.build_wrapper_mini)
*
* Component_radio_button stores at most one entry at a time (radio semantics), so
* data.entries will normally contain zero or one element; the join with
* fields_separator is therefore a no-op in practice but keeps the rendering
* contract consistent with the analogous component_check_box 'text' view.
*
* Exports:
*   view_text_list_radio_button        — constructor stub (no-op; all logic is on the
*                                        static render method)
*   view_text_list_radio_button.render — async render function called by the list dispatcher
*/
export const view_text_list_radio_button = function() {

	return true
}//end view_text_list_radio_button



/**
* RENDER
* Build a plain <span> wrapper displaying the component's selected radio-button value
* as a delimited string of resolved labels.
*
* The wrapper is created via ui.create_dom_element with element_type 'span' so that
* any HTML markup already present in the resolved label strings (e.g. <mark> highlight
* tags injected by the search subsystem) is preserved through innerHTML assignment
* rather than escaped as plain text.
*
* CSS classes applied to the wrapper:
*   'wrapper_component' — standard Dédalo component wrapper marker
*   self.model          — component model identifier ('component_radio_button')
*   self.mode           — current render mode (e.g. 'list', 'tm')
*   'view_<self.view>'  — current view variant (e.g. 'view_text')
*
* Data contract (from self):
*   self.data.entries             {Array<string>} Server-resolved display labels for the
*                                 currently selected option.  The server resolves each stored
*                                 locator ({section_id, section_tipo}) to its human-readable
*                                 term in the active language before sending the response;
*                                 the client does not re-resolve here.  An empty array is the
*                                 valid no-selection state.
*   self.context.fields_separator {string} Delimiter used when joining multiple entries
*                                 (e.g. ', ' or ' | ').  Comes from the ontology-defined
*                                 context properties.
*
* (!) self.context.fields_separator has no fallback here: if the property is undefined,
*     Array.prototype.join() will receive undefined and will fall back to the default ','
*     separator, producing a different delimiter than configured.  The analogous
*     view_text_list_check_box.render() guards against this with `|| ', '`; this file
*     does not.  If separator fidelity matters for the radio_button 'text' view, a
*     guard should be added (doc-only flag — do not change the code here).
*
* Note: the dispatcher calls this as render(self, options) but the options argument
* is not declared in the function signature and is silently ignored.  The 'text' view
* has no need for caller options; JS does not error on surplus arguments.
*
* @param {Object} self - The component_radio_button instance.
*   Must expose:
*     self.data.entries             {Array<string>}
*     self.context.fields_separator {string}
*     self.model                    {string}
*     self.mode                     {string}
*     self.view                     {string}
* @param {Object} [options] - Caller options passed by the list dispatcher; not used by this view.
* @returns {Promise<HTMLElement>} The constructed <span> element ready for DOM insertion.
*/
view_text_list_radio_button.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		const value_string	= entries.join(self.context.fields_separator)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
