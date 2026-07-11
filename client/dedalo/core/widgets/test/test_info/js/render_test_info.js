// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_TEST_INFO
* Client-side renderer for the `test_info` widget.
*
* The `test_info` widget is a minimal diagnostic aid for `component_info` during
* development and testing. Its server-side counterpart (`class.test_info.php`) resolves
* zero or more IPO (Input–Process–Output) entries, optionally following a `source`
* component reference, and returns a flat array of data items that this module
* renders as a labelled `<ul>` list.
*
* Expected shape of `self.value` (array produced by `class.test_info::get_data()`):
*   [
*     {
*       widget    : 'test_info',      // PHP class name
*       key       : 0,                // IPO group index
*       widget_id : 'info_label',     // mirrors output[n].id
*       id        : 'info_label',     // same value as widget_id (intentional duplication)
*       value     : 'some string'     // resolved source component value, or a default fallback
*     },
*     ...
*   ]
*
* There is no IPO config on the client side — all resolution happens server-side.
* The widget is intentionally simple: it produces no editable inputs, fires no events,
* and subscribes to no event channels. It is read-only in every render mode.
*
* Exports:
*   - `render_test_info` constructor (prototype methods are mixed into the
*     `test_info` instance by `test_info.js` via prototype aliasing)
*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_TEST_INFO
* Client-side render constructor for the test_info widget.
*
* Acts as a mixin stub whose prototype methods (`edit`, `list`) are merged onto
* `test_info.prototype` by the parent `test_info.js` module. The constructor
* itself performs no initialisation — that is handled by `widget_common.prototype.init`.
*
* @returns {boolean} Always returns true.
*/
export const render_test_info = function() {

	return true
}//end render_test_info



/**
* EDIT
* Build and return the edit-mode DOM wrapper for the test_info widget.
*
* Delegates inner content construction to `get_content_data_edit`. When
* `options.render_level === 'content'` the inner content node is returned
* directly (used by portal and embedded callers that manage their own outer
* shell). Otherwise `ui.widget.build_wrapper_edit` wraps the content in the
* standard widget chrome and returns the full wrapper.
*
* (!) This widget is read-only regardless of mode. It renders no inputs and
* does not listen for change events.
*
* @param {Object} options - Render options bag.
* @param {string} [options.render_level] - When set to `'content'`, returns only
*   the inner `<div>` content node; otherwise returns the full widget wrapper.
* @returns {Promise<HTMLElement>} Resolves to the outer wrapper (default) or the
*   inner content_data `<div>` when `render_level === 'content'`.
*/
render_test_info.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* LIST
* Build and return the list-mode DOM wrapper for the test_info widget.
*
* Intentionally delegates to `get_content_data_edit` (same as `edit`) because
* the test_info widget's output is identical in both edit and list contexts —
* it is a read-only diagnostic display in all render modes.
*
* (!) Note: although both `edit` and `list` call `ui.widget.build_wrapper_edit`,
* this is the pattern used by other similar read-only widgets (e.g. `calculation`).
* A `build_wrapper_list` call would be semantically more correct for list mode,
* but this file does not change that behaviour — flag for future review only.
*
* @param {Object} options - Render options bag. See `render_test_info.prototype.edit`.
* @param {string} [options.render_level] - 'content' returns only the inner node.
* @returns {Promise<HTMLElement>} Resolves to the widget wrapper or inner content node.
*/
render_test_info.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_list returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Assemble the inner content DOM node for the test_info widget.
*
* Iterates `self.value` (the flat array of resolved data items from the server)
* and produces one `<li>` per item via `get_value_element`. All items are
* collected in a `<ul class="values_container">` inside a wrapping `<div>`
* (the `content_data` node) that is handed back to the caller.
*
* When `self.value` is empty (no IPO entries, no source data) the `<ul>` will be
* empty but the outer `<div>` is still returned — callers do not need to guard
* against a null result.
*
* @param {Object} self - The test_info widget instance. Expected properties:
*   - `self.value` {Array} Flat array of data items from `class.test_info::get_data()`.
*     Each element has at minimum `widget_id` (or `id`) and `value` fields.
* @returns {Promise<HTMLElement>} Resolves to the `<div>` content_data node.
*/
const get_content_data_edit = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const value			= self.value
		const value_length	= value.length

		for (let i = 0; i < value_length; i++) {
			const data_item = value[i]
			const value_element_node = get_value_element(data_item, self)
			values_container.appendChild(value_element_node)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* Build a single `<li>` element representing one resolved data item.
*
* The `<li>` contains two inline `<span>` children:
*   - `.label` — the widget output id (`data_item.widget_id`, falling back to
*     `data_item.id`, then the literal string `'test_info'`) followed by `': '`.
*   - `.value` — the resolved data value. When the value is an object (e.g.
*     a structured date or a nested result from the source component), it is
*     serialised with `JSON.stringify` so the raw structure is visible. Primitive
*     values are inserted as-is. A nullish value falls back to an empty string via
*     the nullish-coalescing operator.
*
* The function does not attach any event listeners — the test_info widget is
* entirely static after first render.
*
* @param {Object}      data_item - One resolved data item from `self.value`.
*   Expected properties (all produced by `class.test_info::get_data()`):
*     - `widget_id` {string}  Preferred display label key (mirrors output[n].id).
*     - `id`        {string}  Fallback label key when widget_id is absent.
*     - `value`     {*}       Resolved value: string, number, object, or null.
* @param {Object}      self      - The test_info widget instance (unused beyond
*   satisfying the shared `get_value_element(data_item, self)` call signature;
*   retained for API consistency with other widget renderers).
* @returns {HTMLElement} The constructed `<li class="widget_item test_info">` node.
*/
const get_value_element = (data_item, self) => {

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item test_info'
		})

	// widget_id label
		const label = data_item.widget_id || data_item.id || 'test_info'
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: label + ': ',
			parent			: li
		})

	// value
		const value = data_item.value ?? ''
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			// Serialise objects so structured values (e.g. {day,month,year}) are
			// displayed as readable JSON rather than '[object Object]'.
			inner_html		: (typeof value === 'object')
				? JSON.stringify(value)
				: value,
			parent			: li
		})


	return li
}//end get_value_element



// @license-end
