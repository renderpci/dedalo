// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_CHECK_BOX
* Plain-text read-only list renderer for component_check_box in 'text' view mode.
*
* This module produces the lightest possible representation of a checkbox component's
* selected values: a bare <span> element whose innerHTML is the join of the resolved
* label strings. Unlike view_default_list_check_box it attaches no click handler
* and does not use the standard ui.component wrapper builder, making it suitable for
* embedding inside rich-text contexts (e.g. inside a formatted report cell or a
* portal auto-complete suggestion) where additional CSS classes or interactive
* behaviour from the heavier wrappers would be disruptive.
*
* View routing:
*   render_list_component_check_box.list() dispatches here when
*   self.context.view === 'text'. The other list views are:
*     'default' → view_default_list_check_box  (click-to-edit, standard wrapper)
*     'mini'    → view_mini_list_check_box     (compact span via ui.component.build_wrapper_mini)
*
* Exports:
*   view_text_list_check_box        — constructor stub (no-op; all logic on the static render method)
*   view_text_list_check_box.render — the async render function called by the list dispatcher
*/
export const view_text_list_check_box = function() {

	return true
}//end view_text_list_check_box



/**
* RENDER
* Build a plain <span> wrapper displaying the component's selected checkbox values
* as a single delimited string.
*
* The wrapper element is created via ui.create_dom_element with element_type 'span'
* so that any HTML markup already present in the resolved label strings (e.g. <mark>
* highlight tags from a search query) is preserved through innerHTML assignment rather
* than being escaped as text content. The commented-out document.createTextNode
* alternative below would escape such markup and is intentionally left unused.
*
* CSS classes applied to the wrapper:
*   'wrapper_component' — standard Dédalo component wrapper marker
*   self.model          — component model identifier (e.g. 'component_check_box')
*   self.mode           — current render mode (e.g. 'list')
*   'view_<self.view>'  — current view variant (e.g. 'view_text')
*
* Data contract (from self):
*   self.data.entries               {Array<string>} Resolved display labels for the currently
*                                   selected options. The server resolves each stored locator
*                                   to its human-readable term in the active language before
*                                   sending the response; the client does not re-resolve here.
*                                   An empty array is the valid state when nothing is selected.
*   self.context.fields_separator   {string} Delimiter inserted between labels
*                                   (e.g. ', ' or ' | '). Falls back to ', ' when absent or
*                                   falsy. This fallback differs from view_mini_list_check_box
*                                   which passes the separator directly and may produce the
*                                   literal string "undefined" if the context property is missing.
*
* Note: the dispatcher (render_list_component_check_box.list) calls this function
* as render(self, options), but options is not declared in the signature and is
* silently ignored. This is not a bug — the 'text' view has no need for the options
* object, and JS does not error on surplus arguments.
*
* @param {Object} self - The component_check_box instance.
*   Must expose:
*     self.data.entries               {Array<string>}
*     self.context.fields_separator   {string}
*     self.model                      {string}
*     self.mode                       {string}
*     self.view                       {string}
* @returns {Promise<HTMLElement>} The constructed <span> element ready for DOM insertion.
*/
view_text_list_check_box.render = async function(self) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// fields_separator
		const fields_separator = self.context.fields_separator || ', '

	// Value as string
		const value_string = entries.join( fields_separator )

		// const text_node = document.createTextNode(value_string)

	// wrapper. Set as span to preserve html tags like mark, etc.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
