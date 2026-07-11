// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		get_buttons
	} from './render_edit_component_radio_button.js'
	import {handle_radio_change} from './component_radio_button.js'



/**
* VIEW_RATING_EDIT_RADIO_BUTTON
*
* Star-rating variant of the radio-button edit view.
*
* This module renders a `component_radio_button` instance in "rating" visual mode:
* instead of classic labelled radio inputs, each datalist option is presented as a
* star-shaped `content_value` element (via CSS mask-image on `.view_rating`).
* Options are ordered numerically by `section_id` so that rating levels always appear
* left-to-right from lowest to highest regardless of server delivery order.
*
* Selection feedback is cumulative: when the user clicks option N, all stars whose
* `section_id` ≤ N receive the `.rated` class (orange fill), reproducing a typical
* star-rating UX where selecting "3 stars" also lights up stars 1 and 2.
*
* Differences from the default edit view (view_default_edit_radio_button.js):
*   - Uses its own `get_content_data_edit` that sorts by `section_id` and builds
*     label-less content_value nodes (the star shape is provided entirely by CSS).
*   - The native radio `<input>` is kept invisible inside the star (opacity: 0) so
*     that it drives browser accessibility and form semantics while the mask layer
*     provides the visual.
*   - After each change, `update_status` walks all sibling nodes and toggles `.rated`
*     based on a numeric `section_id` comparison rather than an equality check.
*   - Read-only rendering (`permissions === 1`) is NOT handled here; callers that need
*     read-only output should fall through to `view_default_edit_radio_button`.
*
* Exports:
*   `view_rating_edit_radio_button`  – namespace constructor (static `.render` method)
*
* Consumed by:
*   render_edit_component_radio_button.js  →  edit() → case 'rating'
*/



/**
* VIEW_RATING_EDIT_RADIO_BUTTON
* Namespace constructor for the rating edit view.
*
* Acts as a static namespace; all functionality is exposed via the `.render`
* static method.  The constructor itself does nothing except satisfy the
* conventional Dédalo view constructor pattern.
*
* @returns {boolean} Always true
*/
export const view_rating_edit_radio_button = function() {

	return true
}//end view_rating_edit_radio_button



/**
* RENDER
* Render node for use in current view
*
* Builds the complete edit wrapper for the rating view.  The flow mirrors other
* edit views:
*   1. Build `content_data` (datalist options as star nodes, sorted by section_id).
*   2. Short-circuit to return only `content_data` when `render_level === 'content'`
*      (used when the caller already owns the wrapper).
*   3. Build the buttons toolbar (only for write-capable permissions).
*   4. Assemble and return the full component wrapper via `ui.component.build_wrapper_edit`.
*
* A `content_data` pointer is set on `wrapper` so that event handlers inside
* `get_content_value` can reach the live node list via `self.node.content_data`.
*
* @param {Object} self - Component instance (component_radio_button); must have
*   `self.data.datalist`, `self.data.entries`, and `self.permissions` populated
*   by the time this is called (i.e. after `component_common.init`).
* @param {Object} options - Render options passed from the lifecycle orchestrator.
*   @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*     'content' returns only the inner content_data element.
* @returns {Promise<HTMLElement>} The assembled wrapper element (full mode) or the
*   content_data element (content mode).
*/
view_rating_edit_radio_button.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
*
* Builds the `content_data` container populated with one star node per datalist
* entry, then initialises the checked/rated visual state from `self.data.entries`.
*
* Key behaviours specific to the rating view:
*
*   Sorting: datalist items are sorted ascending by their numeric `section_id`
*   before rendering.  This ensures that star 1 always appears leftmost regardless
*   of server delivery order.  The sort mutates the local `datalist` reference
*   (which is a reference to `self.data.datalist`), so callers that depend on the
*   original server order should not call this function more than once per data
*   lifecycle.
*
*   Indexed node pointers: each star node is also stored as `content_data[i]`
*   (numeric index) to allow direct access without querySelector traversal.
*
*   Initial state: `update_status` is called immediately after all nodes are
*   appended so that persisted values are visually reflected before the user
*   interacts with the component.  `entries[0]` is the canonical current value;
*   if absent, the optional-chaining `??` produces `null` and no star is rated.
*
* @param {Object} self - Component instance; `self.data.datalist` and
*   `self.data.entries` must be arrays (may be empty).
* @returns {HTMLElement} The populated `content_data` container element.
*/
const get_content_data_edit = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		const datalist_length	= datalist.length

	// sort datalist by section_id
		datalist.sort((a, b) => (parseInt(a.section_id) > parseInt(b.section_id)) ? 1 : -1)

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build options
		for (let i = 0; i < datalist_length; i++) {
			const input_element_node = get_content_value(i, datalist[i], self)
			content_data.appendChild(input_element_node)
			// set pointers
			content_data[i] = input_element_node
		}

		update_status({
			content_data	: content_data,
			value			: self.data.entries?.[0] ?? null
		})


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Note that param 'i' is key from datalist, not from component value
*
* Builds a single star node for one datalist option.
*
* DOM structure produced:
*   <div class="content_value">       ← star shell; CSS masks it as a filled star
*     <input type="radio" name="{self.id}" title="{label}">
*   </div>
*
* The `<input>` is rendered invisible (opacity: 0 via `.view_rating input[type="radio"]`
* CSS rule) but retains its native role for accessibility and keyboard navigation.
* The `.rated` class (toggled by `update_status`) switches the star fill colour from
* grey to orange via the background-color CSS property on the mask.
*
* `section_id` is stored directly on `content_value` so that `update_status` can
* compare it numerically without querying child elements.
*
* Change handler: on every `change` event the handler:
*   1. Guards against read-only mode (permissions === 1) even though the input is
*      already disabled — belt-and-suspenders safety.
*   2. Delegates to `handle_radio_change` (resolves current entry id, builds and
*      persists the changed_data item).
*   3. Calls `update_status` with the freshly written `self.data.entries[0]` to
*      repaint the star row without a full re-render.
*
* (!) The change handler reads `self.node.content_data` rather than the locally
* scoped `content_data` variable because `self.node` may be reassigned between
* renders, making the closure reference stale.
*
* @param {number} i - Zero-based index into the sorted datalist array (not into
*   `self.data.entries`).
* @param {Object} datalist_item - Single datalist entry: `{ label, value, section_id }`.
*   `value` is the locator object `{section_id, section_tipo, ...}` used as the
*   argument to `handle_radio_change`.
* @param {Object} self - Component instance.
* @returns {HTMLElement} The assembled `content_value` div for this star option.
*/
const get_content_value = (i, datalist_item, self) => {

	// short vars
		const data				= self.data || {}
		const entries			= data.entries || []
		const datalist_value	= datalist_item.value
		const label				= datalist_item.label

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})
		content_value.section_id = datalist_item.section_id

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
			title			: label,
			parent			: content_value
		})
		input.addEventListener('change', async function() {

			if (self.permissions===1){
				return
			}

			// common change handler (clone value + add id, set_changed_data, change_value)
			// read id dynamically from self.data (not from stale closure)
			await handle_radio_change(self, datalist_value)

			// update label checked status
			update_status({
				content_data	: self.node.content_data,
				value			: self.data.entries?.[0] || {}
			})
		})//end change event

		// permissions. Set disabled on low permissions
		if (self.permissions<2) {
			input.disabled = 'disabled'
		}


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Render a element based on passed value
*
* Builds a read-only text node displaying the label of the currently selected
* datalist option.  The `i` and `self` parameters are accepted for API parity
* with the writable `get_content_value` but are not used in the function body.
*
* (!) This function is defined but never called from within this module.
* The rating view does not implement its own read-only rendering path; the
* `render_edit_component_radio_button.js` router redirects `permissions === 1`
* cases to `view_default_edit_radio_button` before this file is reached.
* The function is retained for potential future use or direct invocation by callers.
*
* @param {number} i - data.value array key (unused in this implementation)
* @param {string} current_value - label from datalist item that match current data value
* @param {Object} self - Component instance (unused in this implementation)
* @returns {HTMLElement} A `content_value` div containing the label as inner HTML.
*/
const get_content_value_read = (i, current_value, self) => {

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only',
			inner_html		: current_value
		})


	return content_value
}//end get_content_value_read



/**
* UPDATE_STATUS
* update status checked input set on match
*
* Implements cumulative star-rating highlight: a star is considered "rated"
* when its `section_id` is numerically ≤ the `section_id` of the chosen
* option (`value.section_id`).  This means selecting the 4th star lights
* stars 1–4, consistent with a standard 1-to-N star-rating UX.
*
* `section_id` values are parsed to integers before comparison because they
* may arrive as strings from the server JSON payload.
*
* Edge cases:
*   - When `value` is null/undefined/falsy (no selection), the condition
*     `value && ...` short-circuits to false and all `.rated` classes are
*     removed, resetting the visual state.
*   - When `value.section_id` equals `node.section_id` the node receives
*     `.rated` (≥ comparison), so the selected star itself is always lit.
*
* @param {Object} options
* @param {HTMLElement} options.content_data - The container whose `childNodes`
*   are the star `content_value` elements built by `get_content_value`.  Each
*   node must have a `section_id` property set at creation time.
* @param {Object|null} options.value - The current entry object
*   `{section_id, section_tipo, id?}` from `self.data.entries[0]`, or null
*   when the component has no value.
* @returns {void}
*/
const update_status = (options) => {

	const children	= options.content_data.childNodes
	const value		= options.value

 	for (const node of children) {
		if (value && parseInt(value.section_id) >= parseInt(node.section_id)) {
			node.classList.add('rated')
		}
		else{
			node.classList.remove('rated')
		}
	}
}
//end update_status



// @license-end
