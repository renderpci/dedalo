// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_PUBLICATION
* Client-side controller for the publication-state component.
*
* `component_publication` renders a toggle that records whether a given record
* has been approved for public diffusion. Each state (published / unpublished)
* is modelled as a locator pointing at a record in a controlled vocabulary
* section (typically two entries: "published" and "unpublished"), so the
* component behaves like a specialised single-select relation whose datalist
* is always exactly two items long.
*
* Responsibilities:
* - Holds per-instance identity properties (tipo, section_tipo, section_id,
*   mode, lang, etc.) populated by `component_common.prototype.init`.
* - Delegates lifecycle, persistence, and navigation to shared prototype
*   methods from `component_common` and `common`.
* - Dispatches mode-specific rendering to the render_* and view_* modules:
*   edit → toggle switcher UI; list → compact read; search → radio-button pair.
*   The `tm` (Time Machine) mode reuses the list render.
* - Exposes `change_handler` to unify the edit and search change paths, keeping
*   the two flows (immediate `change_value` save vs. in-memory `update_data_value`
*   followed by a `change_search_element` event) in a single, auditable place.
*
* Data shape (runtime `self.data`):
* ```json
* {
*   "entries"  : [{"type":"dd151","section_id":"1","section_tipo":"dd174","from_component_tipo":"rsc20"}],
*   "datalist" : [
*     {"section_id":"1","label":"Published",  "value":{"section_id":"1","section_tipo":"dd174"}},
*     {"section_id":"2","label":"Unpublished","value":{"section_id":"2","section_tipo":"dd174"}}
*   ],
*   "q_operator": null
* }
* ```
* `datalist` is the full resolved option list (all possible states); `entries`
* holds at most one selected locator. `q_operator` is only present in search mode.
* `section_id` in a locator is compared with loose equality (`==`) by convention
* because the value may be a string from JSON and a number from the DOM input.
*
* @see component_common (core/component_common/js/component_common.js)
* @see common (core/common/js/common.js)
* @see render_edit_component_publication (./render_edit_component_publication.js)
* @see render_list_component_publication (./render_list_component_publication.js)
* @see render_search_component_publication (./render_search_component_publication.js)
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_edit_component_publication} from '../../component_publication/js/render_edit_component_publication.js'
	import {render_list_component_publication} from '../../component_publication/js/render_list_component_publication.js'
	import {render_search_component_publication} from '../../component_publication/js/render_search_component_publication.js'



/**
* COMPONENT_PUBLICATION
* Constructor. Declares per-instance state properties that will be populated
* by `component_common.prototype.init` at runtime. All fields default to `null`
* until `init` is called.
*/
export const component_publication = function(){

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
}//end component_publication



/**
* COMMON FUNCTIONS
* Extend component_publication with shared prototype methods from component_common
* and common. Individual prototype assignments are not doc-blocked here; the
* documentation for each method lives at its definition in the source module.
*/
// prototypes assign
	component_publication.prototype.init				= component_common.prototype.init
	component_publication.prototype.build				= component_common.prototype.build
	component_publication.prototype.render				= common.prototype.render
	component_publication.prototype.destroy				= common.prototype.destroy
	component_publication.prototype.refresh				= common.prototype.refresh
	component_publication.prototype.save				= component_common.prototype.save
	component_publication.prototype.load_data			= component_common.prototype.load_data
	component_publication.prototype.get_value			= component_common.prototype.get_value
	component_publication.prototype.set_value			= component_common.prototype.set_value
	component_publication.prototype.update_data_value	= component_common.prototype.update_data_value
	component_publication.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_publication.prototype.update_datum		= component_common.prototype.update_datum
	component_publication.prototype.change_value		= component_common.prototype.change_value
	component_publication.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_publication.prototype.list				= render_list_component_publication.prototype.list
	component_publication.prototype.tm					= render_list_component_publication.prototype.list // Time Machine reuses list render
	component_publication.prototype.search				= render_search_component_publication.prototype.search
	component_publication.prototype.edit				= render_edit_component_publication.prototype.edit

	component_publication.prototype.change_mode			= component_common.prototype.change_mode



/**
* CHANGE_HANDLER
* Unified handler for all publication-state changes in both edit and search modes.
*
* Called by every render module (edit switcher, search radio buttons) whenever
* the user selects a new publication state. It branches on `self.mode` to apply
* the appropriate persistence strategy:
*
* - **edit mode**: builds a frozen `changed_data` descriptor and calls
*   `change_value` (inherited from `component_common`) to persist immediately to
*   the server with `refresh: false`. After the save it publishes
*   `'change_publication_value_' + self.id_base` so that sibling components
*   (e.g., a notes tag) can react to the new state without a full refresh.
*   `id_base` is the composite key `section_tipo + '_' + section_id + '_' + tipo`
*   assigned during instance creation in `instances.js`.
*
* - **search mode**: instead of saving, it writes the change into the in-memory
*   data model via `update_data_value` (no server round-trip) and then publishes
*   `'change_search_element'` so the search subsystem can re-evaluate the filter.
*
* `changed_data` is always an array of exactly one frozen descriptor:
* ```json
* [{ "action": "update"|"remove", "id": <number>|null, "value": <locator>|null }]
* ```
* `id` is recovered from `entries[index]` to allow the server to target the
* correct matrix row on update. For a brand-new (never-saved) entry `id` is null.
*
* @param {Object} options - Change descriptor from the render module.
* @param {Object|null} options.value - Locator to set, e.g.
*   `{type:"dd151", section_id:"1", section_tipo:"dd174", from_component_tipo:"rsc20"}`,
*   or `null` for a remove action.
* @param {string} [options.action='update'] - Mutation verb: `'update'` or `'remove'`.
* @param {number} [options.index=0] - Index into `self.data.entries` from which to
*   recover the existing relation `id` for the server round-trip.
* @returns {Promise<boolean>} Resolves to `true` after all async work completes.
*/
component_publication.prototype.change_handler = async function(options) {

	const self = this

	// options
		const value		= options.value
		const action	= options.action || 'update'
		const index		= options.index || 0

	// build changed_data based on mode
		const entries	= self.data.entries || []
		const changed_data = [Object.freeze({
			action	: action,
			id		: entries[index]?.id || null,
			value	: value
		})]

	if (self.mode==='search') {

		// update the instance data (previous to save)
		self.update_data_value(changed_data[0])

		// publish search. Event to update the DOM elements of the instance
		event_manager.publish('change_search_element', self)

	}else{

		// force to save on every change
		await self.change_value({
			changed_data	: changed_data,
			refresh			: false
		})

		// publish the publication locator value. (ex: used to change state of notes tag)
		event_manager.publish('change_publication_value_'+self.id_base, value)
	}


	return true
}//end change_handler



// @license-end
