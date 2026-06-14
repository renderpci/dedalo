// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {get_fallback_value} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_TEXT_LIST_TEXT_AREA
* Inline 'text' view for component_text_area in list and time-machine modes.
*
* This is the 'text' case in render_list_component_text_area.prototype.list.
* It renders the rich-text field value as a bare <span> with innerHTML, making
* it suitable for embedding inside another component's rendered output (e.g. a
* portal that concatenates several field values into one string). Unlike the
* 'default' list view, it does NOT attach a click-to-edit handler or dataframe
* label nodes — it is strictly a read-only display fragment.
*
* Key decisions:
*  - <span> (not <div>) is used so that inline HTML markup contained in the
*    stored value (images inserted with add_tag_img_on_the_fly, <strong>, <em>)
*    remains valid inside block or inline containers alike.
*  - The server already calls add_tag_img_on_the_fly when building the entries
*    array, so no client-side image-tag transformation is needed here.
*  - Multi-entry values are joined with self.context.fields_separator, which is
*    resolved from the ontology choose/show configuration by the request-config
*    layer before this view is called.
*
* Data flow:
*   self.data.entries        — Array of per-language entry objects ({value: string})
*                              or null slots when the current language has no value.
*   self.data.fallback_value — Parallel array used when an entry slot is null;
*                              get_fallback_value() wraps fallback strings in <mark>.
*   get_fallback_value()     — Merges entries + fallback_value into an array of
*                              display strings (resolved strings, ready for innerHTML).
*   self.context.fields_separator — Delimiter used to join multiple entry strings
*                                   into a single display value.
*
* Exports: {view_text_list_text_area}
*/



/**
* VIEW_TEXT_LIST_TEXT_AREA
* Constructor function — no-op pattern used across Dédalo view modules.
* All rendering state lives on the component_text_area instance (self)
* passed into the static render method; this constructor is never instantiated.
* @returns {boolean} Always true
*/
export const view_text_list_text_area = function() {

	return true
}//end view_text_list_text_area



/**
* RENDER
* Builds the inline 'text' DOM node for a component_text_area instance.
*
* Returns a <span> whose innerHTML is set to the fully resolved display string.
* The span's class list encodes the component model, mode, and view so that CSS
* rules targeting `.wrapper_component` can apply shared layout styles.
*
* The value is already HTML-safe for direct insertion: the server resolves all
* ontology media references (add_tag_img_on_the_fly) before sending the data.
* Any null entry slots are substituted with the corresponding fallback_value
* string wrapped in <mark> by get_fallback_value(), making fallback content
* visually distinguishable from primary content.
*
* This method does not attach event listeners and does not call
* attach_item_dataframe — callers that need dataframe labels or click-to-edit
* behaviour should use view_default_list_text_area instead.
*
* @param {Object} self    - component_text_area instance; must expose:
*                            .data.entries        {Array}  per-entry value objects or null
*                            .data.fallback_value {Array}  parallel fallback strings
*                            .context.fields_separator {string} entry join delimiter
*                            .model {string}  component model name (CSS class)
*                            .mode  {string}  render mode, e.g. 'list' or 'tm'
*                            .view  {string}  view name, 'text' in this module
* @param {Object} options - Render options forwarded from render_list_component_text_area;
*                           unused in this view but kept for API parity with sibling views
* @returns {Promise<HTMLElement>} Resolves to the <span> wrapper ready for DOM insertion
*/
view_text_list_text_area.render = async function(self, options) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// fallback
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(entries, fallback_value)

	// Value as string. Note that value already is parsed as resolved string (add_tag_img_on_the_fly is applied on server)
		const value_string = fallback.join(self.context.fields_separator)

	// wrapper. Set as span to preserve html tags like images, bold, italic, etc.
	// (!) Using innerHTML (via inner_html) is intentional here: the stored rich-text
	// value contains markup that must be rendered, not escaped. The server controls
	// what HTML is stored, so client-side trust is intentional by design.
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`,
			inner_html		: value_string
		})


	return wrapper
}//end render



// @license-end
