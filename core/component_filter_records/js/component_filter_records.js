// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/

/**
* COMPONENT_FILTER_RECORDS
* Client-side entry point for the record-level access-control component (dd_filter_records).
*
* This component is used exclusively in the User section (dd128) to restrict which individual
* records a user may access across arbitrary sections — complementing project-based filtering
* (component_filter) with finer-grained, per-record access lists.
*
* Architecture overview:
* - The constructor `component_filter_records` is a standard Dédalo prototype-assignment module.
*   All business logic is delegated to `component_common` / `common` prototypes, with
*   render methods coming from the three render_* companion modules.
* - `build_changed_data_item` is an exported pure helper consumed by `change_handler` and also
*   available to render modules that construct edit/search change payloads.
*
* Data shape (self.data):
*   {
*     entries  : Array<{ id: number|null, tipo: string, value: Array<number> }>,
*     datalist : Array<{ tipo: string, label: string, value: * }>
*   }
*   Each `entries` item maps a section tipo (e.g. 'oh1') to the list of section_id integers
*   the user is allowed to access. `datalist` drives the rendered input rows.
*
* Main exports: component_filter_records, build_changed_data_item
*
* @module component_filter_records
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_filter_records} from '../../component_filter_records/js/render_edit_component_filter_records.js'
	import {render_list_component_filter_records} from '../../component_filter_records/js/render_list_component_filter_records.js'
	import {render_search_component_filter_records} from '../../component_filter_records/js/render_search_component_filter_records.js'



/**
* COMPONENT_FILTER_RECORDS
* Constructor for the record-level access-control component client instance.
*
* Declares all instance properties to null so that property existence is predictable
* before `init()` populates them from the options bag passed by the framework.
* All initialisation logic lives in `component_common.prototype.init`.
*/
export const component_filter_records = function(){

	this.id				= null

	// element properties declare
	this.model			= null // component model name, e.g. 'component_filter_records'
	this.tipo			= null // ontology tipo of this component instance, e.g. 'dd987'
	this.section_tipo	= null // ontology tipo of the parent section, e.g. 'dd128'
	this.section_id		= null // record identifier within the parent section
	this.mode			= null // rendering mode: 'edit' | 'list' | 'search' | 'tm'
	this.lang			= null // active UI language code, e.g. 'lg-nolan'

	this.section_lang	= null // language code of the section's primary text content
	this.context		= null // server-supplied context object (ontology props, tools, view, …)
	this.data			= null // server-supplied data object: { entries, datalist }
	this.parent			= null // tipo of the structural parent (section group or portal tipo)
	this.node			= null // live DOM node where this instance is mounted

	this.tools			= null // tool instances attached to this component
}//end component_filter_records



/**
* COMMON FUNCTIONS
* Extend component_filter_records with shared prototype methods from common /
* component_common / render modules.
*
* Lifecycle and data methods come from component_common (handles init, build, save, load_data,
* value mutation, changed-data tracking) and common (render, destroy, refresh, rqo building).
* Render methods are delegated to the three companion render_* modules so that each
* view concern is kept in its own file.
*/
	// prototypes assign
	component_filter_records.prototype.init					= component_common.prototype.init
	component_filter_records.prototype.build				= component_common.prototype.build
	component_filter_records.prototype.render				= common.prototype.render
	component_filter_records.prototype.destroy				= common.prototype.destroy
	component_filter_records.prototype.refresh				= common.prototype.refresh
	component_filter_records.prototype.save					= component_common.prototype.save
	component_filter_records.prototype.load_data			= component_common.prototype.load_data
	component_filter_records.prototype.get_value			= component_common.prototype.get_value
	component_filter_records.prototype.set_value			= component_common.prototype.set_value
	component_filter_records.prototype.update_data_value	= component_common.prototype.update_data_value
	component_filter_records.prototype.update_datum			= component_common.prototype.update_datum
	component_filter_records.prototype.change_value			= component_common.prototype.change_value
	component_filter_records.prototype.set_changed_data		= component_common.prototype.set_changed_data
	component_filter_records.prototype.build_rqo			= common.prototype.build_rqo

	// render — one method per mode; 'tm' reuses the list renderer
	component_filter_records.prototype.list					= render_list_component_filter_records.prototype.list
	component_filter_records.prototype.tm					= render_list_component_filter_records.prototype.list
	component_filter_records.prototype.edit					= render_edit_component_filter_records.prototype.edit
	component_filter_records.prototype.search				= render_search_component_filter_records.prototype.search

	component_filter_records.prototype.change_mode			= component_common.prototype.change_mode



/**
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen `changed_data_item` descriptor from a processed value and its section tipo.
*
* This is a **pure exported helper** shared between `change_handler` (edit and search modes)
* and any render module that needs to construct a change payload without going through the
* full `change_handler` flow.
*
* The `action` field follows the Dédalo component_common convention:
*   - 'update'  when a non-null value is provided (create or overwrite the entry)
*   - 'remove'  when value is null (delete the existing entry)
*
* The `id` field is resolved from `entries` by matching `tipo`. If no existing entry is
* found (i.e. this is a new value for that tipo), `id` is left as null — `component_common`
* will treat null id as an insert.
*
* The returned `changed_data_item` is frozen so callers cannot accidentally mutate it before
* it reaches `update_data_value` or `change_value`.
*
* @param {string} tipo - Ontology tipo of the target section entry (e.g. 'oh1')
* @param {Object|null} value - Processed value object `{ tipo, value: Array<number> }`, or
*   null to signal removal of the existing entry for this tipo
* @param {Array} entries - Current `self.data.entries` array used to look up the existing
*   entry id; may be empty or omitted (defaults to [])
* @returns {Object} Plain object `{ changed_data_item: Object, action: string }` where
*   `changed_data_item` is a frozen `{ action, id, value }` ready for `update_data_value`
*/
export const build_changed_data_item = function(tipo, value, entries) {

	const action = (value===null) ? 'remove' : 'update'

	// find entry id by tipo
	// Walk entries linearly; the list is short (one entry per authorised section).
	// `entry_id` stays null for new entries — component_common treats null id as insert.
		const current_entries	= entries || []
		const entries_length	= current_entries.length
		let entry_id			= null
		for (let i = 0; i < entries_length; i++) {
			if (current_entries[i].tipo===tipo) {
				entry_id = current_entries[i].id
				break
			}
		}

	const changed_data_item = Object.freeze({
		action	: action,
		id		: entry_id,
		value	: value
	})

	return {
		changed_data_item	: changed_data_item,
		action				: action
	}
}//end build_changed_data_item



/**
* CHANGE_HANDLER
* Central handler for every user input change on this component, shared between
* edit and search rendering modes.
*
* Responsibilities:
*   1. Parse the raw comma-separated string from the DOM input into a structured value object.
*   2. Validate numeric section-ids (edit mode only; search mode passes raw strings through).
*   3. Build a frozen `changed_data_item` via `build_changed_data_item`.
*   4. In **search mode**: update the instance data and publish 'change_search_element' so
*      every DOM subscriber re-renders the active filter state.
*   5. In **edit mode**: persist immediately via `change_value` (refresh:false to avoid
*      a full re-render) and write the normalised value back to the input node so the
*      displayed value matches what was actually saved.
*
* Called from delegated `change` event listeners registered by the render_search and
* render_edit companion modules.
*
* @param {Object} options
* @param {string} options.value - Raw comma-separated string from the DOM input (may be empty)
* @param {string} options.tipo - Ontology tipo of the datalist row being changed (e.g. 'oh1')
* @param {HTMLElement|null} [options.input_node] - The input element; used in edit mode to
*   write the sanitised value back after save. Not required in search mode.
* @returns {Promise<boolean>} Resolves to true once all async side effects have completed
*/
component_filter_records.prototype.change_handler = async function(options) {

	const self = this

	// options
		const raw_value		= options.value		// raw string from input
		const tipo			= options.tipo
		const input_node	= options.input_node || null

	// process value based on mode
	// In search mode the raw tokens are kept as strings because the server-side
	// conform_filter will coerce them; in edit mode we validate and deduplicate
	// so that only positive integers reach the database.
		const value = (raw_value.length>0)
			? {
				tipo	: tipo,
				value	: self.mode==='search'
					? raw_value.split(',')
					: self.validate_value(raw_value.split(','))
			  }
			: null

	// build changed_data_item using shared function
		const {changed_data_item} = build_changed_data_item(
			tipo,
			value,
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

		// force to save on every change
		// (!) refresh:false prevents a full server round-trip render; we manually
		// synchronise the input value below instead of relying on a re-render.
			await self.change_value({
				changed_data	: changed_data,
				refresh		: false
			})

		// update safe value in input text
		// Write the sanitised array back to the DOM so the displayed value matches
		// what was actually stored (removes duplicates and non-integer tokens).
			if (value && input_node) {
				input_node.value = value.value.join(',')
			}
	}

	return true
}//end change_handler



/**
* VALIDATE_VALUE
* Sanitises an array of raw string tokens into a deduplicated list of positive integers
* suitable for storing as section-id access-control entries.
*
* Rules applied to each token:
*   - `parseInt` coerces the token; non-numeric tokens produce NaN and are discarded.
*   - Zero and negative numbers are discarded (section_id must be >= 1).
*   - Duplicate values (same integer appearing more than once) are discarded.
*
* Called in edit mode only. Search mode skips validation and passes raw strings directly
* to the server-side conform_filter gate.
*
* @param {Array} value - Array of raw string tokens split from the comma-separated input,
*   e.g. ['1', '5', '8', 'foo', '5'] → [1, 5, 8]
* @returns {Array<number>} Deduplicated array of positive integer section ids; empty array
*   when the input is empty or all tokens are invalid
*/
component_filter_records.prototype.validate_value = (value) => {

	const safe_values  = []

	if (value && value.length>0) {

		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			const current_number = parseInt(value[i])
			// if value is valid number and not already included, push it to safe values array
			if (!isNaN(current_number) && current_number>0 && !safe_values.includes(current_number)) {
				safe_values.push(current_number)
			}
		}
	}

	return safe_values
}//end validate_value



// @license-end
