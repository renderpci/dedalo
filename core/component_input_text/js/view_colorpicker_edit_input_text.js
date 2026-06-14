// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, page_globals, get_label */
/*eslint no-undef: "error"*/



/**
* VIEW_COLORPICKER_EDIT_INPUT_TEXT
* Edit-mode view for component_input_text when `context.view === 'colorpicker'`.
*
* Renders a paired HTML color-picker / text-input widget that lets users pick or
* manually type a CSS hex colour string (e.g. `#f78a1c`).  The two inputs are kept
* in sync: selecting a colour via the native `<input type="color">` writes the hex
* value into the sibling text field, which in turn fires `change_handler` (the shared
* save pathway); typing a value directly into the text field updates the colour swatch.
*
* Responsibilities:
*  - Builds the full component wrapper (label + content_data + buttons) for `permissions > 1`.
*  - For read-only access (`permissions === 1`) renders an inline colour swatch (`<span
*    class="color_read">`) backed by a `get_fallback_value` resolution, so cross-language
*    fallbacks are respected even in read mode.
*  - Delegates actual data persistence to `change_handler` from
*    `render_edit_component_input_text`, keeping this module stateless.
*
* Data contract:
*  - `self.data.entries` – `Array<{id:number|null, value:string, lang:string}>`.
*    Each entry carries a single hex colour string in `.value`.  The array may be
*    empty; the view always renders at least one row (see `get_content_data_edit`).
*  - `self.permissions` – integer; `1` = read-only, `> 1` = editable.
*  - `self.context.view` – must equal `'colorpicker'` for this module to be activated
*    (routing is done by `render_edit_component_input_text.edit()`).
*
* Exported symbols: `view_colorpicker_edit_input_text` (namespace + `render` static).
*
* @module view_colorpicker_edit_input_text
* @see render_edit_component_input_text  View-dispatch switch that routes to this module.
* @see change_handler                    Shared save/validation pipeline for all input_text views.
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {change_handler} from './render_edit_component_input_text.js'



/**
* VIEW_COLORPICKER_EDIT_INPUT_TEXT
* Namespace constructor — holds static methods only; never instantiated directly.
* All logic is accessed through `view_colorpicker_edit_input_text.render(self, options)`.
* @returns {boolean} Always `true` (conventional namespace sentinel).
*/
export const view_colorpicker_edit_input_text = function() {

	return true
}//end view_colorpicker_edit_input_text



/**
* RENDER
* Build and return the full component DOM tree for the colorpicker edit view.
*
* When `options.render_level === 'content'` only the inner content_data fragment is
* returned (used by partial re-renders that skip wrapper/label reconstruction).
* Otherwise the full wrapper produced by `ui.component.build_wrapper_edit` is returned
* with `wrapper.content_data` pointing at the inner fragment for later access.
*
* The buttons area is omitted when `self.permissions === 1` (read-only mode).
*
* @param {Object} self    - Component instance (component_input_text).  Relevant
*                           properties: `data`, `permissions`, `context`, `lang`,
*                           `active`, `show_interface`.
* @param {Object} options - Render options bag.
* @param {string} [options.render_level='full'] - `'full'` builds the entire wrapper;
*                           `'content'` returns only the content_data element.
* @returns {Promise<HTMLElement>} Resolves to the wrapper (full) or content_data (content).
*/
view_colorpicker_edit_input_text.render = async function(self, options) {

	// options
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
* Build the `content_data` container populated with one `content_value` node per entry.
*
* If `self.data.entries` is empty, a single slot seeded with `null` is generated so
* the UI always shows at least one (blank) picker row.  Each slot is also stored as a
* numeric index property on `content_data` (e.g. `content_data[0]`, `content_data[1]`)
* so callers can directly address individual value rows without traversing the DOM.
*
* Read-only vs editable rendering is chosen per row based on `self.permissions`:
*   - `1`  → `get_content_value_read`  (swatch + hex string, no inputs)
*   - `> 1` → `get_content_value`       (native colour picker + synced text input)
*
* @param {Object} self - Component instance.
* @returns {HTMLElement} The populated `content_data` div element.
*/
const get_content_data_edit = function(self) {

	// short vars
		const data		= self.data || {}
		const entries	= data.entries || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (entries.length<1) ? [null] : entries // force one empty input at least
		const value_length	= inputs_value.length

		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// set the pointer
			content_data[i] = content_value
			// add node to content_data
			content_data.appendChild(content_value)
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Build the editable colour picker + text-input widget for a single value slot.
*
* Rendered structure:
* ```
* div.content_value
*   span.color_picker_container
*     input[type=color].color_picker   ← native OS colour chooser
*   input[type=text].input_value       ← hex string text field (mirrors color_picker)
* ```
*
* Synchronisation contract between the two inputs:
*  - `color` → `text`: both `change` (committed pick) and `input` (live drag) events on
*    the colour wheel update `input.value` directly.  Only the `change` event also fires
*    `input.dispatchEvent(new Event('change'))` to trigger `change_handler` and persist
*    the value; `input` events are intentionally NOT saved on every drag tick.
*  - `text` → `color`: the text field's `change` event fires `change_handler` which
*    persists the value and calls the `post_process` callback to sync `color_picker.value`.
*
* The `default_color` (`#f78a1c`, Dédalo orange) is used as both the initial display
* value and the placeholder for both inputs when no stored value exists.
*
* Note: `multi_line` and `with_lang_versions` context properties are read but have no
* effect in this view (the colorpicker widget is always single-line / monolingual).
* They are preserved for API parity with `view_default_edit_input_text`.
*
* @param {number} i             - Zero-based index of this entry within `data.entries`.
* @param {Object|null} current_value - Entry object `{id, value, lang}` or `null` when
*                                    the entries array is empty and a blank row is forced.
* @param {Object} self          - Component instance.
* @returns {HTMLElement} The `div.content_value` node ready to append into content_data.
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const multi_line = (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const with_lang_versions	= self.context.properties.with_lang_versions || false
		const default_color			= '#f78a1c';

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

		// color picker
		// content_value node
		const color_picker_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'color_picker_container'
		})

		const color_picker = ui.create_dom_element({
			element_type	: 'input',
			type			: 'color',
			id 				: 'color_picker',
			name 			: 'color_picker',
			class_name		: 'color_picker',
			value			: current_value?.value || default_color,
			parent			: color_picker_container
		})
		// 'change' fires when the user commits a colour selection (closes the native picker).
		// Mirrors the chosen hex into the text field and dispatches a synthetic 'change' on
		// it so change_handler runs and persists the new value.
		color_picker.addEventListener("change", function(e){
			input.value = e.target.value;
			// dispatch change on text input to trigger change_handler (save)
			input.dispatchEvent(new Event('change'))
		});
		// 'input' fires continuously while the user drags the colour wheel.
		// Only update the text display — do NOT save on every tick to avoid flooding the API.
		color_picker.addEventListener('input', function(e){
			input.value = e.target.value;
		});
		content_value.appendChild(color_picker_container)


	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value?.value || default_color,
			placeholder		: (current_value?.value) ? '' : '#f78a1c',
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})

		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})

		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})

		// change event
			input.addEventListener('change', function(e) {
				// post_process: after save, sync the colour-picker swatch with the typed hex value.
				// (!) If the user types an invalid hex, the native colour input silently ignores it —
				// the swatch will retain its last valid colour while the text field shows the raw string.
				change_handler(e, i, self, {
					post_process: (e, key, self) => {
						color_picker.value = e.target.value;
					}
				})
			})


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Build the read-only colour display for a single value slot (permissions === 1).
*
* The stored hex value is resolved through `get_fallback_value` so that when the
* current-language entry is empty, a wrapped fallback string from another language is
* shown (wrapped in `<mark>` by `get_fallback_value`).  The resolved value is applied
* both as a CSS `background` style on a colour swatch span and as visible text.
*
* Rendered structure:
* ```
* div.content_value
*   span.color_read          ← inline colour swatch (background CSS set to final_value)
*   div.text_value.read_only ← hex string displayed as text (may include <mark> tag)
* ```
*
* Note: `get_fallback_value` returns an Array; here only the first element is used
* because the view always passes a single-element array `[current_value]`.
*
* @param {number} i             - Zero-based index within `data.entries`.
* @param {Object|null} current_value - Entry object `{id, value, lang}` or `null`.
* @param {Object} self          - Component instance; `self.data.fallback_value` is the
*                                 fallback array passed to `get_fallback_value`.
* @returns {HTMLElement} The `div.content_value` node.
*/
const get_content_value_read = (i, current_value, self) => {

	const data				= self.data || {}
	const fallback_value	= data.fallback_value || []
	// get_fallback_value returns an Array of resolved strings (with <mark> wrapping for
	// fallback entries); index [0] is the resolved value for this single slot.
	const final_value		= get_fallback_value([current_value], fallback_value)


	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// color
		const color_read = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'color_read',
			parent 			: content_value
		})
		// Apply the hex colour directly as the background of the swatch.
		// (!) final_value is an Array here (returned by get_fallback_value), so
		// assigning it to style.background coerces it to its toString() representation —
		// which is a comma-separated list for arrays.  When there is only one element
		// (the normal case for this view), the coercion produces the bare hex string and
		// the style is applied correctly.  For multi-value future use this would need
		// indexing (e.g. final_value[0]).
		color_read.style.background = final_value;

	// text_value node
		const text_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'text_value read_only',
			inner_html		: final_value,
			parent 			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* Build the buttons container for the colorpicker view.
*
* Only called when `self.permissions > 1`.  The container includes the standard tools
* strip (`ui.add_tools`) when `self.show_interface.tools === true`.  Unlike the default
* view, the colorpicker view does not expose a "button_add" (multi-value is not
* supported by this view).
*
* Rendered structure:
* ```
* div.buttons_container
*   div.buttons_fold
*     [tool buttons if show_interface.tools === true]
* ```
*
* @param {Object} self - Component instance; consumes `self.show_interface`.
* @returns {HTMLElement} The `div.buttons_container` node.
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// buttons tools
		if(self.show_interface.tools === true){
			ui.add_tools(self, fragment)
		}//end add tools

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
