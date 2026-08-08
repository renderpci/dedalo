// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {data_manager} from '../../../core/common/js/data_manager.js'
import {
	build_scoped_sqo,
	render_open_list_with_direct_relations
} from '../../../core/section/js/render_open_list_with_direct_relations.js'



/**
* TEST_OPEN_RELATED_DATA
* The "open relationships" dialog's SQO scoping — the reason the dialog opened
* nothing at all.
*
* The dialog is handed the caller section's CURRENT view SQO. In edit mode that
* SQO is not what either scope means: it carries an auto-generated single-record
* pin (filter_by_locators) AND the record's position inside the found set
* (limit:1 / offset:N, e.g. offset:1 for the 2nd of 3 records). Sent verbatim,
* the pin narrowed the search to one row and the offset then skipped it, so
* read_raw answered with an empty result, no window was opened, and the user was
* told nothing.
*
* The two scopes must therefore DERIVE their SQO, on a clone (the portal caller
* hands over its parent section's live object):
*   current → keep the pin, limit:1 / offset:0
*   found   → drop the pin, limit:0 / offset:0, keep the user's own sqo.filter
*
* No backend: data_manager.request is a method on a shared singleton, so it is
* patched in place to capture the outgoing RQO and answer with an empty result —
* which keeps open_records_in_window (a real section build + window.open) out of
* the way and exercises the empty-result path at the same time.
*/



// make_edit_mode_sqo — exactly what a section in edit mode carries: the
// single-record pin plus the record's position in the found set.
	const make_edit_mode_sqo = () => ({
		section_tipo		: ['test3'],
		limit				: 1,
		offset				: 1,
		filter_by_locators	: [{ section_tipo:'test3', section_id:2 }],
		filter				: { '$and' : [{ q:['x'], path:[{section_tipo:'test3', component_tipo:'test52'}] }] },
		parsed				: false
	})

// make_dialog_options — the inspector's caller shape (target_section mode).
	const make_dialog_options = (sqo) => ({
		target_sections	: [
			{ tipo:'test4', label:'Fake target A' },
			{ tipo:'test5', label:'Fake target B' }
		],
		sqo				: sqo,
		caller_tipo		: null,
		rqo_options		: {
			type			: 'target_section',
			section_tipo	: null,
			tipo			: null,
			model			: 'section'
		},
		label		: 'Fake caller',
		total		: 1,
		self_caller	: null
	})

// with_stubbed_request — patch the shared data_manager, run fn, always restore.
	const with_stubbed_request = async (response, fn) => {
		const original	= data_manager.request
		const captured	= []
		data_manager.request = async (options) => {
			captured.push(options?.body)
			return response
		}
		try {
			await fn(captured)
		} finally {
			data_manager.request = original
		}
		return captured
	}

// with_stubbed_alert — same, for the user-feedback assertions.
	const with_stubbed_alert = async (fn) => {
		const original	= window.alert
		const messages	= []
		window.alert = (msg) => { messages.push(msg) }
		try {
			await fn(messages)
		} finally {
			window.alert = original
		}
		return messages
	}

// drive_dialog — open the dialog, pick a target, confirm. Returns the modal node.
	const drive_dialog = async (options, target_tipo) => {
		render_open_list_with_direct_relations(options)
		const modal = document.querySelector('.open_relations_modal')
		if (!modal) {
			return null
		}
		const target_radio = modal.querySelector(`input[name=target_section][value=${target_tipo}]`)
		target_radio.checked = true
		target_radio.dispatchEvent(new Event('change', {bubbles:true}))
		modal.querySelector('button.success').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
		// let the async open_related_data settle
		await new Promise(resolve => setTimeout(resolve, 300))
		return modal
	}

// cleanup_modals — the dialog closes itself, but a failed assertion can leave one.
	const cleanup_modals = () => {
		document.querySelectorAll('.open_relations_modal').forEach(el => el.remove())
	}



describe(`OPEN_RELATED_DATA`, async () => {

	// THE REGRESSION. The found-set offset must never survive into the
	// current-record scope: the pin already selects exactly one row, so any
	// non-zero offset skips it and the server returns nothing.
	it(`scope 'current' resets the found-set offset and keeps the record pin`, async function() {

		const sqo		= make_edit_mode_sqo()
		const scoped	= build_scoped_sqo(sqo, 'current')

		assert.strictEqual(scoped.offset, 0,
			'the found-set offset would skip the single pinned row')
		assert.strictEqual(scoped.limit, 1)
		assert.deepEqual(scoped.filter_by_locators, sqo.filter_by_locators,
			'the current record pin must survive')
	})

	// 'found' must mean the user's search, not the open record: the pin is the
	// auto-generated single-record one, the real search lives in sqo.filter.
	it(`scope 'found' drops the record pin, keeps the user filter, takes every row`, async function() {

		const sqo		= make_edit_mode_sqo()
		const scoped	= build_scoped_sqo(sqo, 'found')

		assert.deepEqual(scoped.filter_by_locators, [],
			'the single-record pin would silently reduce "all found" to "current"')
		assert.strictEqual(scoped.limit, 0)
		assert.strictEqual(scoped.offset, 0)
		assert.deepEqual(scoped.filter, sqo.filter,
			'the user\'s own search must decide the found set')
	})

	// The portal caller hands over its parent section's LIVE sqo. Re-paginating
	// it would silently move the user's own list.
	it(`the caller's sqo is never mutated`, async function() {

		const sqo		= make_edit_mode_sqo()
		const snapshot	= JSON.stringify(sqo)

		build_scoped_sqo(sqo, 'current')
		build_scoped_sqo(sqo, 'found')

		assert.strictEqual(JSON.stringify(sqo), snapshot)
	})

	// End to end through the dialog: what actually goes on the wire.
	it(`the dialog sends the SCOPED sqo to read_raw`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_edit_mode_sqo())

		const captured = await with_stubbed_request(
			{ result : [], table : 'matrix', msg : 'OK. Request done' },
			async () => {
				await with_stubbed_alert(async () => {
					await drive_dialog(options, 'test4')
				})
			}
		)

		cleanup_modals()

		assert.strictEqual(captured.length, 1, 'read_raw must be called exactly once')
		const rqo = captured[0]
		assert.strictEqual(rqo.action, 'read_raw')
		assert.strictEqual(rqo.options.section_tipo, 'test4',
			'the picked target must reach the request')
		assert.strictEqual(rqo.sqo.offset, 0,
			'the un-scoped sqo (offset:1) is what made read_raw return nothing')
		assert.strictEqual(rqo.sqo.limit, 1)
	})

	// An empty result used to be indistinguishable from a broken dialog: the
	// modal closed and nothing else happened.
	it(`an empty result tells the user instead of failing silently`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_edit_mode_sqo())

		let messages = []
		await with_stubbed_request(
			{ result : [], table : 'matrix', msg : 'OK. Request done' },
			async () => {
				messages = await with_stubbed_alert(async () => {
					await drive_dialog(options, 'test4')
				})
			}
		)

		cleanup_modals()

		assert.strictEqual(messages.length, 1,
			'an empty read_raw result must be reported, not swallowed')
	})

	// Reachable whenever the caller has no target sections at all (a section
	// with no portals): the Open button stays enabled, section_tipo stays null.
	// The guard used to return BEFORE modal.close(), stranding the dialog.
	it(`no selectable target closes the dialog and says why`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_edit_mode_sqo())
		options.target_sections = []

		let messages = []
		const captured = await with_stubbed_request(
			{ result : [], table : 'matrix', msg : 'OK. Request done' },
			async () => {
				messages = await with_stubbed_alert(async () => {
					render_open_list_with_direct_relations(options)
					const modal = document.querySelector('.open_relations_modal')
					modal.querySelector('button.success').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
					await new Promise(resolve => setTimeout(resolve, 300))
				})
			}
		)

		const stranded = document.querySelector('.open_relations_modal')
		cleanup_modals()

		assert.strictEqual(captured.length, 0, 'no target means no request')
		assert.strictEqual(messages.length, 1, 'the user must be told there is nothing to open')
		assert.strictEqual(stranded, null, 'the dialog must not be left open with no way forward')
	})
})


// @license-end
