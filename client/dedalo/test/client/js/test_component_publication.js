// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert, page_globals */
/*eslint no-undef: "error"*/
'use strict';

import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {response_data} from '../../../core/common/js/api_error.js'



// component_publication configuration
const publication_model		= 'component_publication'
const publication_tipo		= 'test92'
const publication_section	= 'test3'
// Isolation record (manifest.ts SUITE_ISOLATION_RECORDS[13]) — this suite's
// change/remove cases mutate the record's test92 locator directly; record 1 is
// the shared canonical record other suites (the generic component sweeps)
// render and expect at its own value.
const publication_section_id	= 13
const publication_lang		= page_globals?.dedalo_data_nolan ?? 'lg-nolan'

// publication states, as the ontology datalist models them:
// section_id 1 = published (yes), 2 = unpublished (no).
// @see render_edit_component_publication get_content_value
const STATE_PUBLISHED	= 1
const STATE_UNPUBLISHED	= 2

// modes and views to test
const ar_views_edit	= ['default', 'line']
const ar_views_list	= ['default', 'line', 'mini', 'text']

// DOM container
const container = document.getElementById('content')
const component_container = ui.create_dom_element({
	element_type	: 'div',
	class_name		: 'component_container',
	parent			: container
})



/**
* GET_PUBLICATION_INSTANCE
* Creates, builds and returns a component_publication instance
* @param {string} mode - Component mode (edit|list|search)
* @param {string} view - Component view (default|line|mini|text)
* @param {number|string} section_id - Section ID
* @return {Promise<component_publication>} Built instance
*/
async function get_publication_instance(mode, view, section_id) {

	const options = {
		model			: publication_model,
		tipo			: publication_tipo,
		section_tipo	: publication_section,
		section_id		: section_id ?? publication_section_id,
		mode			: mode,
		view			: view,
		lang			: publication_lang,
		id_variant		: mode + '_' + view + '_' + Math.random()
	}

	const instance = await get_instance(options)
	await instance.build(true)

	return instance
}//end get_publication_instance



/**
* GET_ENTRIES
* The component data model is an OBJECT — {entries, datalist, q_operator} —
* never an array. `entries` holds at most one locator (publication is a binary
* switch); `datalist` is the full resolved option list.
* @see component_publication class docblock
* @param {object} instance
* @return {array} Stored locators (empty array when nothing is set)
*/
function get_entries(instance) {

	return instance.data?.entries ?? []
}//end get_entries



/**
* GET_STATE_LOCATOR
* Resolves the locator of a publication state from the component's OWN
* datalist, exactly as the edit switcher does. A synthetic locator (a made-up
* section_id, or the host section_tipo) is refused by the server with
* relation.insert_refused/off_target: test92's ontology target section is the
* publication vocabulary, not `test3`.
* @see render_edit_component_publication get_content_value
* @param {object} instance
* @param {number} state - STATE_PUBLISHED | STATE_UNPUBLISHED
* @return {object} Locator value posted verbatim to the server
*/
function get_state_locator(instance, state) {

	const datalist	= instance.data?.datalist ?? []
	const option	= datalist.find(el => el.section_id==state)

	assert.ok(option, `datalist must offer the publication state ${state}`)

	return option.value
}//end get_state_locator



/**
* SET_PUBLICATION_STATE
* Saves a publication state through the exact path the switcher uses: action
* 'update', id recovered from the current entry (null when never saved).
* @param {object} instance
* @param {number} state - STATE_PUBLISHED | STATE_UNPUBLISHED
* @return {Promise<object|false>} The api_response of the save
*/
async function set_publication_state(instance, state) {

	const entries = get_entries(instance)

	const changed_data = [Object.freeze({
		action	: 'update',
		id		: entries[0]?.id ?? null,
		value	: get_state_locator(instance, state)
	})]

	return await instance.change_value({
		changed_data	: changed_data,
		refresh			: false
	})
}//end set_publication_state



/**
* CLEANUP_PUBLICATION_RECORD
* Removes every test92 locator from the working record, returning it to its
* zero-value baseline so the shared record never carries a state this suite set.
* @param {number|string} [section_id=publication_section_id] - Target record
* @return {Promise<void>}
*/
async function cleanup_publication_record(section_id) {

	const instance	= await get_publication_instance('edit', 'default', section_id ?? publication_section_id)
	const entries	= get_entries(instance)

	if (entries.length > 0) {
		const changed_data = entries.map(el => Object.freeze({
			action	: 'remove',
			id		: el.id ?? null,
			value	: null
		}))
		await instance.change_value({
			changed_data	: changed_data,
			refresh			: false,
			remove_dialog	: () => true
		})
	}

	await instance.destroy(true, true, true)
}//end cleanup_publication_record



// ─────────────────────────────────────────────
// 1. LIFECYCLE: INIT → BUILD → RENDER → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION LIFECYCLE`, async function() {

	this.timeout(30000)



	// ─── INIT ──────────────────────────────────

	describe(`INIT`, function() {

		it(`${publication_model} init in edit mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'init_edit_' + Math.random()
			}

			const instance = await get_instance(options)

			// asserts
			assert.equal(instance.status, 'initialized', 'status must be initialized')
			assert.equal(instance.model, publication_model)
			assert.equal(instance.tipo, publication_tipo)
			assert.equal(instance.section_tipo, publication_section)
			assert.equal(instance.mode, 'edit')
			assert.equal(instance.context, null)
			assert.equal(instance.node, null)
			assert.equal(instance.active, false)
			assert.equal(instance.is_data_changed, false)

			// cleanup
			await instance.destroy(true, true, true)
		})

		it(`${publication_model} init in list mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'list',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'init_list_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'list')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} init in search mode`, async function() {

			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'search',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'init_search_' + Math.random()
			}

			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized')
			assert.equal(instance.mode, 'search')

			await instance.destroy(true, true, true)
		})
	})//end describe INIT



	// ─── BUILD ──────────────────────────────────

	describe(`BUILD`, function() {

		it(`${publication_model} build with autoload=true`, async function() {

			const instance = await get_publication_instance('edit', 'default')

			// asserts
			assert.equal(instance.status, 'built', 'status must be built')
			assert.notEqual(instance.context, null, 'context must not be null')
			assert.notEqual(instance.data, null, 'data must not be null')
			assert.notEqual(instance.permissions, null, 'permissions must not be null')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} build serves the binary datalist`, async function() {

			const instance = await get_publication_instance('edit', 'default')

			// The switcher resolves the locator it saves from data.datalist; without
			// both states the toggle can only ever save undefined.
			const datalist = instance.data?.datalist ?? []
			assert.ok(Array.isArray(datalist), 'data.datalist must be an array')
			assert.ok(
				datalist.some(el => el.section_id==STATE_PUBLISHED),
				'datalist must carry the published option (section_id 1)'
			)
			assert.ok(
				datalist.some(el => el.section_id==STATE_UNPUBLISHED),
				'datalist must carry the unpublished option (section_id 2)'
			)

			// entries is the stored-locator array, and publication is binary
			const entries = get_entries(instance)
			assert.ok(Array.isArray(entries), 'data.entries must be an array')
			assert.ok(entries.length <= 1, 'publication holds at most one locator')

			await instance.destroy(true, true, true)
		})
	})//end describe BUILD



	// ─── RENDER (all modes and views) ────────────

	describe(`RENDER`, function() {

		// Edit mode views
		for (let i = 0; i < ar_views_edit.length; i++) {
			const view = ar_views_edit[i]

			it(`${publication_model} render edit/${view}`, async function() {

				const instance = await get_publication_instance('edit', view)
				const node = await instance.render()

				// asserts
				assert.equal(instance.status, 'rendered', `status must be rendered for edit/${view}`)
				assert.notEqual(node, null, `node must not be null for edit/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// List mode views
		for (let i = 0; i < ar_views_list.length; i++) {
			const view = ar_views_list[i]

			it(`${publication_model} render list/${view}`, async function() {

				const instance = await get_publication_instance('list', view)
				const node = await instance.render()

				assert.equal(instance.status, 'rendered', `status must be rendered for list/${view}`)
				assert.notEqual(node, null, `node must not be null for list/${view}`)

				await instance.destroy(true, true, true)
			})
		}

		// Search mode
		it(`${publication_model} render search/default`, async function() {

			const instance = await get_publication_instance('search', 'default')
			const node = await instance.render()

			assert.equal(instance.status, 'rendered')
			assert.notEqual(node, null)

			await instance.destroy(true, true, true)
		})
	})//end describe RENDER



	// ─── DESTROY ──────────────────────────────────

	describe(`DESTROY`, function() {

		it(`${publication_model} destroy after full lifecycle`, async function() {

			const instance = await get_publication_instance('edit', 'default')
			await instance.render()

			// destroy
			const destroy_result = await instance.destroy(
				true,  // delete_self
				true,  // delete_dependencies
				true   // remove_dom
			)

			// asserts
			assert.equal(destroy_result.delete_self, true, 'delete_self must be true')
			assert.equal(destroy_result.delete_dependencies, true, 'delete_dependencies must be true')
			assert.equal(instance.status, 'destroyed', 'status must be destroyed')
			assert.deepEqual(instance.ar_instances, [], 'ar_instances must be empty')
			assert.equal(instance.node, null, 'node must be null after destroy')
			assert.deepEqual(instance.events_tokens, [], 'events_tokens must be empty')
		})

		it(`${publication_model} destroy without removing DOM`, async function() {

			const instance = await get_publication_instance('edit', 'default')
			await instance.render()

			const destroy_result = await instance.destroy(
				true,  // delete_self
				true,  // delete_dependencies
				false  // remove_dom = false
			)

			assert.equal(destroy_result.delete_self, true)
			assert.equal(instance.status, 'destroyed')
			// node may still exist in DOM since remove_dom=false
		})
	})//end describe DESTROY

})//end describe COMPONENT_PUBLICATION LIFECYCLE



// ─────────────────────────────────────────────
// 2. DATA OPERATIONS: SET / CHANGE / REMOVE
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION DATA OPERATIONS`, async function() {

	this.timeout(30000)

	// Teardown: these cases write a real publication state on the isolation
	// record; clear it so the binary switch is back at its zero-value baseline.
	after(async function() {
		this.timeout(30000)
		await cleanup_publication_record()
	})



	// ─── SET DATA (change_value) ─────────────────

	describe(`SET DATA`, function() {

		it(`${publication_model} set published state via change_value`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			const api_response = await set_publication_state(instance, STATE_PUBLISHED)

			// asserts
			assert.notEqual(api_response, null, 'api_response must not be null')
			assert.notEqual(response_data(api_response), null, 'the api_response payload must not be null')

			const entries = get_entries(instance)
			assert.equal(entries.length, 1, 'publication must hold exactly one locator')
			assert.equal(entries[0].section_id, STATE_PUBLISHED, 'the stored locator must be the published option')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler saves the state in edit mode`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			const locator	= get_state_locator(instance, STATE_UNPUBLISHED)
			const entries	= get_entries(instance)
			const result	= await instance.change_handler({
				value	: locator,
				action	: 'update',
				index	: 0
			})

			// asserts. change_handler answers true unconditionally, so the state
			// it left behind — not its return value — is what proves the save.
			assert.equal(result, true, 'change_handler must return true')

			const entries_after = get_entries(instance)
			assert.equal(entries_after.length, 1, 'publication must hold exactly one locator')
			assert.equal(entries_after[0].section_id, STATE_UNPUBLISHED, 'the stored locator must be the unpublished option')
			assert.equal(entries_after.length, Math.max(entries.length, 1), 'a toggle must replace, never accumulate')

			await instance.destroy(true, true, true)
		})

		it(`${publication_model} change_handler in search mode does not save`, async function() {

			// the stored state, read before the search-mode change, is the witness
			const before		= await get_publication_instance('edit', 'default', publication_section_id)
			const stored_before	= get_entries(before).map(el => el.section_id)
			await before.destroy(true, true, true)

			const instance = await get_publication_instance('search', 'default', publication_section_id)
			await instance.render()

			const locator	= get_state_locator(instance, STATE_PUBLISHED)
			const result	= await instance.change_handler({
				value	: locator,
				action	: 'update',
				index	: 0
			})

			// asserts — search mode updates the in-memory data only
			assert.equal(result, true, 'change_handler must return true in search mode')

			const entries = get_entries(instance)
			assert.equal(entries.length, 1, 'search data must carry the selected option')
			assert.equal(entries[0].section_id, STATE_PUBLISHED, 'search data must carry the published option')

			await instance.destroy(true, true, true)

			// the search selection must NOT have reached the record
			const check		= await get_publication_instance('edit', 'default', publication_section_id)
			const stored	= get_entries(check).map(el => el.section_id)
			assert.deepEqual(stored, stored_before, 'a search-mode change must not be persisted')
			await check.destroy(true, true, true)
		})
	})//end describe SET DATA



	// ─── REMOVE DATA (change_value with remove) ─────

	describe(`REMOVE DATA`, function() {

		it(`${publication_model} remove locator via change_value`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// ensure there is something to remove
			await set_publication_state(instance, STATE_PUBLISHED)

			const entries = get_entries(instance)
			assert.equal(entries.length, 1, 'setup: the state must be set before removing it')

			// remove using change_value
			const changed_data = [Object.freeze({
				action	: 'remove',
				id		: entries[0].id ?? null,
				value	: null
			})]

			const api_response = await instance.change_value({
				changed_data	: changed_data,
				refresh			: false,
				remove_dialog	: () => true
			})

			// asserts
			assert.notEqual(api_response, null, 'api_response must not be null on remove')
			assert.notEqual(api_response, false, 'the remove dialog must not have cancelled the remove')
			assert.equal(get_entries(instance).length, 0, 'the locator must be gone after remove')

			await instance.destroy(true, true, true)

			// and it must be gone on the record, not only in memory
			const check = await get_publication_instance('edit', 'default', publication_section_id)
			assert.equal(get_entries(check).length, 0, 'the removed locator must not come back from the server')
			await check.destroy(true, true, true)
		})

		it(`${publication_model} change_handler with remove action (search mode)`, async function() {

			// The ONLY caller of change_handler's remove branch is the search
			// render's radio uncheck (render_search_component_publication:257).
			// Search mode never reaches change_value, so no remove_dialog is
			// involved; the edit remove path is covered above through
			// change_value, which takes the dialog as an argument. change_handler
			// takes none, so exercising its EDIT remove branch would raise the
			// client's native confirm() — a modal the suite must not depend on.
			const instance = await get_publication_instance('search', 'default', publication_section_id)
			await instance.render()

			// stage a selection, then unselect it
			await instance.change_handler({
				value	: get_state_locator(instance, STATE_PUBLISHED),
				action	: 'update',
				index	: 0
			})
			assert.equal(get_entries(instance).length, 1, 'setup: the option must be staged before removing it')

			const result = await instance.change_handler({
				value	: null,
				action	: 'remove',
				index	: 0
			})

			assert.equal(result, true, 'change_handler remove must return true')
			assert.equal(get_entries(instance).length, 0, 'the staged option must be gone after change_handler remove')

			await instance.destroy(true, true, true)
		})
	})//end describe REMOVE DATA



	// ─── CHANGE DATA (toggle) ─────────────────────

	describe(`CHANGE DATA`, function() {

		it(`${publication_model} toggling the state replaces the locator`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)
			await instance.render()

			// published…
			await set_publication_state(instance, STATE_PUBLISHED)
			assert.equal(get_entries(instance)[0]?.section_id, STATE_PUBLISHED, 'setup: must be published')

			// …then unpublished, through the same update path
			const api_response = await set_publication_state(instance, STATE_UNPUBLISHED)

			assert.notEqual(api_response, null, 'api_response must not be null on update')
			assert.notEqual(response_data(api_response), null, 'the api_response payload must not be null on update')

			const entries = get_entries(instance)
			assert.equal(entries.length, 1, 'the binary switch must never hold two locators')
			assert.equal(entries[0].section_id, STATE_UNPUBLISHED, 'the locator must be the unpublished option')

			await instance.destroy(true, true, true)
		})
	})//end describe CHANGE DATA

})//end describe COMPONENT_PUBLICATION DATA OPERATIONS



// ─────────────────────────────────────────────
// 3. PUBLICATION-SPECIFIC METHODS
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION SPECIFIC METHODS`, async function() {

	this.timeout(30000)



	// ─── GET_VALUE ───────────────────────────────

	describe(`GET_VALUE`, function() {

		it(`${publication_model} get_value returns data.entries`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const result = instance.get_value()

			assert.ok(Array.isArray(result), 'get_value must return the entries array')
			assert.equal(result, instance.data.entries, 'get_value must return data.entries itself')

			await instance.destroy(true, true, true)
		})
	})//end describe GET_VALUE



	// ─── SET_VALUE ───────────────────────────────

	describe(`SET_VALUE`, function() {

		it(`${publication_model} set_value updates data (in memory, no save)`, async function() {

			const instance = await get_publication_instance('edit', 'default', publication_section_id)

			const locator	= get_state_locator(instance, STATE_PUBLISHED)
			const result	= instance.set_value([locator])

			assert.equal(result, true, 'set_value must return true')
			assert.deepEqual(instance.get_value(), [locator], 'set_value must round-trip through get_value')

			// set_value writes only the in-memory model — the record is untouched
			await instance.destroy(true, true, true)

			const check = await get_publication_instance('edit', 'default', publication_section_id)
			assert.equal(get_entries(check).length, 0, 'set_value must not have persisted anything')
			await check.destroy(true, true, true)
		})
	})//end describe SET_VALUE

})//end describe COMPONENT_PUBLICATION SPECIFIC METHODS



// ─────────────────────────────────────────────
// 4. FULL LIFECYCLE: CREATE → SET → CHANGE → REMOVE → DESTROY
// ─────────────────────────────────────────────

describe(`COMPONENT_PUBLICATION FULL LIFECYCLE`, async function() {

	this.timeout(60000)

	// Teardown: the complete-lifecycle case writes a real publication state;
	// clear the record back to its zero-value baseline.
	after(async function() {
		this.timeout(30000)
		await cleanup_publication_record()
	})

	it(`${publication_model} complete lifecycle: init → build → render → set → change → remove → destroy`, async function() {

		// INIT
			const options = {
				model			: publication_model,
				tipo			: publication_tipo,
				section_tipo	: publication_section,
				section_id		: publication_section_id,
				mode			: 'edit',
				view			: 'default',
				lang			: publication_lang,
				id_variant		: 'full_lifecycle_' + Math.random()
			}
			const instance = await get_instance(options)

			assert.equal(instance.status, 'initialized', 'INIT: status must be initialized')
			assert.equal(instance.model, publication_model, 'INIT: model must match')

		// BUILD
			await instance.build(true)

			assert.equal(instance.status, 'built', 'BUILD: status must be built')
			assert.notEqual(instance.context, null, 'BUILD: context must not be null')
			assert.notEqual(instance.data, null, 'BUILD: data must not be null')

		// RENDER
			const node = await instance.render()

			assert.equal(instance.status, 'rendered', 'RENDER: status must be rendered')
			assert.notEqual(node, null, 'RENDER: node must not be null')

		// SET DATA — publish
			const set_resp = await set_publication_state(instance, STATE_PUBLISHED)

			assert.notEqual(set_resp, null, 'SET: api_response must not be null')
			assert.notEqual(response_data(set_resp), null, 'SET: the api_response payload must not be null')
			assert.equal(get_entries(instance)[0]?.section_id, STATE_PUBLISHED, 'SET: must be published')

		// CHANGE DATA — unpublish
			const change_resp = await set_publication_state(instance, STATE_UNPUBLISHED)

			assert.notEqual(change_resp, null, 'CHANGE: api_response must not be null')
			assert.equal(get_entries(instance).length, 1, 'CHANGE: must hold exactly one locator')
			assert.equal(get_entries(instance)[0].section_id, STATE_UNPUBLISHED, 'CHANGE: must be unpublished')

		// GET_VALUE
			const value = instance.get_value()
			assert.ok(Array.isArray(value), 'GET_VALUE: must return the entries array')

		// REMOVE DATA
			const remove_target = get_entries(instance)[0]
			const remove_resp = await instance.change_value({
				changed_data	: [Object.freeze({
					action	: 'remove',
					id		: remove_target.id ?? null,
					value	: null
				})],
				refresh			: false,
				remove_dialog	: () => true
			})

			assert.notEqual(remove_resp, null, 'REMOVE: api_response must not be null')
			assert.notEqual(remove_resp, false, 'REMOVE: the dialog must not have cancelled the remove')
			assert.equal(get_entries(instance).length, 0, 'REMOVE: no locator must remain')

		// DESTROY
			const destroy_result = await instance.destroy(true, true, true)

			assert.equal(destroy_result.delete_self, true, 'DESTROY: delete_self must be true')
			assert.equal(instance.status, 'destroyed', 'DESTROY: status must be destroyed')
			assert.equal(instance.node, null, 'DESTROY: node must be null')
			assert.deepEqual(instance.events_tokens, [], 'DESTROY: events_tokens must be empty')
	})



	it(`${publication_model} lifecycle in all modes`, async function() {

		// Test lifecycle in edit mode
			let instance = await get_publication_instance('edit', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'edit mode must render')
			await instance.destroy(true, true, true)

		// Test lifecycle in list mode
			instance = await get_publication_instance('list', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'list mode must render')
			await instance.destroy(true, true, true)

		// Test lifecycle in search mode
			instance = await get_publication_instance('search', 'default')
			await instance.render()
			assert.equal(instance.status, 'rendered', 'search mode must render')
			await instance.destroy(true, true, true)
	})



	it(`${publication_model} lifecycle in all views`, async function() {

		// Test all edit views
			for (const view of ar_views_edit) {
				const instance = await get_publication_instance('edit', view)
				await instance.render()
				assert.equal(instance.status, 'rendered', `edit/${view} must render`)
				await instance.destroy(true, true, true)
			}

		// Test all list views
			for (const view of ar_views_list) {
				const instance = await get_publication_instance('list', view)
				await instance.render()
				assert.equal(instance.status, 'rendered', `list/${view} must render`)
				await instance.destroy(true, true, true)
			}
	})

})//end describe COMPONENT_PUBLICATION FULL LIFECYCLE



// @license-end
