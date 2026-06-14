// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'



/**
* VIEW_MINI_EMAIL
* Read-only 'mini' view for component_email.
*
* Used when an email component appears embedded inside a parent composite
* element (e.g. a section card, a portal preview row) where space is at a
* premium. The output is a plain <span> containing all stored e-mail addresses
* joined by the context's configured field separator.
*
* This constructor is a namespace only (returns true) — all logic lives on the
* static `render` method assigned below.
*/
export const view_mini_email = function() {

	return true
}//end view_mini_email



/**
* RENDER
* Build and return the DOM node that represents this component in 'mini' view.
*
* Behaviour:
* 1. Reads `self.data.entries` (array of datum objects with at least a `value`
*    string property, shaped as `{id, lang, value}`).
* 2. Joins every entry's `.value` with `self.context.fields_separator` (a
*    string such as ', ' configured per-section in the context DDO).
* 3. Creates a <span class="mini component_email_mini"> via
*    `ui.component.build_wrapper_mini` and injects the joined string as HTML.
*    `autoload: false` is passed so the wrapper does NOT pre-insert a
*    value_string — the value is inserted separately in step 3 via
*    `insertAdjacentHTML`, giving callers a chance to process the entries
*    first (e.g. for dataframe attachment).
* 4. For each entry, calls `attach_item_dataframe` to append any associated
*    dataframe label node. When the component has no dataframe this is a no-op.
*
* @param {Object} self - The component_email instance. Must expose:
*   `self.data`    {Object} — API response data object.
*   `self.context` {Object} — Context DDO; `context.fields_separator` used for join.
* @param {Object} options - Reserved for future use; currently unused.
* @returns {Promise<HTMLElement>} The constructed <span> wrapper, ready to mount.
*/
view_mini_email.render = async function(self, options) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// wrapper
		// (!) autoload:false suppresses early value injection inside build_wrapper_mini;
		//     value is inserted below only after entries have been processed.
		const wrapper = ui.component.build_wrapper_mini(self, {
			autoload : false
		})

	// Value as string
		// Concatenate all stored e-mail addresses with the context-defined separator.
		// Multiple addresses per record (multiple entries) are joined in display order.
		const value_string = entries.map(item => item.value).join(self.context.fields_separator)

	// Set value
		wrapper.insertAdjacentHTML('afterbegin', value_string)

	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
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
