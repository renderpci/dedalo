// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* COMPONENT_CHECK_BOX
* Client-side controller for the check_box related component.
*
* `component_check_box` renders a closed list of values as a multi-select
* group of checkboxes. Each checked option is stored as a locator (relation)
* pointing at a record in the configured list-of-values target section; the
* displayed label is resolved from that target term in the active application
* language. The component is non-translatable (`lg-nolan`).
*
* Responsibilities:
* - Holds per-instance identity properties (tipo, section_tipo, section_id,
*   mode, lang, etc.) populated by component_common.prototype.init.
* - Delegates lifecycle, persistence, and navigation to shared prototype
*   methods from `component_common` and `common`.
* - Dispatches mode-specific rendering to the render_* modules (edit, list,
*   search). The `tm` (Time Machine) mode reuses the list render.
* - Exports `build_changed_data_item` for use by the search render module,
*   which must produce the same `changed_data_item` shape for consistency.
*
* Data shape (runtime `self.data`):
* ```json
* {
*   "entries"  : [{"type":"dd151","section_id":"1","section_tipo":"rsc723","from_component_tipo":"tch191"}],
*   "datalist" : [{"value":{"section_id":"1","section_tipo":"rsc723"},"label":"Purchase","section_id":"1"}],
*   "q_operator": null
* }
* ```
* `datalist` is the full resolved option list; `entries` is the subset of
* currently selected locators. `q_operator` is only present in search mode.
*
* @see component_common (core/component_common/js/component_common.js)
* @see common (core/common/js/common.js)
* @see render_edit_component_check_box (./render_edit_component_check_box.js)
* @see render_list_component_check_box (./render_list_component_check_box.js)
* @see render_search_component_check_box (./render_search_component_check_box.js)
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_check_box} from '../../component_check_box/js/render_edit_component_check_box.js'
	import {render_list_component_check_box} from '../../component_check_box/js/render_list_component_check_box.js'
	import {render_search_component_check_box} from '../../component_check_box/js/render_search_component_check_box.js'



/**
* COMPONENT_CHECK_BOX
* Constructor. Declares per-instance state properties that will be populated
* by `component_common.prototype.init` at runtime.
*
* All fields default to `undefined` until `init` is called; `minimum_width_px`
* is the only property with a concrete default here and is consumed by the
* layout/CSS layer to enforce a lower bound on the component's rendered width.
*/
export const component_check_box = function(){

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node
	this.id

	// ui
	this.minimum_width_px = 100 // integer pixels
}//end component_check_box



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_check_box.prototype.init				= component_common.prototype.init
	component_check_box.prototype.build				= component_common.prototype.build
	component_check_box.prototype.render			= common.prototype.render
	component_check_box.prototype.refresh			= common.prototype.refresh
	component_check_box.prototype.destroy			= common.prototype.destroy

	// change data
	component_check_box.prototype.save				= component_common.prototype.save
	component_check_box.prototype.update_data_value	= component_common.prototype.update_data_value
	component_check_box.prototype.update_datum		= component_common.prototype.update_datum
	component_check_box.prototype.change_value		= component_common.prototype.change_value
	component_check_box.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_check_box.prototype.build_rqo_show	= common.prototype.build_rqo_show

	// render
	component_check_box.prototype.list				= render_list_component_check_box.prototype.list
	component_check_box.prototype.tm				= render_list_component_check_box.prototype.list
	component_check_box.prototype.edit				= render_edit_component_check_box.prototype.edit
	component_check_box.prototype.search			= render_search_component_check_box.prototype.search

	component_check_box.prototype.change_mode		= component_common.prototype.change_mode



/**
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen `changed_data_item` object from a checkbox interaction and
* returns it together with the resolved action string.
*
* This is a shared pure helper exported for use by both the edit render
* (`change_handler`) and the search render (`get_input_element`), so that
* both code paths produce a consistent `changed_data_item` shape without
* duplicating the logic.
*
* How it works:
* 1. Derives the `action` from the current `checked` state:
*    `true` → `'insert'`, `false` → `'remove'`.
* 2. Looks up an existing entry in `entries` that matches `datalist_value`
*    by `section_id` (loose equality, `==`) and `section_tipo` (strict, `===`)
*    to recover the stored relation `id` (needed by the server to target the
*    row to delete on `remove`).
* 3. Sets `value` to `datalist_value` on insert, or `null` on remove.
* 4. Freezes the resulting object so downstream code cannot mutate it
*    accidentally before it reaches `change_value` / `update_data_value`.
*
* Locator shape in `datalist_value`:
* ```json
* { "section_id": "1", "section_tipo": "rsc723" }
* ```
* `from_component_tipo` is injected by the search render before the call;
* the edit render uses the value directly from `data.datalist`.
*
* `changed_data_item` shape:
* ```json
* { "action": "insert"|"remove", "id": <number>|null, "value": <locator>|null }
* ```
*
* @param {boolean} checked - Current checked state of the checkbox input.
* @param {Object}  datalist_value - Locator identifying the toggled option,
*   shape `{section_id, section_tipo}` (and optionally `from_component_tipo`).
* @param {Array}   entries - The component's current selected locators
*   (`self.data.entries`), used to find the existing relation `id` for removes.
* @returns {Object} An object with two keys:
*   - `changed_data_item` {Object} — frozen action descriptor for `change_value`.
*   - `action` {string} — `'insert'` or `'remove'`.
*/
export const build_changed_data_item = function(checked, datalist_value, entries) {

	const action		= (checked===true) ? 'insert' : 'remove'
	const locator		= entries.find(item => {
		return (item.section_id==datalist_value.section_id &&
				item.section_tipo===datalist_value.section_tipo)
	})
	const changed_value	= (action==='insert') ? datalist_value : null

	const changed_data_item = Object.freeze({
		action	: action,
		id		: locator?.id || null,
		value	: changed_value
	})

	return {
		changed_data_item	: changed_data_item,
		action				: action
	}
}//end build_changed_data_item



/**
* CHANGE_HANDLER
* Handles the `change` event fired by an individual checkbox in edit mode.
*
* Called from the `change` event listener attached to each `<input type=checkbox>`
* inside `get_content_value` (render_edit_component_check_box.js). It:
* 1. Prevents the native form-submission default.
* 2. Builds a frozen `changed_data_item` via `build_changed_data_item`, which
*    resolves the `insert` / `remove` action and recovers the existing relation
*    `id` for removes.
* 3. Writes `changed_data` onto `self.data` so the instance state reflects
*    the pending mutation before the server round-trip.
* 4. Calls `change_value` (inherited from `component_common`) with `refresh:false`
*    to persist the change immediately. The save-on-every-change strategy is
*    necessary because each toggle recalculates the stored value keys server-side
*    and the refreshed `entries` array must stay in sync with the DOM.
* 5. Records `selected_key` for any downstream UI that needs to know which
*    datalist index was last touched.
*
* `options` shape:
* ```js
* {
*   self           : component_check_box,  // the component instance
*   e              : Event,                // the DOM change event
*   i              : number,               // datalist index of the toggled checkbox
*   datalist_value : Object,               // locator for the option {section_id, section_tipo}
*   input_checkbox : HTMLInputElement      // the checkbox that fired the event
* }
* ```
*
* @param {Object} options - Destructured call options (see shape above).
* @returns {Promise<boolean>} Resolves to `true` after the save completes.
*/
component_check_box.prototype.change_handler = async function(options) {

	// options
		const self				= options.self
		const e					= options.e // event
		const i					= options.i // value key
		const datalist_value	= options.datalist_value
		const input_checkbox	= options.input_checkbox

	// prevent event default
		e.preventDefault()

	// build changed_data_item using shared function
		const {changed_data_item} = build_changed_data_item(
			input_checkbox.checked,
			datalist_value,
			self.data.entries || []
		)

	// change data array
		const changed_data = [changed_data_item]

	// fix instance changed_data
		self.data.changed_data = changed_data

	// force to save on every change. Needed to recalculate the value keys
		await self.change_value({
			changed_data	: changed_data,
			refresh			: false,
			remove_dialog	: ()=>{
				return true
			}
		})

	// fix selected_key
		self.selected_key = i


	return true
}//end change_handler



/**
* FOCUS_FIRST_INPUT
* No-op override that satisfies the `ui.component.activate` contract.
*
* `ui.component.activate` calls `focus_first_input()` when an area or keyboard
* shortcut activates a component, expecting it to move browser focus to the
* first interactive element. For `component_check_box` the individual checkbox
* inputs gain focus naturally on tab/click, so there is nothing to do here;
* returning `true` signals that the activate call was handled without error.
*
* The method must exist on the prototype because `common` always calls it;
* leaving it absent would throw at runtime.
*
* @returns {boolean} Always `true`.
*/
component_check_box.prototype.focus_first_input = function() {

	return true
}//end focus_first_input



// @license-end
