// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_TEXT_LIST_SECURITY_ACCESS
* Plain-text view stub for component_security_access in list / print / export contexts.
*
* This module is one of three list-mode view variants dispatched by
* render_list_component_security_access.prototype.list:
*   - view_default_list_security_access  — standard list-cell wrapper
*   - view_mini_list_security_access     — compact autocomplete / datalist wrapper
*   - view_text_list_security_access     — (this file) bare <span> for text/print contexts
*
* The security-access permission matrix is a complex tree-structured dataset
* (ontology nodes with radio-button values 0–3). A plain-text reduction of this
* matrix is not yet implemented, so `render` returns a fixed placeholder string
* inside a minimal <span> element rather than a human-readable summary.
*
* When full text rendering is eventually added, `render` should iterate
* `self.filled_value` (the zero-padded live permission map built during
* `component_security_access.prototype.build`) and produce a compact summary
* suitable for inclusion in print layouts or text-only export formats.
*
* Invoked via:
*   render_list_component_security_access → list() → case 'text'
*
* @module view_text_list_security_access
* @see render_list_component_security_access  View router that selects this module.
* @see view_default_list_security_access      Parallel default list view.
* @see component_security_access.prototype.build  Where self.filled_value is assembled.
*/

// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_SECURITY_ACCESS
* Namespace constructor. Never instantiated; exists only as a static-method host.
* All functionality is exposed through `view_text_list_security_access.render`.
* @returns {boolean} true
*/
export const view_text_list_security_access = function() {

	return true
}//end view_text_list_security_access



/**
* RENDER
* Build a minimal <span> wrapper representing the component_security_access value
* in text / print mode.
*
* The permission matrix stored in `self.filled_value` is not yet serialised to a
* human-readable string; a static placeholder is used instead.  The wrapper is
* typed as a <span> (rather than the <div> used by the default list view) to allow
* safe embedding inside inline text contexts such as print templates or export rows.
*
* CSS classes applied to the wrapper follow the shared Dédalo convention:
*   `wrapper_component <model> <mode> view_<view>`
* allowing generic component stylesheets to control layout without view-specific rules.
*
* (!) This render function is a stub — `value_string` is hardcoded.
*     No data from `self.data.entries` or `self.filled_value` is rendered yet.
*
* @param {Object} self    - The component_security_access instance providing
*                           `self.model`, `self.mode`, and `self.view` for CSS classes.
* @param {Object} options - Forwarded render options (currently unused by this stub).
* @returns {Promise<HTMLElement>} A <span> element carrying the placeholder text.
*/
view_text_list_security_access.render = async function(self, options) {

	// Value as string
	// (!) Placeholder only — full text serialisation of self.filled_value not yet implemented.
		const value_string = 'View text unavailable'

	// wrapper. Set as span
	// A <span> is used (not <div>) to allow safe inline embedding in print/export layouts.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
