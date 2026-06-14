// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'
	import {tr} from '../../common/js/tr.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_MINI_TEXT_AREA
* Compact read-only presentation of a component_text_area value in 'mini' view.
*
* 'Mini' view is used wherever the full text must be summarised in a single
* inline span — typically inside autocomplete suggestion rows, datalist items,
* and relation popups. It never exposes editing controls.
*
* Responsibilities:
*  - Resolve the best available language value via get_fallback_value (wrapping
*    missing-language values in <mark> so the caller can style them distinctly).
*  - Convert embedded Dédalo markup tags (timecodes, index entries, etc.) to
*    <img> thumbnails through tr.add_tag_img_on_the_fly.
*  - Delegate wrapper construction to ui.component.build_wrapper_mini.
*  - Optionally append an associated component_dataframe node for each entry
*    when the ontology opt-in flag `has_dataframe` is set.
*
* Main export: view_mini_text_area.render (static async method).
*/
export const view_mini_text_area = function() {

	return true
}//end view_mini_text_area



/**
* RENDER
* Builds and returns the DOM node that represents a component_text_area in
* 'mini' view mode — a compact, inline, read-only span.
*
* Flow:
*  1. Extract entries and fallback_value arrays from self.data.
*  2. Resolve the display value with get_fallback_value: for each field
*     position, use the current-language entry if present; otherwise fall back
*     to the default-language value wrapped in <mark>.
*  3. Join the resolved values with the ontology-configured fields_separator
*     and convert any embedded Dédalo markup tags to <img> elements.
*  4. Build a <span class="mini <model>_mini"> wrapper via build_wrapper_mini.
*  5. For every entry, call attach_item_dataframe to append a paired dataframe
*     component node when has_dataframe is enabled on this component (no-op
*     otherwise).
*
* @param {Object} self    - The component_text_area instance. Must expose:
*                             self.data.entries        {Array}  — current-lang data rows
*                             self.data.fallback_value {Array}  — default-lang fallback rows
*                             self.context.fields_separator {string} — multi-field join char
*                             self.model               {string} — component model name
* @param {Object} options - Reserved for future use; not currently consumed.
* @returns {Promise<HTMLElement>} The constructed wrapper <span> element, ready
*   to be inserted into the document.
*/
view_mini_text_area.render = async function(self, options) {

	// short vars
		const data		= self.data
		const entries	= data.entries || []

	// fallback
	// get_fallback_value returns one string per field position: the current-language
	// entry value if it exists, or the default-language value wrapped in <mark>.
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(entries, fallback_value)


	// Value as string
	// Join multi-field values and convert any embedded Dédalo markup tags
	// (timecodes, index-in, index-out, etc.) to inline <img> thumbnails so they
	// render correctly in contexts that do not load the full tag stylesheet.
		const value_string = tr.add_tag_img_on_the_fly( fallback.join(self.context.fields_separator) )

	// wrapper
	// build_wrapper_mini creates a <span class="mini <model>_mini"> and injects
	// value_string via insertAdjacentHTML so tag markup is parsed as HTML.
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
	// attach_item_dataframe reads self.context.properties.has_dataframe and returns
	// null immediately when the flag is absent, so the loop is safe for all instances.
	// The dataframe node is appended directly to wrapper, not content_data, because
	// mini view has no separate content container.
		for (const entry of entries) {
			await attach_item_dataframe({
				self		: self,
				item		: entry,
				container	: wrapper,
				view		: 'mini'
			})
		}


	return wrapper
}//end render



// @license-end
