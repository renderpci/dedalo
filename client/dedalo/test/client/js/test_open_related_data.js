// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {data_manager} from '../../../core/common/js/data_manager.js'
import {
	build_scoped_sqo,
	flatten_read_raw_result,
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
* The dialog also has to READ the answer, and read_raw replies in a different
* shape per options.type: 'target_section' gives one flat locator array, while
* 'component' (the portal caller) gives one entry PER RECORD, each holding that
* record's whole raw component value — an array of locators. Read as if it were
* flat, every entry yielded undefined and the portal button opened nothing at
* all, for any record.
*
* No backend: data_manager.request is a method on a shared singleton, so it is
* patched in place to capture the outgoing RQO and answer with a canned result;
* window.open is patched to observe what open_records_in_window ends up doing.
*/



// The record every fixture below has open: the 2nd of the found set.
	const OPEN_RECORD = { section_tipo:'test3', section_id:2 }

// A fake caller SECTION instance — the identity build_scoped_sqo needs to tell
// the auto single-record pin apart from a real (semantic) result set.
	const make_caller_section = () => ({
		model			: 'section',
		tipo			: OPEN_RECORD.section_tipo,
		section_tipo	: OPEN_RECORD.section_tipo,
		section_id		: OPEN_RECORD.section_id
	})

// make_pinned_sqo — the shape a section carries when it was loaded KNOWING its
// section_id (direct url, restored edit pagination): build_rqo_show adds the
// auto pin, and the found-set offset is left over beside it.
	const make_pinned_sqo = () => ({
		section_tipo		: ['test3'],
		limit				: 1,
		offset				: 1,
		filter_by_locators	: [{ ...OPEN_RECORD }],
		filter				: { '$and' : [{ q:['x'], path:[{section_tipo:'test3', component_tipo:'test52'}] }] },
		parsed				: false
	})

// make_navigated_sqo — THE MAINSTREAM SHAPE. Clicking a row's edit pen clones
// the list sqo and sets limit:1 / offset:<row position>, deliberately WITHOUT a
// section_id on the source (render_list_section.js), so no pin is ever
// generated: here the OFFSET is what selects the record.
	const make_navigated_sqo = () => ({
		section_tipo		: ['test3'],
		limit				: 1,
		offset				: 1,
		filter_by_locators	: [],
		filter				: { '$and' : [{ q:['x'], path:[{section_tipo:'test3', component_tipo:'test52'}] }] },
		parsed				: false
	})

// make_semantic_sqo — a semantic/RAG search resolves its ranked hits INTO
// filter_by_locators (search/js/search.js exec_search). Those pins are the user's
// result set, not an auto pin, and must never be discarded.
	const make_semantic_sqo = () => ({
		section_tipo		: ['test3'],
		limit				: 1,
		offset				: 1,
		filter_by_locators	: [
			{ section_tipo:'test3', section_id:7 },
			{ section_tipo:'test3', section_id:2 },
			{ section_tipo:'test3', section_id:9 }
		],
		order				: [{ mode:'locator_position' }],
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
		// no get_total on it, so the dialog's async found-total patch is skipped
		self_caller	: make_caller_section()
	})

// make_portal_options — the portal caller's shape ('component' mode). No target
// sections: the tipo is already fixed, so no radio group is rendered.
	const make_portal_options = (sqo) => ({
		sqo				: sqo,
		caller_tipo		: 'test111',
		rqo_options		: {
			type			: 'component',
			section_tipo	: 'test3',
			tipo			: 'test111',
			model			: 'component_portal'
		},
		label		: 'Fake portal',
		total		: 1,
		self_caller	: make_caller_section()
	})

// A locator as read_raw stores it.
	const make_locator = (section_tipo, section_id) => ({
		id					: section_id,
		type				: 'dd151',
		section_id			: String(section_id),
		section_tipo		: section_tipo,
		from_component_tipo	: 'test111'
	})

// with_stubbed_open — open_records_in_window is a module import and cannot be
// patched, but everything it does bottoms out in window.open.
	const with_stubbed_open = async (fn) => {
		const original	= window.open
		const urls		= []
		window.open = (url) => {
			urls.push(url)
			return { focus(){}, resizeTo(){}, moveTo(){} }
		}
		try {
			await fn(urls)
		} finally {
			window.open = original
		}
		return urls
	}

// with_stubbed_request — patch the shared data_manager, run fn, always restore.
// Only read_raw is answered with the canned response; the 'read' the dummy
// section issues while open_records_in_window persists its session filter gets
// an inert one.
	const with_stubbed_request = async (response, fn) => {
		const original	= data_manager.request
		const captured	= []
		data_manager.request = async (options) => {
			captured.push(options?.body)
			return options?.body?.action==='read_raw'
				? response
				: { ok : true, data : { context:[], data:[] } }
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

// cleanup_modals — the dialog closes itself, but a failed assertion can leave
// one behind; a stale node would be picked up by the NEXT test's querySelector
// and turn one failure into a cascade. Always call it from a finally.
	const cleanup_modals = () => {
		document.querySelectorAll('.open_relations_modal').forEach(el => el.remove())
	}



describe(`OPEN_RELATED_DATA`, async () => {

	// THE PINNED CASE. A leftover found-set offset beside a one-record pin skips
	// the only matching row, so read_raw answers with nothing.
	it(`scope 'current' drops a stale offset when the pin already names the record`, async function() {

		const sqo		= make_pinned_sqo()
		const scoped	= build_scoped_sqo(sqo, 'current', make_caller_section())

		assert.strictEqual(scoped.offset, 0,
			'the found-set offset would skip the single pinned row')
		assert.strictEqual(scoped.limit, 1)
		assert.deepEqual(scoped.filter_by_locators, sqo.filter_by_locators,
			'the current record pin must survive')
	})

	// THE MAINSTREAM CASE, and the opposite requirement. Navigating from the list
	// produces NO pin — the offset alone names the record. Zeroing it here returns
	// the FIRST found record's relations instead of the open one's, silently.
	it(`scope 'current' PRESERVES the offset when there is no pin to name the record`, async function() {

		const sqo		= make_navigated_sqo()
		const scoped	= build_scoped_sqo(sqo, 'current', make_caller_section())

		assert.strictEqual(scoped.offset, 1,
			'with no pin the offset IS the record selector and must not be reset')
		assert.strictEqual(scoped.limit, 1)
	})

	// A semantic/RAG result set also lives in filter_by_locators, with several
	// entries; the offset then picks the open record out of THAT set.
	it(`scope 'current' preserves the offset inside a multi-pin result set`, async function() {

		const scoped = build_scoped_sqo(make_semantic_sqo(), 'current', make_caller_section())

		assert.strictEqual(scoped.offset, 1)
		assert.strictEqual(scoped.filter_by_locators.length, 3,
			'a semantic result set must not be reduced')
	})

	// 'found' must mean the user's search, not the open record: the AUTO pin is
	// the open record and goes, the real search lives in sqo.filter.
	it(`scope 'found' drops the caller's OWN record pin and takes every row`, async function() {

		const sqo		= make_pinned_sqo()
		const scoped	= build_scoped_sqo(sqo, 'found', make_caller_section())

		assert.deepEqual(scoped.filter_by_locators, [],
			'the auto single-record pin would silently reduce "all found" to "current"')
		assert.strictEqual(scoped.limit, 0)
		assert.strictEqual(scoped.offset, 0)
		assert.deepEqual(scoped.filter, sqo.filter,
			'the user\'s own search must decide the found set')
	})

	// THE COUNTERPART. filter_by_locators is also how a semantic search carries
	// its ranked hits. Dropping those would open relations for records the user
	// never searched for — and with the zero-hit sentinel, for the whole section.
	it(`scope 'found' NEVER drops a pin set that is the user's own result`, async function() {

		const scoped = build_scoped_sqo(make_semantic_sqo(), 'found', make_caller_section())

		assert.strictEqual(scoped.filter_by_locators.length, 3,
			'a semantic result set is the found set, not an auto pin')
		assert.strictEqual(scoped.limit, 0)
	})

	// The zero-hit sentinel (section_id:-1) means "honestly empty". It is a
	// one-entry pin set, so only the caller-identity check keeps it.
	it(`scope 'found' keeps the zero-hit semantic sentinel`, async function() {

		const sqo = make_navigated_sqo()
		sqo.filter_by_locators = [{ section_tipo:'test3', section_id:-1 }]

		const scoped = build_scoped_sqo(sqo, 'found', make_caller_section())

		assert.deepEqual(scoped.filter_by_locators, [{ section_tipo:'test3', section_id:-1 }],
			'dropping the sentinel would open the ENTIRE section')
	})

	// Without a caller identity the auto pin cannot be recognised, so the pin
	// must be kept: narrowing is recoverable, widening past what the user can see
	// is not.
	it(`scope 'found' keeps the pin when the caller record is unknown`, async function() {

		const scoped = build_scoped_sqo(make_pinned_sqo(), 'found', null)

		assert.strictEqual(scoped.filter_by_locators.length, 1)
	})

	// The portal caller hands over its parent section's LIVE sqo. Re-paginating
	// it would silently move the user's own list. Asserted deeply: a shallow copy
	// would still let a nested edit through.
	it(`the caller's sqo is never mutated, at any depth`, async function() {

		const sqo		= make_semantic_sqo()
		const snapshot	= JSON.stringify(sqo)
		const pins_ref	= sqo.filter_by_locators

		const a = build_scoped_sqo(sqo, 'current', make_caller_section())
		const b = build_scoped_sqo(sqo, 'found', make_caller_section())

		assert.strictEqual(JSON.stringify(sqo), snapshot)
		assert.notStrictEqual(a.filter_by_locators, pins_ref,
			'the pin array must be a copy, not the caller\'s own')
		assert.notStrictEqual(a.filter_by_locators[0], pins_ref[0],
			'and so must each locator inside it')
		assert.strictEqual(b.filter_by_locators.length, 3)

		// the nested user filter too (the pinned fixture is the one that has one)
		const pinned		= make_pinned_sqo()
		const filter_ref	= pinned.filter
		const scoped		= build_scoped_sqo(pinned, 'found', make_caller_section())
		assert.notStrictEqual(scoped.filter, filter_ref,
			'the filter must be a copy — a shallow spread would share it')
		assert.deepEqual(scoped.filter, filter_ref)
	})

	// End to end through the dialog: what actually goes on the wire. Uses the
	// PINNED shape, so the offset must be reset by the time it leaves.
	it(`the dialog sends the SCOPED sqo to read_raw`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_pinned_sqo())

		let captured = []
		try {
			captured = await with_stubbed_request(
				{ ok : true, data : [], table : 'matrix' },
				async () => {
					await with_stubbed_alert(async () => {
						await drive_dialog(options, 'test4')
					})
				}
			)
		} finally {
			cleanup_modals()
		}

		assert.strictEqual(captured.length, 1, 'read_raw must be called exactly once')
		const rqo = captured[0]
		assert.strictEqual(rqo.action, 'read_raw')
		assert.strictEqual(rqo.options.section_tipo, 'test4',
			'the picked target must reach the request')
		assert.strictEqual(rqo.sqo.offset, 0,
			'the un-scoped sqo (offset:1) is what made read_raw return nothing')
		assert.strictEqual(rqo.sqo.limit, 1)
	})

	// The same path with the MAINSTREAM (pin-less) shape: the offset must arrive
	// untouched, or the request describes a different record than the open one.
	it(`the dialog sends the un-reset offset when the caller has no pin`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_navigated_sqo())

		let captured = []
		try {
			captured = await with_stubbed_request(
				{ ok : true, data : [], table : 'matrix' },
				async () => {
					await with_stubbed_alert(async () => {
						await drive_dialog(options, 'test4')
					})
				}
			)
		} finally {
			cleanup_modals()
		}

		assert.strictEqual(captured.length, 1)
		assert.strictEqual(captured[0].sqo.offset, 1,
			'resetting this offset asks the server for the FIRST found record')
	})

	// An empty result used to be indistinguishable from a broken dialog: the
	// modal closed and nothing else happened.
	it(`an empty result tells the user instead of failing silently`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_pinned_sqo())

		let messages = []
		try {
			await with_stubbed_request(
				{ ok : true, data : [], table : 'matrix' },
				async () => {
					messages = await with_stubbed_alert(async () => {
						await drive_dialog(options, 'test4')
					})
				}
			)
		} finally {
			cleanup_modals()
		}

		assert.strictEqual(messages.length, 1,
			'an empty read_raw result must be reported, not swallowed')
	})

	// Reachable whenever the caller has no target sections at all (a section
	// with no portals): the Open button stays enabled, section_tipo stays null.
	// The guard used to return BEFORE modal.close(), stranding the dialog.
	it(`no selectable target closes the dialog and says why`, async function() {

		this.timeout(5000)

		const options = make_dialog_options(make_pinned_sqo())
		options.target_sections = []

		let messages	= []
		let captured	= []
		let stranded	= null
		try {
			captured = await with_stubbed_request(
				{ ok : true, data : [], table : 'matrix' },
				async () => {
					messages = await with_stubbed_alert(async () => {
						render_open_list_with_direct_relations(options)
						const modal = document.querySelector('.open_relations_modal')
						modal.querySelector('button.success').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
						await new Promise(resolve => setTimeout(resolve, 300))
					})
				}
			)
			stranded = document.querySelector('.open_relations_modal')
		} finally {
			cleanup_modals()
		}

		assert.strictEqual(captured.length, 0, 'no target means no request')
		assert.strictEqual(messages.length, 1, 'the user must be told there is nothing to open')
		assert.strictEqual(stranded, null, 'the dialog must not be left open with no way forward')
	})

	// THE PORTAL REGRESSION. read_raw type:'component' answers one entry PER
	// RECORD, each entry being that record's whole raw component value — an
	// array of locators. Read as if it were the flat 'target_section' shape,
	// section_tipo came back undefined for every entry.
	it(`the per-record 'component' result shape is flattened to locators`, async function() {

		const one_record_holding_two_locators = [[
			make_locator('test4', 11),
			make_locator('test5', 12)
		]]

		const flat = flatten_read_raw_result(one_record_holding_two_locators)

		assert.strictEqual(flat.length, 2,
			'a nested per-record entry must not be read as a single locator')
		assert.deepEqual(flat.map(el => el.section_tipo), ['test4','test5'])
	})

	// The flat shape must survive the same normalisation untouched.
	it(`the flat 'target_section' result shape passes through unchanged`, async function() {

		const flat_result = [ make_locator('test4', 11), make_locator('test4', 12) ]

		const flat = flatten_read_raw_result(flat_result)

		assert.strictEqual(flat.length, 2)
		assert.deepEqual(flat.map(el => el.section_id), ['11','12'])
	})

	// Records that do not hold the component come back as null, and a
	// non-relation value has no locator pair at all: neither may become a hole
	// that the window-opening loop then trips over.
	it(`entries without a locator pair are dropped`, async function() {

		const mixed = [ null, [make_locator('test4', 11)], [], 'a scalar value', [{id:1}] ]

		const flat = flatten_read_raw_result(mixed)

		assert.strictEqual(flat.length, 1)
		assert.strictEqual(flat[0].section_tipo, 'test4')
		assert.deepEqual(flatten_read_raw_result(undefined), [])
	})

	// End to end for the portal caller: one window per DISTINCT target tipo.
	it(`a portal caller opens one window per distinct target section`, async function() {

		this.timeout(10000)

		const options = make_portal_options(make_pinned_sqo())

		let urls		= []
		let had_radios	= null
		try {
			await with_stubbed_request(
				{
					ok		: true,
					// one matched record holding three locators across two sections
					data	: [[
						make_locator('test4', 11),
						make_locator('test5', 12),
						make_locator('test4', 13)
					]],
					table	: 'matrix'
				},
				async () => {
					urls = await with_stubbed_open(async () => {
						await with_stubbed_alert(async () => {
							render_open_list_with_direct_relations(options)
							const modal = document.querySelector('.open_relations_modal')
							// no target radios in component mode: the tipo is fixed
							had_radios = modal.querySelector('input[name=target_section]')
							modal.querySelector('button.success').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}))
							// The window chain is fire-and-forget (open_related_data's
							// promise is never returned), so this wait is the only join
							// point. Generous: it must outlast two dummy section builds
							// or the stubs are restored under a still-running chain.
							await new Promise(resolve => setTimeout(resolve, 3000))
						})
					})
				}
			)
		} finally {
			cleanup_modals()
		}

		assert.strictEqual(had_radios, null, 'component mode fixes the tipo — no radio group')

		assert.strictEqual(urls.length, 2, 'one window per distinct target section_tipo')
		assert.deepEqual(
			urls.map(url => url.split('tipo=')[1].split('&')[0]).sort(),
			['test4','test5']
		)
	})
})


// @license-end
