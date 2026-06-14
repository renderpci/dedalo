// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_radio_button} from './render_edit_component_radio_button.js'
	import {render_list_component_radio_button} from './render_list_component_radio_button.js'
	import {render_search_component_radio_button} from './render_search_component_radio_button.js'
	import {clone} from '../../common/js/utils/index.js'



/**
* COMPONENT_RADIO_BUTTON
* Single-choice component backed by a server-supplied datalist of locator values.
*
* The component stores at most one entry at a time (radio-button semantics).
* Each entry is a locator object {section_id, section_tipo, id?} that references
* a row in the configured target section.  The display label is resolved from
* self.data.datalist at render time.
*
* Responsibilities:
* - Declare the instance property skeleton shared by all render modes.
* - Delegate lifecycle, persistence, and render to component_common / common
*   prototypes via the prototype-assignment block below.
* - Export the two shared helpers (build_changed_data_item, handle_radio_change)
*   used by render_edit and render_search views so that the changed-data shape is
*   always constructed in one place.
*
* Data shapes (set by component_common.init before render):
*   self.data = {
*     entries  : Array<{section_id: number, section_tipo: string, id?: number}>,
*     datalist : Array<{label: string, section_id: string, value: {section_id: string, section_tipo: string, ...}}>,
*     q_operator?: string   // search mode only
*   }
*   self.context = { view?: string, target_sections?: Array, ... }
*
* Modes / views:
*   edit   → render_edit_component_radio_button (views: default, line, rating, print)
*   list   → render_list_component_radio_button (views: default, mini, text)
*   tm     → same as list (thesaurus-matrix reuse)
*   search → render_search_component_radio_button
*/
export const component_radio_button = function(){

	this.id

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

	// ui
	this.minimum_width_px = 90 // integer pixels
}//end component_radio_button



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_radio_button.prototype.init				= component_common.prototype.init
	component_radio_button.prototype.build				= component_common.prototype.build
	component_radio_button.prototype.render				= common.prototype.render
	component_radio_button.prototype.refresh			= common.prototype.refresh
	component_radio_button.prototype.destroy			= common.prototype.destroy

	// change data
	component_radio_button.prototype.save				= component_common.prototype.save
	component_radio_button.prototype.update_data_value	= component_common.prototype.update_data_value
	component_radio_button.prototype.update_datum		= component_common.prototype.update_datum
	component_radio_button.prototype.change_value		= component_common.prototype.change_value
	component_radio_button.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_radio_button.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_radio_button.prototype.list				= render_list_component_radio_button.prototype.list
	component_radio_button.prototype.tm					= render_list_component_radio_button.prototype.list
	component_radio_button.prototype.edit				= render_edit_component_radio_button.prototype.edit
	component_radio_button.prototype.search				= render_search_component_radio_button.prototype.search

	component_radio_button.prototype.change_mode		= component_common.prototype.change_mode



/**
* GET_CHECKED_VALUE_LABEL
* Returns the display label of the currently selected radio option by looking
* up the first entry's section_id in self.data.datalist.
*
* Returns an empty string when the component has no value (entries is empty,
* undefined, or its first element is null/undefined).
*
* (!) Accesses self.data.datalist[checked_key].label without guarding against
* checked_key === -1 (findIndex not found).  If datalist and entries become
* de-synced the call will throw a TypeError.  The caller (get_buttons reset
* handler) should only invoke this when entries.length > 0.
*
* @returns {string} Human-readable label of the checked datalist item, or ''
*/
component_radio_button.prototype.get_checked_value_label = function() {

	const self = this

	if (!self.data.entries || typeof self.data.entries[0]==='undefined' || self.data.entries[0]===null) {
		return ''
	}

	const checked_key = self.data.datalist.findIndex( (item) => {
		return (item.section_id===self.data.entries[0]?.section_id)
	})

	const label = self.data.datalist[checked_key].label

	return label
}//end get_checked_value_label



/**
* FOCUS_FIRST_INPUT
* Captures ui.component.activate calls
* to prevent default behavior
* @returns {boolean} Always true — signals that activation is handled externally
*/
component_radio_button.prototype.focus_first_input = function() {

	return true
}//end focus_first_input



/**
* BUILD_CHANGED_DATA_ITEM
* Clones the datalist value, adds the entry id to it, and builds a frozen changed_data_item object.
* Used by edit views (via handle_radio_change) and search view (directly).
*
* The returned changed_data_item follows the standard Dédalo changed-data contract:
*   { action: 'update'|'remove', id: number|null, value: Object|null }
*
* Cloning datalist_value ensures that the shared datalist reference is not mutated
* when the `id` property is injected after the first API save.
*
* When datalist_value is null the action is set to 'remove' and value is null,
* which signals the persistence layer to delete the current entry.
*
* @param {Object|null} datalist_value - Locator value from datalist ({section_id, section_tipo, ...}),
*   or null to build a 'remove' action
* @param {number|null} id - Database entry id from data.entries[0].id; null for new (unsaved) entries
* @returns {{changed_data_item: Object, parsed_value: Object|null}} Frozen changed_data_item and
*   the cloned+merged value (parsed_value) ready to optimistically update local state
*/
export const build_changed_data_item = function(datalist_value, id=null) {

	// clone datalist_value to avoid mutating the original
	// and add id to the value if available
	const parsed_value = (datalist_value != null)
		? { ...clone(datalist_value), ...(id ? { id: id } : {}) }
		: null

	// build changed_data_item
	const changed_data_item = Object.freeze({
		action	: (parsed_value != null) ? 'update' : 'remove',
		id		: id,
		value	: parsed_value
	})

	return {
		changed_data_item	: changed_data_item,
		parsed_value		: parsed_value
	}
}//end build_changed_data_item



/**
* HANDLE_RADIO_CHANGE
* Common change handler for component_radio_button across all edit views.
* Resolves id dynamically from self.data (not from stale closure),
* builds changed_data_item, sets changed_data, and saves via change_value.
*
* The id is resolved from self.data.entries[0].id rather than from a closure
* because the component may have been empty when the closure was created (id
* would be null), but a prior save in the same session may have assigned a
* database id to the entry.  Refreshing from self.data ensures the correct id
* is always used on subsequent changes without forcing a full component refresh.
*
* change_value is called with refresh:false to avoid a round-trip re-render
* after each keystroke/click; the DOM state is updated locally instead.
*
* @param {Object} self - Component instance (component_radio_button)
* @param {Object|null} datalist_value - The locator value from datalist for the chosen option,
*   or null when clearing the selection
* @param {number|null} id - Entry id from data; if null, resolved from self.data at call time
* @returns {Promise<Object|null>} The cloned+id-merged value that was saved, or null on 'remove'
*/
export const handle_radio_change = async function(self, datalist_value, id=null) {

	// resolve id from current data if not provided
	// (when component was initially empty, the closure id is null,
	// but after first save the entry gets an id from the API)
	if (id === null) {
		id = self.data.entries?.[0]?.id ?? null
	}

	// build changed_data_item (clone value + add id + freeze)
	const {changed_data_item, parsed_value} = build_changed_data_item(datalist_value, id)

	// fix instance changed_data
	self.set_changed_data(changed_data_item)

	// force to save on every change
	await self.change_value({
		changed_data	: [changed_data_item],
		refresh			: false,
		remove_dialog	: false
	})

	return parsed_value
}//end handle_radio_change



// @license-end
