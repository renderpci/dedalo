// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_PASSWORD
* Bare-text list view for component_password.
*
* Provides the 'text' view variant used when component_password is rendered in
* a plain-text context (e.g. embedded inside an autocomplete suggestion row or
* any list that requests a minimal, chrome-free representation).
*
* Unlike the 'default' and 'mini' variants (which use ui.component helper
* wrappers), this view produces a plain <span> with no additional DOM chrome.
*
* Security contract: the real stored password value is NEVER rendered.
* The obfuscation placeholder '****************' is written unconditionally so
* that stored credentials cannot be read from the DOM under any circumstance.
*
* This module is instantiated and dispatched by render_list_component_password
* when context.view === 'text'. It is not used directly by callers.
*
* @see render_list_component_password — dispatcher that selects this view
* @see view_default_list_password    — 'default' view (uses build_wrapper_list)
* @see view_mini_password            — 'mini' view (uses build_wrapper_mini)
*/
export const view_text_list_password = function() {

	return true
}//end view_text_list_password



/**
* RENDER
* Builds and returns a plain <span> element representing the password field
* in a text list context.
*
* Intended for embedded/text-only containers (e.g. autocomplete datalists) where
* neither the full wrapper chrome of the 'default' view nor the compact wrapper
* of the 'mini' view is appropriate. The element is given the standard
* `wrapper_component` CSS classes for consistent component identification.
*
* (!) The actual password value is NEVER used here. The fixed placeholder string
* '****************' is always rendered regardless of `self.data`, ensuring that
* stored credentials remain hidden in every list-rendering context.
*
* Note: `options` is accepted for API parity with other view renderers but is
* not used by this implementation.
*
* @param {Object} self - component_password instance supplying model/mode/view
* @param {Object} options - render options (unused; accepted for API parity)
* @returns {Promise<HTMLElement>} resolved <span> element with obfuscated content
*/
view_text_list_password.render = async function(self, options) {

	// Value as string
		const value_string = '****************'

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
