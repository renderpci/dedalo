// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* MODULE component_dataframe
*
* Client-side extension module for `component_dataframe` — the Dédalo component
* that pairs auxiliary frame records with individual data items of a main component.
*
* On the server, `component_dataframe` is a thin PHP subclass of `component_portal`.
* On the client (this module) it is an **alias** of `component_portal` plus two
* dataframe-specific prototype methods bolted on afterwards:
*
*   - `create_new_section`  — creates a new target frame record and saves the pairing
*                             locator on the current section, obeying the save-then-attach
*                             single-writer rule.
*   - `get_rating`          — resolves the rating value for the first entry of this slot
*                             against the `role:"rating"` ddo defined in the `hide` ddo_map
*                             of the slot's request_config.
*
* All portal behaviour (render, navigation, unlink, instance lifecycle, …) is inherited
* from `component_portal` without modification.
*
* Lower-level dataframe helpers (DATAFRAME_TYPE, get_dataframe, attach_item_dataframe,
* delete_dataframe, …) live in `core/component_common/js/dataframe.js`, not here.
*
* @see docs/core/components/component_dataframe.md for the full specification including
*      the pairing contract, storage shape, lifecycle, and ontology instantiation.
* @see core/component_portal/js/component_portal.js for the full portal prototype.
* @see core/component_common/js/dataframe.js for the pairing-contract helpers.
*/



// imports
	import {component_portal} from '../../component_portal/js/component_portal.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {DATAFRAME_TYPE} from '../../component_common/js/dataframe.js'



// alias of component_portal
	export const component_dataframe = component_portal



// extend modules
	// component_dataframe.prototype.list = render_list_component_dataframe.prototype.list



/**
* CREATE_NEW_SECTION
* Creates a new target frame record in the ontology-defined frame section and
* saves the pairing locator on the current main component, binding the new record
* to the caller's current data item.
*
* **Save-then-attach rule (single-writer, I3).**
* Pairing locators use the item's server-minted `id` as the pairing key (`id_key`).
* Those ids exist only after the main component's data has been persisted.  If the
* caller has unsaved changes (pending `changed_data`) this method saves them first,
* then returns `false` to abort the current attach.  The save triggers a component
* refresh which re-renders the dataframe buttons with the real server-minted item
* ids, so the user can repeat the action on the correctly keyed button.
*
* **Flow:**
*  1. Check caller for unsaved changes; if found, save + refresh + return false.
*  2. Issue a `create` RQO to the server for `target_section_tipo`; the server mints
*     a new section_id and returns it in `api_response.result`.
*  3. Build a pairing locator of type `DATAFRAME_TYPE` with the new section_id and
*     the caller's `id_key` / `main_component_tipo`.
*  4. Wrap the locator in a `changed_data` insert action and call `change_value()` to
*     persist the locator and refresh the component.
*
* The target section tipo is read from `self.request_config_object.sqo.section_tipo[0].tipo`,
* i.e. the first section tipo declared in the slot node's `source.request_config`.
*
* @param {Object} options                         - Method options bag.
* @param {Object} options.data                    - Caller context data (pairing keys for the frame).
* @param {string} options.data.section_id         - `section_id` of the main record (host section).
* @param {string} options.data.section_tipo       - `section_tipo` of the main record.
* @param {string|number} options.data.section_id_key   - Pairing key: the stable server-minted item id of the main component entry being framed.
* @param {string} options.data.section_tipo_key   - `section_tipo` of the main component's host section (legacy key; preserved for dual-read compat).
* @param {string} options.data.main_component_tipo - `tipo` of the main component being framed.
* @param {Array|null} options.data.value          - Current locator value (unused here; reserved for callers that pass it for context).
* @returns {Promise<Object|boolean>} The `api_response` from `change_value()` on success,
*   `false` if pending changes were saved first (re-render required) or if the server
*   did not return a positive `result` (section creation failed).
*/
component_dataframe.prototype.create_new_section = async function(options) {

	const self = this

	const data = options.data || {}

	// save-then-attach (single-writer rule, I3): the pairing key must be a
	// server-minted item id. If the caller (main component) has pending
	// unsaved changes, persist them first and abort this attach: the refresh
	// re-renders the dataframe buttons paired with the real ids, so the user
	// action is repeated on a correctly-keyed button.
	const caller = self.caller
	if (caller?.data?.changed_data?.length) {
		await caller.change_value({
			changed_data	: caller.data.changed_data,
			refresh			: true
		})
		console.warn('create_new_section: caller pending changes were saved first; attach aborted (re-rendered with real item ids). Repeat the action.')
		return false
	}

	const target_section_tipo = self.request_config_object.sqo.section_tipo[0].tipo

	// data_manager. create new section
	const rqo = {
		action	: 'create',
		source	: {
			section_tipo : target_section_tipo
		}
	}
	const api_response = await data_manager.request({
		body : rqo
	})

	// if the server response is OK, it will send the new section_id
	if (api_response.result && api_response.result>0) {

		const section_id = api_response.result

		// Build the pairing locator. `DATAFRAME_TYPE` ('dd490') is the positive marker
		// that distinguishes this entry from ordinary portal relation locators in the
		// same `relations` bag. `from_component_tipo` is the dataframe slot's own tipo
		// (self.tipo); `main_component_tipo` is the component that owns the item being
		// framed; `section_id_key` is the stable item id used as the pairing key.
		// (!) `section_tipo_key` is the legacy alias carried alongside for dual-read
		// compatibility until the 7.0.1 dataframe_v7_migration rewrite runs.
		const locator = {
			type				: DATAFRAME_TYPE,
			section_tipo		: target_section_tipo,
			section_id			: section_id,
			section_id_key		: data.section_id_key,
			section_tipo_key	: data.section_tipo_key,
			main_component_tipo	: data.main_component_tipo,
			from_component_tipo	: self.tipo
		}

		// Wrap the locator in the standard change-data envelope and persist.
		// `id: null` because the locator is new — the server assigns it an id.
		// `Object.freeze` prevents accidental mutation of the pending item before
		// change_value processes it.
		const changed_data = [Object.freeze({
			action	: 'insert',
			id		: null,
			value	: locator
		})]
		const response = await self.change_value({
			changed_data	: changed_data,
			refresh			: true
		})

		return response
	}

	return api_response
}//end  create_new_section



/**
* GET_RATING
* Resolves the rating value for the first frame entry held by this dataframe slot.
*
* A "rating" is a `component_radio_button` ddo whose `role` property is set to
* `"rating"` inside the slot's `request_config.hide.ddo_map`.  The ddo lives in
* `hide` (not `show`) so the rating component is loaded silently for display
* purposes without being surfaced as an interactive field in the frame modal.
*
* The resolved value is the datum entry from `self.datum.data` that matches the
* rating ddo's tipo and the first entry's (section_tipo, section_id).  Callers
* (typically the frame-button render view) use the returned datum to read the
* rating's datalist label and colour for painting the button.
*
* Returns `null` when:
*  - No `role:"rating"` ddo exists in the hide ddo_map (slot not configured for rating).
*  - `self.data.entries` is empty (no frame record is attached to this item yet).
*  - No matching datum is found in `self.datum.data` (frame section loaded but rating
*    component has no saved value yet).
*
* (!) `self.datum.data` is the flat relations / data bag loaded by the parent
* section record; it is NOT the dataframe's own data. Filtering by (tipo,
* section_tipo, section_id) is required to scope the lookup to the right frame entry
* among potentially many frames attached to different items in the same record.
*
* @returns {Object|null} The matching datum entry (carrying tipo, section_tipo,
*   section_id, and the rating value), or null if the rating cannot be resolved.
*/
component_dataframe.prototype.get_rating = function() {

	const self = this

	// Look for the rating ddo in the hidden ddo_map of the slot's request_config.
	// Fall back to an empty array so the find() below returns undefined cleanly.
	const ddo_map = self.request_config_object?.hide?.ddo_map || []

	const rating_ddo = ddo_map.find(el => el.role === 'rating')

	if(!rating_ddo){
		return null
	}

	// entries: the array of pairing locators held by this slot for the current item.
	// Only the first entry is used — a single slot holds at most one frame record per item.
	const entries = self.data.entries || []

	if(entries.length >= 1){

		// Use the first entry's (section_tipo, section_id) as the frame target coordinates.
		// The rating component's data lives inside that target section record.
		const locator = entries[0]

		// Scan the parent datum bag for a data entry that:
		//  - belongs to the rating component (rating_ddo.tipo)
		//  - is scoped to this dataframe slot (from_component_tipo === self.tipo)
		//  - belongs to the first frame entry (section_tipo + section_id match)
		const data_rating = self.datum.data.find(el =>
			el.tipo === rating_ddo.tipo
			&& el.from_component_tipo === self.tipo
			&& el.section_tipo === locator.section_tipo
			&& el.section_id === locator.section_id
		)
		return data_rating
	}

	return null
}//end get_rating



// @license-end
