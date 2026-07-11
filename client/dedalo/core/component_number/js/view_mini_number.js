// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {attach_item_dataframe} from '../../component_common/js/component_common.js'



/**
* VIEW_MINI_NUMBER
* Compact read-only renderer for component_number in 'mini' display mode.
*
* 'Mini' mode is used when a numeric value must appear in a very constrained
* space — for example inside a portal cell, a relation chip, or a compact grid
* column. No edit affordance is provided; the output is a single
* <span class="mini component_number_mini"> whose text content is the joined
* string of all entry values.
*
* This module exports only the constructor stub (an identity function that always
* returns true) and the static render method attached directly to that function.
* The constructor is never called directly; render_edit_component_number routes
* to this view when self.context.view === 'mini' (see the 'mini' case in
* render_edit_component_number.prototype.edit).
*
* @module view_mini_number
* @see render_edit_component_number  Render dispatcher that calls view_mini_number.render.
* @see component_number              Component instance passed as `self`; owns data/context.
* @see ui.component.build_wrapper_mini  Builds the outer <span> wrapper element.
* @see attach_item_dataframe         Appends structured dataframe metadata nodes (no-op
*                                    when context.properties.has_dataframe is falsy).
*/
export const view_mini_number = function() {

	return true
}//end view_mini_number



/**
* RENDER
* Build and return the DOM subtree that represents a component_number value
* in 'mini' display mode.
*
* Layout produced:
*   <span class="mini component_number_mini">
*     {value1}{fields_separator}{value2}…
*   </span>
*
* All numeric entry values are joined into a single text string using
* `context.fields_separator` (e.g. ' | ') and inserted into the wrapper
* via build_wrapper_mini.  When entries is empty, the wrapper is returned
* empty (value_string is '').
*
* Dataframe: `attach_item_dataframe` is called for every entry in the loop.
* It is a no-op when `context.properties.has_dataframe` is false/absent,
* so calling it unconditionally is safe.  When has_dataframe is true, the
* structured dataframe node is appended directly to the wrapper (not to an
* inner item span) — this differs from view_mini_input_text, which appends
* to a per-item <span>. The `view: 'mini'` option tells the dataframe
* renderer to use its own compact layout.
*
* Number formatting: raw `item.value` numbers from the entries array are
* converted to string implicitly by Array.prototype.join. No
* get_format_number / fix_number_format rounding is applied here; the values
* stored in data.entries are already normalised by the save pipeline.
*
* @param {Object} self    - The component_number instance. Must expose:
*                           `self.data.entries` {Array<{id:number|null, value:number|null}>},
*                           `self.context.fields_separator` {string},
*                           `self.context.properties.has_dataframe` {boolean} (optional).
* @param {Object} options - Reserved; currently unused by this view.
* @returns {Promise<HTMLElement>} The populated wrapper <span> element, ready
*   to be inserted into the DOM.
*/
view_mini_number.render = async function(self, options) {

	// short vars
		const data 		= self.data || {}
		const entries 	= data.entries || []

	// Value as string
	// Join all numeric values with the configured separator into a single display string.
	// An empty entries array produces '' so the wrapper renders blank rather than 'undefined'.
		const value_string	= (entries.length>0)
			? entries.map(item => item.value).join(self.context.fields_separator)
			: ''

	// wrapper
	// build_wrapper_mini creates <span class="mini component_number_mini"> and inserts
	// value_string as its initial HTML content.
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	// component_dataframe (shared literal-view glue, no-op without has_dataframe)
	// Iterate entries in parallel with the joined string above; each entry's `id` is
	// the pairing key used by attach_item_dataframe to locate the correct subdatum.
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
