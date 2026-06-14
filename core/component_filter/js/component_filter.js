// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_filter} from '../../component_filter/js/render_edit_component_filter.js'
	import {render_list_component_filter} from '../../component_filter/js/render_list_component_filter.js'
	import {render_search_component_filter} from '../../component_filter/js/render_search_component_filter.js'



/**
* COMPONENT_FILTER
* Client-side component for project-based access-control (filter) fields in Dédalo.
*
* Every section record is assigned to one or more projects. This component renders a
* hierarchical checkbox tree (built from `data.datalist`) that lets users select which
* projects a record belongs to. In search mode it acts as a multi-select project filter
* that drives the SQO sent to the server.
*
* Responsibilities:
* - Displays the user-visible list of available projects as a collapsible tree.
* - Mediates checkbox interactions via `change_handler`, which routes changes to either
*   `change_value` (edit mode, persisted immediately) or `update_data_value` + a
*   `change_search_element` event (search mode, in-memory only until the query fires).
* - Enforces a minimum of one selected project in edit mode (the view layer calls
*   `alert()` and vetoes the deselection when the count would drop to zero).
* - Delegates all rendering to the three render sub-modules:
*     - `render_edit_component_filter`   → edit / line / print views
*     - `render_list_component_filter`   → list / tm / mini / text / collapse views
*     - `render_search_component_filter` → search view
* - Inherits the full component lifecycle (init → build → render → save → destroy)
*   from `component_common` and `common`.
*
* Data shape (`this.data`):
* ```json
* {
*   "entries"  : [ { "id": 12, "section_id": "9", "section_tipo": "dd153" } ],
*   "datalist" : [
*     {
*       "section_id"  : "9",
*       "section_tipo": "dd153",
*       "label"       : "My Project",
*       "type"        : "project",
*       "order"       : 1,
*       "parent"      : null,
*       "has_children": false,
*       "value"       : { "section_id": "9", "section_tipo": "dd153", "from_component_tipo": "dd345" }
*     }
*   ]
* }
* ```
* - `entries`  — currently selected projects; each entry links back to a project record
*   via (`section_id`, `section_tipo`) and carries a database row `id`.
* - `datalist` — flat list of all available projects (hierarchy expressed via `parent`).
*   Root nodes have `parent: null`; child nodes carry `{ section_tipo, section_id }` of
*   their parent. The render layer reconstructs the tree from this flat list on each render.
*
* Security note: the server enforces that non-admin users cannot remove projects they do
* not belong to (see `class.component_filter.php → conform_save`). The client enforces
* only the cosmetic one-project minimum.
*
* @see component_common           Generic lifecycle, save, change_value, mode-switch.
* @see render_edit_component_filter   Edit-mode view dispatch and checkbox interaction.
* @see render_list_component_filter   List / TM / mini / text / collapse view dispatch.
* @see render_search_component_filter  Search-filter view and q_operator control.
* @see docs/core/components/component_filter.md  Full data-model and properties reference.
*/

/**
* COMPONENT_FILTER
* Constructor. Declares all instance properties used throughout the lifecycle.
* All fields are initialised to null; `component_common.init()` populates them from
* the options object passed at mount time.
*
* Property notes:
* - `minimum_width_px` — CSS minimum-width hint (integer pixels) read by the view layer
*   to prevent the component collapsing in compressed grid layouts. Set to 250 px,
*   wider than most text components because the project tree needs readable label space.
*/
export const component_filter = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	// ui
	this.minimum_width_px = 250 // integer pixels
}//end component_filter



/**
* COMMON FUNCTIONS
* Extend component_filter with shared prototype methods from component_common and common.
* No own implementations for these generic methods — all logic lives in the shared prototypes.
* The `tm` (Time Machine) render mode reuses the standard list renderer unchanged.
*/
// prototypes assign
	component_filter.prototype.init					= component_common.prototype.init
	component_filter.prototype.build				= component_common.prototype.build
	component_filter.prototype.render				= common.prototype.render
	component_filter.prototype.destroy				= common.prototype.destroy
	component_filter.prototype.refresh				= common.prototype.refresh
	component_filter.prototype.save					= component_common.prototype.save
	component_filter.prototype.load_data			= component_common.prototype.load_data
	component_filter.prototype.get_value			= component_common.prototype.get_value
	component_filter.prototype.set_value			= component_common.prototype.set_value
	component_filter.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter.prototype.update_datum			= component_common.prototype.update_datum
	component_filter.prototype.change_value			= component_common.prototype.change_value
	component_filter.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_filter.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_filter.prototype.list					= render_list_component_filter.prototype.list
	component_filter.prototype.tm					= render_list_component_filter.prototype.list // TM view reuses the standard list renderer unchanged
	component_filter.prototype.edit					= render_edit_component_filter.prototype.edit
	component_filter.prototype.search				= render_search_component_filter.prototype.search

	component_filter.prototype.change_mode			= component_common.prototype.change_mode



/**
* BUILD_CHANGED_DATA_ITEM
* Constructs a frozen `changed_data_item` descriptor from a checkbox interaction.
* Shared between edit and search mode so both paths produce an identical object shape
* that `component_common.update_data_value` and `component_common.change_value` can
* consume without branching.
*
* The `action` field is derived directly from the checkbox state:
*   - `checked === true`  → `'insert'`  (add a project assignment)
*   - `checked === false` → `'remove'`  (remove a project assignment)
*
* When removing, the `id` field is resolved by scanning `entries` for an existing row
* whose (`section_id`, `section_tipo`) match the clicked datalist item. This `id` is
* the database primary key required by the server to delete the correct row.
* For inserts, `id` is `null` (the row does not exist yet) and `value` carries the
* locator the server needs to create it.
*
* (!) `entries` must be `self.data.entries || []` — always pass the current entries
* array at the time of the click, not a stale copy, to ensure the correct `id` is found.
*
* @param {boolean} checked        - Current checked state of the toggled checkbox.
* @param {Object}  datalist_value - Locator object from the datalist entry:
*   `{ section_id: string, section_tipo: string, from_component_tipo: string }`.
* @param {Array}   entries        - Current `data.entries` array for the component instance,
*   used to look up the database row `id` for remove operations.
* @returns {Object} Plain object with two keys:
*   - `changed_data_item` {Object} — frozen descriptor
*     `{ action: 'insert'|'remove', id: number|null, value: Object|null }`
*   - `action` {string} — convenience mirror of `changed_data_item.action`
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
* Central change-event handler shared by edit and search modes.
* Called from the checkbox `change` event listener built in `render_edit_component_filter`
* (and re-used by the search view), it unifies the two different persistence paths:
*
* - **Search mode**: calls `update_data_value` to update `self.data` in memory, then
*   publishes the `change_search_element` event so the search bar re-runs the query with
*   the updated project filter without writing anything to the database.
*
* - **Edit mode** (and all other non-search modes): wraps the change in a single-item
*   `changed_data` array, stores it on `self.data.changed_data`, then calls
*   `change_value` with `refresh: false` to persist to the server immediately. The
*   `remove_dialog` callback is overridden to `() => true` so the generic confirmation
*   dialog is suppressed — project deselection confirmation (one-project guard) is
*   handled upstream in the view layer before this method is reached.
*
* (!) `refresh: false` means the component DOM is NOT re-rendered after saving. The
* server recalculates derived value keys server-side; the next full render picks them up.
*
* @param {Object} options
* @param {boolean} options.checked        - Whether the checkbox was checked (true) or
*   unchecked (false) after the change event.
* @param {Object}  options.datalist_value - The locator associated with the toggled item,
*   as stored in the corresponding `datalist` entry's `value` property.
* @returns {Promise<boolean>} Always resolves to `true`.
*/
component_filter.prototype.change_handler = async function(options) {

	const self = this

	// options
		const checked			= options.checked
		const datalist_value	= options.datalist_value

	// build changed_data_item using shared function
		const {changed_data_item} = build_changed_data_item(
			checked,
			datalist_value,
			self.data.entries || []
		)

	if (self.mode==='search') {

		// update the instance data (previous to save)
			self.update_data_value(changed_data_item)

		// publish search. Event to update the DOM elements of the instance
			event_manager.publish('change_search_element', self)

	}else{

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
	}


	return true
}//end change_handler



// @license-end
