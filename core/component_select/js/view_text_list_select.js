// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_SELECT
* Plain-text read-only list renderer for component_select in 'text' view mode.
*
* Produces the lightest possible representation of a select component's
* resolved label: a bare <span> element whose innerHTML is the
* fields_separator-delimited join of the resolved entry strings. Unlike
* view_default_list_select it attaches no click handler and does not use
* the standard ui.component wrapper builder, making it suitable for embedding
* in print, export, or portal autocomplete-suggestion contexts where additional
* interactive behaviour would be unwanted.
*
* View routing:
*   render_list_component_select.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default' → view_default_list_select  (click-to-edit, standard wrapper)
*     'mini'    → view_mini_list_select     (compact span via ui.component.build_wrapper_mini)
*
* Data shape for 'text' view (from component_select_json.php in list/tm mode):
*   self.data.entries {Array<string>} — server-resolved human-readable labels
*   for the selected locator. At most one entry because component_select is
*   single-valued. An empty array means nothing is selected.
*
* Exports:
*   view_text_list_select        — constructor stub (no-op; all logic on the static render method)
*   view_text_list_select.render — async render function called by the list/tm dispatcher
*/
// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_SELECT
* Constructor stub — never instantiated directly.
* All rendering logic lives on the static `view_text_list_select.render` method.
* The constructor exists only so that the static method can be attached to the
* exported identifier, following the Dédalo view-module convention shared by
* view_mini_list_select, view_default_list_select, etc.
*/
export const view_text_list_select = function() {

	return true
}//end view_text_list_select



/**
* RENDER
* Build a plain <span> wrapper displaying the component_select's resolved label
* as a single delimited string.
*
* Called by render_list_component_select.list() when self.context.view === 'text',
* also forwarded from the tm (time-machine) rendering path via the same router.
* The dispatcher passes (self, options) but this function only declares `self`;
* the `options` argument is silently ignored because the text view has no
* view-specific options — JS does not error on extra arguments.
*
* The wrapper is built with ui.create_dom_element using inner_html (not
* textContent) so that any HTML markup already embedded in the resolved labels
* (e.g. <mark> highlight tags injected by the server-side search highlighter)
* is preserved. The commented-out document.createTextNode alternative would
* escape such markup and is intentionally left unused.
*
* CSS classes applied to the wrapper span:
*   'wrapper_component' — standard Dédalo component root marker
*   self.model          — component model name, e.g. 'component_select'
*   self.mode           — current render mode, e.g. 'list' or 'tm'
*   'view_<self.view>'  — current view variant, e.g. 'view_text'
*
* Data contract (from self):
*   self.data                     {Object}        Component data envelope from the API.
*   self.data.entries             {Array<string>} Server-resolved display labels for the
*                                 selected locator. The PHP layer resolves each stored
*                                 locator to its human-readable term before serialising
*                                 the response; no client-side re-resolution occurs here.
*                                 Empty array when nothing is selected.
*   self.context.fields_separator {string}        Delimiter placed between entries.
*                                 Defined server-side in the section_map 'fields_separator'
*                                 property for the relevant scope (e.g. ', ' or ' | ').
*
* (!) Unlike the sister module view_text_list_check_box, this function passes
*     self.context.fields_separator directly to Array.prototype.join without a
*     fallback. If the context property is absent (undefined), JS Array.join
*     silently falls back to its default comma separator (','), so no visible
*     breakage occurs, but the output will not honour the configured separator.
*
* @param {Object} self - The component_select instance. Must expose:
*   self.data.entries               {Array<string>}
*   self.context.fields_separator   {string}
*   self.model                      {string}
*   self.mode                       {string}
*   self.view                       {string}
* @returns {Promise<HTMLElement>} The constructed <span> element ready for DOM insertion.
*/
view_text_list_select.render = async function(self) {

	// Value as string
		const data		= self.data || {}
		const entries	= data.entries || []

		const value_string = entries.join(self.context.fields_separator)

	// const text_node = document.createTextNode(value_string)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
