// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_value_string
	}
	from './view_default_list_json.js'



/**
* VIEW_TEXT_JSON
* Bare-text view renderer for component_json in list / time-machine modes.
*
* Unlike view_default_list_json (which builds a full list-row wrapper with a
* click-to-edit modal) or view_mini_json (which uses ui.component.build_wrapper_mini),
* this view produces a minimal <span> element containing only the string
* representation of the JSON value. It is intended for embedding inside
* rich-text content, read-only labels, or any context where extra chrome
* (borders, icons, edit affordances) would be intrusive.
*
* Dispatched by render_list_component_json.prototype.list when
* self.context.view === 'text'.
*
* The constructor is never instantiated; following the Dédalo view-module
* pattern, the export is a no-op carrier and all behaviour lives on the
* static render method.
*
* @exports view_text_json
*/
export const view_text_json = function() {

	return true
}//end view_text_json



/**
* RENDER
* Build a bare <span> DOM node containing the text representation of the
* component_json value, for use in read-only or inline embedding contexts.
*
* The human-readable string is derived by get_value_string (imported from
* view_default_list_json), which reads the first entry's configured
* `list_show_key` property or falls back to a truncated JSON.stringify of
* the whole value when that key is absent.
*
* The wrapper span receives three CSS classes to allow targeted styling:
*   - 'wrapper_component'   – shared Dédalo component wrapper marker
*   - self.model            – e.g. 'component_json'
*   - self.mode             – e.g. 'list' or 'tm'
*   - view_{self.view}      – e.g. 'view_text' (resolved from context.view)
*
* No click handlers, labels, or edit affordances are added; this is
* intentionally a display-only node.
*
* @param {Object} self - Live component_json instance providing .model,
*   .mode, .view, .data, and .context.properties
* @param {Object} options - Reserved; not currently consumed by this view
* @returns {Promise<HTMLElement>} Resolves to the <span> wrapper node
*/
view_text_json.render = async function(self, options) {

	// value_string
		const value_string = get_value_string(self)

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
