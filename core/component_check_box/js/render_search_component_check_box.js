// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_SEARCH_COMPONENT_CHECK_BOX
* Client-side search renderer for component_check_box.
*
* Builds and manages the DOM for a `component_check_box` instance when
* `mode === 'search'`. This module is mixed into `component_check_box` via
* prototype assignment in `component_check_box.js`:
*   `component_check_box.prototype.search = render_search_component_check_box.prototype.search`
*
* Responsibilities:
* - Renders one `content_value` div (containing a `<label>` and an
*   `<input type="checkbox">`) per item in `self.data.datalist`.  Each checkbox
*   represents one of the target-section records that the user may include in
*   the search filter.
* - Applies initial checked state by matching each datalist entry's locator
*   (`{section_id, section_tipo}`) against the current `self.data.entries` array.
* - On checkbox `change`, calls `build_changed_data_item` (shared with the edit
*   renderer) to build a frozen `changed_data_item` descriptor, passes it to
*   `self.update_data_value()` to mutate in-memory state, and publishes the
*   global `change_search_element` event so the surrounding search bar redraws.
* - Exposes a `q_operator` input that lets the user override the default SQL
*   comparison operator for this component's search clause (e.g. `'='`, `'LIKE'`).
*   The override is written directly to `self.data.q_operator` and triggers
*   `change_search_element` to flush the new preset to the search bar.
* - Annotates each datalist locator with `from_component_tipo = self.tipo` before
*   it is written into instance data, which satisfies the server-side duplicate-
*   detection contract (`test_equal_properties` in `class.component_check_box.php`).
*
* Data shapes:
* - `self.data.datalist` — Array of `{label, section_id, value}` objects where
*   `value` is a locator `{section_id, section_tipo}` pointing to the target record.
* - `self.data.entries` — Array of persisted locator entries
*   `{id, section_id, section_tipo, type, from_component_tipo}` representing the
*   currently selected values in the search filter.
* - `self.data.q_operator` — Optional string override for the SQL comparison
*   operator sent to the server in the SQO clause (e.g. `'=='`, `'LIKE'`). When
*   `null` the server applies the component's default operator.
*
* Exports:
*   `render_search_component_check_box` — constructor (prototype carrier only)
*
* @see component_check_box.js              Prototype assignment and `build_changed_data_item` export.
* @see component_common.prototype.update_data_value  Single write path for entry mutations.
* @see event_manager.js#publish            Pub/sub bus used to trigger search-bar re-render.
* @see class.component_check_box.php#test_equal_properties  Server duplicate-detection contract.
* @see class.search.php#get_sql_where      Server-side `q_operator` handling.
*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {build_changed_data_item} from './component_check_box.js'



/**
* RENDER_SEARCH_COMPONENT_CHECK_BOX
* Constructor function (no-op body; all methods live on the prototype).
* Mixed into `component_check_box` via prototype assignment in `component_check_box.js`.
* @returns {boolean} true — satisfies the call-as-constructor contract.
*/
export const render_search_component_check_box = function() {

	return true
}//end render_search_component_check_box



/**
* SEARCH
* Entry point for the search-mode render lifecycle.
*
* Called by the component lifecycle when `mode === 'search'`. Builds the inner
* `content_data` subtree (q_operator input and one checkbox row per datalist item)
* via `get_content_data`, then wraps it in `ui.component.build_wrapper_search`
* unless `render_level === 'content'`.
*
* When `render_level === 'content'` the method returns just the `content_data`
* element — this is used by partial-refresh paths that need to replace only the
* inner DOM without rebuilding the outer `wrapper_component` shell.
*
* The returned `wrapper` element exposes `wrapper.content_data` as a direct
* property so callers can reach the inner node without a DOM query.
*
* @param {Object} options - Render configuration passed by the lifecycle.
* @param {string} [options.render_level='full'] - `'content'` returns only
*   `content_data`; any other value (or omitted) returns the full wrapper.
* @returns {Promise<HTMLElement>} `wrapper_component` element (full render) or
*   `content_data` element (content-only render).
*/
render_search_component_check_box.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* Build the full search content area for a checkbox component.
*
* Produces three logical sections inside the standard `content_data` shell:
*   1. A `q_operator` text input that lets the user supply an explicit SQL
*      comparison operator override.  On `change`, the operator is written to
*      `self.data.q_operator` (or reset to `null` when cleared) and
*      `change_search_element` is published.
*   2. Zero or more `content_value` nodes — one per item in `self.data.datalist`.
*      Each node contains a labelled checkbox rendered by `get_input_element`.
*
* Each rendered `content_value` node is:
*   - Appended as a child of `content_data`, and
*   - Stored as a numeric property (`content_data[i]`) for O(1) index-based
*     access by callers without requiring a DOM query.
*
* Note: `ui.component.build_content_data` is called with `autoload: false`
* because the datalist is already resolved server-side and present in
* `self.data.datalist`; no lazy-loading is required.
*
* @param {Object} self - The component instance (`component_check_box`).
* @returns {HTMLElement} `content_data` div populated with the q_operator input
*   and one checkbox node per datalist item.
*/
const get_content_data = function(self) {

	// short vars
		const datalist	= self.data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : false
		})

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function() {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element_node = get_input_element(i, datalist[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* Render a single checkbox row for one datalist option.
*
* Builds a `content_value` div containing:
*   - A `<label>` wrapping an `<input type="checkbox">`.
*
* Checked-state initialisation:
*   Iterates `self.data.entries` to find a locator whose `section_id` and
*   `section_tipo` match `datalist_value`.  When a match is found the checkbox
*   is initialised as checked.  The `===` comparison on `section_id` requires
*   both sides to be the same type; callers must ensure type consistency.
*
* Change handler contract:
*   1. Calls `build_changed_data_item(input_checkbox.checked, datalist_value,
*      entries)` — shared with the edit renderer — to build a frozen
*      `{action, id, value}` descriptor.
*      - `action` is `'insert'` when checked, `'remove'` when unchecked.
*      - `id` is the existing entry `id` (for update/delete on the server) or
*        `null` for new insertions.
*      - `value` is the `datalist_value` locator for inserts, or `null` for removes.
*   2. Passes the descriptor to `self.update_data_value(changed_data_item)` which
*      updates `self.data.entries` in memory.
*   3. Publishes `change_search_element` so the surrounding search bar redraws.
*
* `from_component_tipo` annotation:
*   Before a `datalist_value` locator is used in the change handler it is
*   annotated with `datalist_value.from_component_tipo = self.tipo`.  This
*   is required for the server's duplicate-detection logic
*   (`test_equal_properties` in `class.component_check_box.php`) which checks
*   `from_component_tipo` to distinguish relations from different source components
*   pointing at the same target record.
*   (!) `datalist_value` is the live object from the datalist array.  The mutation
*   is performed once, at render time, and persists for the lifetime of the DOM.
*
* @param {number} i - Zero-based index of this item within `self.data.datalist`.
* @param {Object} current_value - Datalist item `{label, section_id, value}` where
*   `value` is a locator `{section_id, section_tipo}` pointing to the target record.
* @param {Object} self - The component instance (`component_check_box`).
* @returns {HTMLElement} `content_value` div containing the labelled checkbox.
*/
const get_input_element = (i, current_value, self) => {

	// short vars
		const entries			= self.data.entries || []
		const value_length		= entries.length
		const datalist_item		= current_value // is object as {label, section_id, value}
		const label				= datalist_item.label
		const section_id		= datalist_item.section_id
		const datalist_value	= datalist_item.value // is locator like {section_id:"1",section_tipo:"dd174"}
		if (datalist_value) {
			// Annotate the locator once so the server can identify the source component
			// when running duplicate-detection (test_equal_properties includes from_component_tipo).
			datalist_value.from_component_tipo = self.tipo
		}

	// create content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input checkbox
		const input_checkbox = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		option_label.prepend(input_checkbox)
		// change handler
		const change_handler = function() {

			// build changed_data_item using shared function
				const {changed_data_item} = build_changed_data_item(
					input_checkbox.checked,
					datalist_value,
					entries
				)

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		}
		input_checkbox.addEventListener('change', change_handler)

		// checked option set on match
			for (let j = 0; j < value_length; j++) {
				if (entries[j] && datalist_value &&
					entries[j].section_id===datalist_value.section_id &&
					entries[j].section_tipo===datalist_value.section_tipo
					) {
						input_checkbox.checked = 'checked'
				}
			}


	return content_value
}//end get_input_element


// @license-end
