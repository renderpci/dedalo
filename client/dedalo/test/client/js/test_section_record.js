// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, after, assert, window */
/*eslint no-undef: "error"*/
'use strict';



import {section_record, apply_caller_show_interface} from '../../../core/section_record/js/section_record.js'
import {get_section_records} from '../../../core/section/js/section.js'
import {get_dataframe} from '../../../core/component_common/js/dataframe.js'
import {event_manager} from '../../../core/common/js/event_manager.js'
import {add_instance, delete_instance, get_instance_by_id, key_instances_builder} from '../../../core/common/js/instances.js'



/**
* TEST_SECTION_RECORD
* The section_record surface, exercised WITHOUT a backend. Two blocks:
*
*   SECTION_RECORD            — the two child-build error paths (below)
*   SECTION_RECORD (extended) — everything else reachable offline: init, the two
*                               datum accessors, and both child-build entry points
*                               (see that block's own header for the case map)
*
* First, the two child-build error paths in section_record:
*
*   1. get_ar_instances_edit must RESOLVE (not hang) when a child build rejects.
*   2. get_ar_columns_instances_list must reset `_instances_waiter` after a child
*      build failure so a later call can retry (instead of being stuck forever on
*      the rejected waiter promise).
*
* No backend is required: a fake child instance is pre-registered in the shared
* instances registry under the exact key `build_instance` will request, so
* `get_instance` returns it from cache (no module import / no API call). The fake's
* `build()` rejects, exercising the real failure path deterministically.
*/



// make_failing_child — a fake instance whose build() always rejects
	const make_failing_child = (key) => ({
		id		: key,
		build	: async function(){ throw new Error('simulated build failure') }
	})

// make_passing_child — a fake instance whose build() resolves
	const make_passing_child = (key, extra={}) => ({
		id		: key,
		build	: async function(){ return true },
		...extra
	})



// legacy_registered_keys — the fakes this first block plants in the SHARED registry;
// cleaned in its after() so they cannot be served to another suite
	const legacy_registered_keys = []



describe(`SECTION_RECORD`, async () => {

	after(function(){
		for (const key of legacy_registered_keys) {
			delete_instance(key)
		}
		legacy_registered_keys.length = 0
	})

	// get_ar_instances_edit must not hang when a child build fails (bug #1)
	it(`get_ar_instances_edit resolves (does not hang) on child build failure`, async function() {

		this.timeout(5000)

		// section_record in edit mode
			const caller = { model:'section', section_tipo:'cst_e', section_id:1, permissions:{} }
			const sr = new section_record()
			await sr.init({
				model			: 'section_record',
				tipo			: 'tipo_e',
				section_tipo	: 'st_e',
				section_id		: 1,
				mode			: 'edit',
				lang			: 'lg-eng',
				context			: {},
				datum			: { context:[], data:[] },
				caller			: caller
			})

		// one child context that passes the edit-mode filter
			const child_ctx = {
				model			: 'component_input_text',
				tipo			: 'child_e',
				section_tipo	: 'st_e',
				parent			: 'tipo_e',
				type			: 'component',
				mode			: 'edit',
				lang			: 'lg-eng'
			}
			sr.datum.context = [child_ctx]

		// pre-register a failing child under the exact key build_instance will request
			const id_variant = `${sr.tipo}_${sr.section_tipo}_${sr.section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`
			const key = key_instances_builder({
				model			: child_ctx.model,
				tipo			: child_ctx.tipo,
				section_tipo	: child_ctx.section_tipo,
				section_id		: sr.section_id,
				mode			: sr.mode,
				lang			: child_ctx.lang,
				parent			: sr.tipo,
				id_variant		: id_variant
			})
			legacy_registered_keys.push(key)
			add_instance(key, make_failing_child(key))

		// race the call against a timeout: buggy code never settles -> 'hang'
			const outcome = await Promise.race([
				sr.get_ar_instances_edit().then(()=>'resolved', ()=>'rejected'),
				new Promise(res => setTimeout(()=>res('hang'), 1500))
			])

		// asserts
			assert.equal(outcome, 'resolved', 'get_ar_instances_edit must resolve even when a child build rejects (no hang)')
			assert.ok(Array.isArray(sr.ar_instances), 'ar_instances must be an array')
			assert.equal(sr.ar_instances.filter(el => !el).length, 0, 'ar_instances must not contain undefined holes from failed builds')
	})


	// get_ar_columns_instances_list must reset the waiter after a failure (bug #2)
	it(`get_ar_columns_instances_list resets _instances_waiter after a child build failure`, async function() {

		this.timeout(5000)

		// section_record in list mode with one column / one ddo
			const caller = { model:'section', section_tipo:'cst_l', section_id:2, permissions:{} }
			const sr = new section_record()
			await sr.init({
				model			: 'section_record',
				tipo			: 'tipo_l',
				section_tipo	: 'st_l',
				section_id		: 2,
				mode			: 'list',
				lang			: 'lg-eng',
				context			: {
					request_config	: [ { show:{ ddo_map:[ {
						parent			: 'tipo_l',
						column_id		: 'col1',
						tipo			: 'child_l',
						mode			: 'list',
						section_tipo	: 'st_l',
						model			: 'component_input_text',
						lang			: 'lg-eng'
					} ] } } ]
				},
				columns_map		: [ { id:'col1' } ],
				datum			: { context:[ {
					tipo			: 'child_l',
					mode			: 'list',
					section_tipo	: 'st_l',
					model			: 'component_input_text',
					lang			: 'lg-eng'
				} ], data:[] },
				caller			: caller
			})

		// key build_instance will request for this column child
			const id_variant = `${sr.tipo}_${sr.section_tipo}_${sr.section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`
			const key = key_instances_builder({
				model			: 'component_input_text',
				tipo			: 'child_l',
				section_tipo	: 'st_l',
				section_id		: sr.section_id,
				mode			: sr.mode,
				lang			: 'lg-eng',
				parent			: sr.tipo,
				id_variant		: id_variant,
				column_id		: 'col1'
			})

		// 1) failing child -> first call rejects AND must clear the waiter
			legacy_registered_keys.push(key)
			add_instance(key, make_failing_child(key))

			let first_err = null
			try {
				await sr.get_ar_columns_instances_list()
			} catch (e) {
				first_err = e
			}
			assert.ok(first_err, 'first call should reject when the child build fails')
			assert.equal(sr._instances_waiter, null, 'waiter must be reset after failure so a retry can run')

		// 2) recovery -> replace with a passing child; a second call must rebuild
			const good_child = make_passing_child(key, { model:'component_input_text', tipo:'child_l' })
			add_instance(key, good_child)

			const instances = await sr.get_ar_columns_instances_list()
			assert.ok(Array.isArray(instances), 'second call must return an array')
			assert.equal(instances.length, 1, 'second call must rebuild the child after recovery')
			assert.equal(instances[0], good_child, 'rebuilt instance must be the recovered child')
	})
})


/**
* EXTRA COVERAGE
* The block below extends the two original regression cases with the rest of the
* section_record surface that can be exercised WITHOUT a backend:
*
*   init                            — option mapping, defaults, double-init guard
*   get_component_data              — match tuple, int-coercion, stubs, section_group,
*                                     component_dataframe pairing (id_key priority)
*   get_component_info              — ddinfo lookup discrimination
*   get_ar_instances_edit           — context filter (dataframe in/out by caller model),
*                                     caching, hole filtering, child key contract
*   get_ar_columns_instances_list   — column order, dedup across request_config,
*                                     search ddo_map fallback, missing-context skip,
*                                     concurrent-call waiter sharing, fixed_mode
*
* Technique: children are FAKE instances pre-registered in the shared registry under
* the exact key `build_instance` will ask for. A child that shows up in the result
* therefore PROVES the key contract (model, tipo, mode, lang, parent, id_variant,
* column_id). (!) A miss is NOT automatically a clean negative: most models used here
* (component_input_text, component_dataframe, section_group) are REAL modules, so a
* wrong key would import and construct the real thing. Every case that asserts an
* absence therefore registers the child under the key the code really derives — only
* the deliberate `component_ghost_model_zz` case relies on an import that 404s.
*/

// registered_keys — every key added by the helpers, cleaned up after the suite
	const registered_keys = []

// register_child — put a fake instance in the registry under `key`
	const register_child = (key, instance) => {
		registered_keys.push(key)
		add_instance(key, instance)
		return instance
	}

// spy_child — a fake whose build() resolves and records the calls it received
	const spy_child = (key, extra={}) => ({
		id			: key,
		build_calls	: 0,
		build		: async function(autoload){ this.build_calls++; this.last_autoload = autoload; return true },
		...extra
	})

// id_variant_of — the stable id_variant build_instance derives for its children
// (the row's section_tipo is part of it: rows of different sections may share a section_id)
	const id_variant_of = (sr, section_id) =>
		`${sr.tipo}_${sr.section_tipo}_${section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`

// child_key_of — the exact registry key build_instance will request for a child
	const child_key_of = (sr, o) => key_instances_builder({
		model			: o.model,
		tipo			: o.tipo,
		section_tipo	: o.section_tipo,
		section_id		: o.section_id ?? sr.section_id,
		mode			: o.mode ?? sr.mode,
		lang			: o.lang,
		parent			: sr.tipo,
		id_variant		: o.id_variant ?? id_variant_of(sr, o.section_id ?? sr.section_id),
		column_id		: o.column_id
	})

// make_section_record — init a section_record with sane defaults
	const make_section_record = async (options={}) => {
		const caller = options.caller || { model:'section', section_tipo:'cst_x', section_id:9, permissions:{} }
		const sr = new section_record()
		await sr.init(Object.assign({
			model			: 'section_record',
			tipo			: 'tipo_x',
			section_tipo	: 'st_x',
			section_id		: 1,
			mode			: 'edit',
			lang			: 'lg-eng',
			context			: {},
			datum			: { context:[], data:[] }
		}, options, { caller: caller }))
		return sr
	}



describe(`SECTION_RECORD (extended)`, async () => {

	after(function(){
		// registry hygiene — the instances map is shared with every other suite
		for (const key of registered_keys) {
			delete_instance(key)
		}
		registered_keys.length = 0
	})


	// ---------------------------------------------------------------- init

	it(`init maps options and applies documented defaults`, async function() {

		const caller	= { model:'section', section_tipo:'cst_i', section_id:7, permissions:{ read:true } }
		const sr		= await make_section_record({ caller:caller, section_id:3, mode:'list' })

		assert.equal(sr.status, 'initialized', 'status must end initialized')
		assert.equal(sr.type, sr.model, 'type must mirror model for common helpers')
		assert.equal(sr.context.fields_separator, ' + ', 'fields_separator default')
		assert.equal(sr.context.view, 'line', 'view default is line')
		assert.equal(sr.permissions, caller.permissions, 'permissions inherited from caller by reference')
		assert.ok(Array.isArray(sr.ar_instances) && sr.ar_instances.length===0, 'ar_instances starts empty')
		assert.ok(Array.isArray(sr.events_tokens) && sr.events_tokens.length===0, 'events_tokens starts empty')
		// (!) strictEqual: chai's assert.equal is loose, so `undefined == null` would
		// pass and the message would be a lie
		assert.strictEqual(sr.matrix_id, null, 'matrix_id defaults to null (not undefined)')
		assert.strictEqual(sr.node, null, 'node is null before render')
		assert.strictEqual(sr.label, null, 'label is null on init')
	})


	it(`init does not override an explicit view / fields_separator / matrix_id`, async function() {

		const sr = await make_section_record({
			context		: { view:'mini', fields_separator:' | ' },
			matrix_id	: '55',
			id_variant	: 'iv',
			column_id	: 'colA',
			offset		: 20,
			row_key		: 4,
			paginated_key: 12
		})

		assert.equal(sr.context.view, 'mini', 'explicit view wins')
		assert.equal(sr.context.fields_separator, ' | ', 'explicit fields_separator wins')
		assert.equal(sr.matrix_id, '55', 'matrix_id kept')
		assert.equal(sr.id_variant, 'iv', 'id_variant kept')
		assert.equal(sr.column_id, 'colA', 'column_id kept')
		assert.equal(sr.offset, 20, 'offset kept')
		assert.equal(sr.row_key, 4, 'row_key kept')
		assert.equal(sr.paginated_key, 12, 'paginated_key kept')
	})


	it(`init double-init guard returns false and leaves state untouched`, async function() {

		const sr		= await make_section_record({ tipo:'tipo_dbl' })

		// (!) the guard calls alert() under SHOW_DEBUG — a modal dialog FREEZES the
		// headless runner, so force it off for the duration of the call
		const show_debug_backup = window.SHOW_DEBUG
		window.SHOW_DEBUG = false

		let second = null
		try {
			second = await sr.init({
				model			: 'section_record',
				tipo			: 'other_tipo',
				section_tipo	: 'other_st',
				section_id		: 99,
				mode			: 'list',
				lang			: 'lg-spa',
				context			: {},
				datum			: { context:[], data:[] },
				caller			: { model:'section', section_tipo:'x', section_id:1, permissions:{} }
			})
		} finally {
			// restore even on a throw: leaving SHOW_DEBUG false would silently change
			// what every later suite in this frame logs
			window.SHOW_DEBUG = show_debug_backup
		}

		assert.equal(second, false, 'second init must return false')
		assert.equal(sr.tipo, 'tipo_dbl', 'first init values must survive')
		assert.equal(sr.section_id, 1, 'section_id must not be overwritten')
	})


	// ------------------------------------------------- get_component_data

	it(`get_component_data matches the identity tuple and coerces section_id`, async function() {

		const target = { tipo:'c1', section_tipo:'st_d', section_id:'5', mode:'edit', entries:['ok'] }
		const sr = await make_section_record({
			section_id	: 5,
			datum		: { context:[], data:[
				{ tipo:'c1', section_tipo:'st_d', section_id:'6', mode:'edit', entries:['wrong section_id'] },
				{ tipo:'c1', section_tipo:'other', section_id:'5', mode:'edit', entries:['wrong section_tipo'] },
				{ tipo:'c1', section_tipo:'st_d', section_id:'5', mode:'list', entries:['wrong mode'] },
				target
			] }
		})

		const found = sr.get_component_data({
			ddo				: { tipo:'c1', mode:'edit', model:'component_input_text' },
			section_tipo	: 'st_d',
			section_id		: 5 // number vs the string '5' stored in datum
		})

		assert.equal(found, target, 'must return the exact entry (string/number section_id are equal)')
	})


	it(`get_component_data returns an empty stub when nothing matches`, async function() {

		const sr = await make_section_record({ datum:{ context:[], data:[] } })

		const stub = sr.get_component_data({
			ddo				: { tipo:'c_missing', mode:'edit', model:'component_input_text' },
			section_tipo	: 'st_x',
			section_id		: 1
		})

		assert.ok(stub, 'a stub must always be returned (never undefined)')
		assert.equal(stub.tipo, 'c_missing', 'stub carries the requested tipo')
		assert.equal(stub.section_tipo, 'st_x', 'stub carries the requested section_tipo')
		assert.equal(stub.section_id, 1, 'stub carries the requested section_id')
		assert.ok(Array.isArray(stub.entries) && stub.entries.length===0, 'stub entries is an empty array')
		assert.deepEqual(stub.fallback_value, [''], 'stub fallback_value is a one empty string array')
		assert.strictEqual(stub.id_key, undefined, 'non-dataframe stub must NOT carry pairing keys (loose equal would accept null)')
	})


	it(`get_component_data returns null for a section_group (layout-only, no data)`, async function() {

		const sr = await make_section_record()

		const result = sr.get_component_data({
			ddo				: { tipo:'g1', mode:'edit', model:'section_group' },
			section_tipo	: 'st_x',
			section_id		: 1
		})

		assert.equal(result, null, 'section_group has no datum entry: null, not a stub')
	})


	it(`get_component_data pairs a component_dataframe by id_key + main_component_tipo`, async function() {

		const row_a = { tipo:'df1', section_tipo:'st_x', section_id:1, mode:'edit', id_key:10, main_component_tipo:'tipo_x', entries:['A'] }
		const row_b = { tipo:'df1', section_tipo:'st_x', section_id:1, mode:'edit', id_key:11, main_component_tipo:'tipo_x', entries:['B'] }
		const row_c = { tipo:'df1', section_tipo:'st_x', section_id:1, mode:'edit', id_key:11, main_component_tipo:'other_main', entries:['C'] }

		const sr = await make_section_record({ datum:{ context:[], data:[row_a, row_b, row_c] } })

		const ddo = { tipo:'df1', mode:'edit', model:'component_dataframe' }

		// explicit pairing id (the portal entry locator.id) selects the row
			assert.equal(sr.get_component_data({ ddo:ddo, section_tipo:'st_x', section_id:1, dataframe_id_key:10 }), row_a, 'id_key 10 -> row A')
			assert.equal(sr.get_component_data({ ddo:ddo, section_tipo:'st_x', section_id:1, dataframe_id_key:11 }), row_b, 'id_key 11 + main tipo_x -> row B (not C)')

		// string/number id_key are equivalent (parseInt comparison)
			assert.equal(sr.get_component_data({ ddo:ddo, section_tipo:'st_x', section_id:1, dataframe_id_key:'11' }), row_b, 'string id_key must match the numeric one')

		// explicit dataframe_id_key WINS over ddo.caller_dataframe (Time Machine path)
			const tm_ddo = { tipo:'df1', mode:'edit', model:'component_dataframe', caller_dataframe:{ id_key:11, main_component_tipo:'tipo_x' } }
			assert.equal(sr.get_component_data({ ddo:tm_ddo, section_tipo:'st_x', section_id:1, dataframe_id_key:10 }), row_a, 'explicit pairing id has priority over caller_dataframe')

		// caller_dataframe is used when no explicit key is threaded
			assert.equal(sr.get_component_data({ ddo:tm_ddo, section_tipo:'st_x', section_id:1 }), row_b, 'caller_dataframe pairs when dataframe_id_key is absent')

		// unpairable -> stub WITH the pairing keys
			const stub = sr.get_component_data({ ddo:ddo, section_tipo:'st_x', section_id:1, dataframe_id_key:99 })
			assert.ok(Array.isArray(stub.entries) && stub.entries.length===0, 'unpairable dataframe returns a stub')
			assert.equal(stub.id_key, 99, 'dataframe stub carries id_key')
			assert.equal(stub.main_component_tipo, 'tipo_x', 'dataframe stub carries main_component_tipo (self.tipo fallback)')
	})


	it(`get_component_data falls back to self.section_id as dataframe id_key`, async function() {

		const row = { tipo:'df2', section_tipo:'st_x', section_id:4, mode:'edit', id_key:4, main_component_tipo:'tipo_x', entries:['self'] }
		const sr  = await make_section_record({ section_id:4, datum:{ context:[], data:[row] } })

		const found = sr.get_component_data({
			ddo				: { tipo:'df2', mode:'edit', model:'component_dataframe' },
			section_tipo	: 'st_x',
			section_id		: 4
		})

		assert.equal(found, row, 'with no explicit key and no caller_dataframe, self.section_id pairs the row')
	})


	// ------------------------------------------------- get_component_info

	it(`get_component_info finds the ddinfo entry of THIS record only`, async function() {

		const mine	= { tipo:'ddinfo', section_tipo:'st_i', section_id:2, value:'mine' }
		const sr	= await make_section_record({
			section_tipo	: 'st_i',
			section_id		: 2,
			datum			: { context:[], data:[
				{ tipo:'ddinfo', section_tipo:'st_i', section_id:1, value:'other row' },
				{ tipo:'ddinfo', section_tipo:'other_st', section_id:2, value:'other section' },
				mine
			] }
		})

		assert.equal(sr.get_component_info(), mine, 'must discriminate by section_tipo AND section_id')
	})


	it(`get_component_info returns undefined when the server sent no ddinfo`, async function() {

		const sr = await make_section_record({ datum:{ context:[], data:[{ tipo:'c1', section_tipo:'st_x', section_id:1, mode:'edit' }] } })

		assert.equal(sr.get_component_info(), undefined, 'absent ddinfo is undefined, not a stub')
	})


	// --------------------------------------------- get_ar_instances_edit

	it(`get_ar_instances_edit filters by parent, type and mode, and honours the child key contract`, async function() {

		const sr = await make_section_record({ tipo:'tipo_f', section_tipo:'st_f', section_id:6 })

		const good = {
			model:'component_input_text', tipo:'ok1', section_tipo:'st_f',
			parent:'tipo_f', type:'component', mode:'edit', lang:'lg-eng'
		}
		sr.datum.context = [
			good,
			{ model:'component_input_text', tipo:'bad_parent',	section_tipo:'st_f', parent:'other',  type:'component',	mode:'edit', lang:'lg-eng' },
			{ model:'component_input_text', tipo:'bad_section',	section_tipo:'other',parent:'tipo_f', type:'component',	mode:'edit', lang:'lg-eng' },
			{ model:'component_input_text', tipo:'bad_mode',		section_tipo:'st_f', parent:'tipo_f', type:'component',	mode:'list', lang:'lg-eng' },
			{ model:'component_input_text', tipo:'bad_type',		section_tipo:'st_f', parent:'tipo_f', type:'button',	mode:'edit', lang:'lg-eng' }
		]

		const child = register_child(child_key_of(sr, good), spy_child('ok1'))

		const instances = await sr.get_ar_instances_edit()

		assert.equal(instances.length, 1, 'only the matching context entry is built')
		assert.equal(instances[0], child, 'the built child is the one registered under the contract key')
		assert.equal(child.build_calls, 1, 'build called exactly once')
		assert.equal(child.last_autoload, false, 'edit children are built with autoload=false (data already in datum)')
	})


	it(`get_ar_instances_edit builds a grouper and excludes component_dataframe when the caller is a section`, async function() {

		const sr = await make_section_record({ tipo:'tipo_g', section_tipo:'st_g', section_id:2 })

		const grouper	= { model:'section_group', tipo:'grp1', section_tipo:'st_g', parent:'tipo_g', type:'grouper', mode:'edit', lang:'lg-eng' }
		const dataframe	= { model:'component_dataframe', tipo:'df_g', section_tipo:'st_g', parent:'tipo_g', type:'component', mode:'edit', lang:'lg-eng' }
		sr.datum.context = [grouper, dataframe]

		const grp = register_child(child_key_of(sr, grouper), spy_child('grp1'))
		// The dataframe child is registered too, under the key build_instance really
		// derives for a component_dataframe: the base id_variant PLUS `_<id_key>_<main_component_tipo>`.
		// With no locator and no datum entry the pairing falls back to self.section_id
		// and self.tipo. Registering the BASE key would make this case prove nothing —
		// the child would miss the cache and go to a live import of the real
		// component_dataframe module whatever the filter did.
		register_child(child_key_of(sr, {
			model			: 'component_dataframe',
			tipo			: 'df_g',
			section_tipo	: 'st_g',
			lang			: 'lg-eng',
			id_variant		: `${id_variant_of(sr, sr.section_id)}_${sr.section_id}_${sr.tipo}`
		}), spy_child('df_g'))

		const instances = await sr.get_ar_instances_edit()

		assert.equal(instances.length, 1, 'a section caller must exclude component_dataframe (the registered dataframe child would have shown up)')
		assert.equal(instances[0], grp, 'the grouper is built (type grouper passes the filter)')
	})


	it(`get_ar_instances_edit includes component_dataframe when the caller is a portal`, async function() {

		const sr = await make_section_record({
			tipo			: 'tipo_p',
			section_tipo	: 'st_p',
			section_id		: 3,
			locator			: { id:77, section_tipo:'st_p', section_id:3 },
			caller			: { model:'component_portal', section_tipo:'cst_p', section_id:1, permissions:{} }
		})

		const dataframe = { model:'component_dataframe', tipo:'df_p', section_tipo:'st_p', parent:'tipo_p', type:'component', mode:'edit', lang:'lg-eng' }
		sr.datum.context = [dataframe]

		const df = register_child(child_key_of(sr, {
			model			: 'component_dataframe',
			tipo			: 'df_p',
			section_tipo	: 'st_p',
			lang			: 'lg-eng',
			// dataframe id_variant = <base>_<id_key>_<main_component_tipo>; id_key is the portal entry locator.id
			id_variant		: `${id_variant_of(sr, sr.section_id)}_77_tipo_p`
		}), spy_child('df_p'))

		const instances = await sr.get_ar_instances_edit()

		assert.equal(instances.length, 1, 'a portal caller must include component_dataframe')
		assert.equal(instances[0], df, 'the dataframe id_variant must encode id_key + main_component_tipo')
	})


	it(`get_ar_instances_edit caches: a second call does not rebuild`, async function() {

		const sr = await make_section_record({ tipo:'tipo_c', section_tipo:'st_c', section_id:8 })

		const ctx = { model:'component_input_text', tipo:'c_cache', section_tipo:'st_c', parent:'tipo_c', type:'component', mode:'edit', lang:'lg-eng' }
		sr.datum.context = [ctx]

		const child = register_child(child_key_of(sr, ctx), spy_child('c_cache'))

		const first		= await sr.get_ar_instances_edit()
		const second	= await sr.get_ar_instances_edit()

		assert.equal(second, first, 'the same array instance is returned')
		assert.equal(child.build_calls, 1, 'build must not run twice')
	})


	it(`get_ar_instances_edit drops unresolvable children instead of leaving holes`, async function() {

		this.timeout(8000)

		const sr = await make_section_record({ tipo:'tipo_h', section_tipo:'st_h', section_id:4 })

		const ok		= { model:'component_input_text', tipo:'h_ok', section_tipo:'st_h', parent:'tipo_h', type:'component', mode:'edit', lang:'lg-eng' }
		// no module file exists for this model: get_instance resolves null -> build_instance returns undefined
		const ghost		= { model:'component_ghost_model_zz', tipo:'h_ghost', section_tipo:'st_h', parent:'tipo_h', type:'component', mode:'edit', lang:'lg-eng' }
		sr.datum.context = [ok, ghost]

		const child = register_child(child_key_of(sr, ok), spy_child('h_ok'))

		const instances = await sr.get_ar_instances_edit()

		assert.equal(instances.length, 1, 'the unresolvable child is filtered out')
		assert.equal(instances[0], child, 'the survivor is the real child')
		assert.equal(instances.filter(el => !el).length, 0, 'no holes')
	})


	// ------------------------------------- get_ar_columns_instances_list

	it(`get_ar_columns_instances_list preserves column order and dedups a tipo across request_config items`, async function() {

		const ddo = (tipo, column_id) => ({
			parent			: 'tipo_col',
			column_id		: column_id,
			tipo			: tipo,
			mode			: 'list',
			section_tipo	: 'st_col',
			model			: 'component_input_text',
			lang			: 'lg-eng'
		})
		const ctx = (tipo) => ({ tipo:tipo, mode:'list', section_tipo:'st_col', model:'component_input_text', lang:'lg-eng' })

		const sr = await make_section_record({
			tipo			: 'tipo_col',
			section_tipo	: 'st_col',
			section_id		: 5,
			mode			: 'list',
			context			: { request_config:[
				{ show:{ ddo_map:[ ddo('c_a','col1'), ddo('c_b','col2') ] } },
				// second source repeats c_a in col1 (must be deduped) and adds nothing new
				{ show:{ ddo_map:[ ddo('c_a','col1') ] } }
			] },
			columns_map		: [ { id:'col1' }, { id:'col2' } ],
			datum			: { context:[ ctx('c_a'), ctx('c_b') ], data:[] }
		})

		const a = register_child(child_key_of(sr, { model:'component_input_text', tipo:'c_a', section_tipo:'st_col', lang:'lg-eng', column_id:'col1' }), spy_child('c_a'))
		const b = register_child(child_key_of(sr, { model:'component_input_text', tipo:'c_b', section_tipo:'st_col', lang:'lg-eng', column_id:'col2' }), spy_child('c_b'))

		const instances = await sr.get_ar_columns_instances_list()

		assert.equal(instances.length, 2, 'the repeated tipo must be built once')
		assert.equal(instances[0], a, 'col1 child comes first')
		assert.equal(instances[1], b, 'col2 child comes second')
		assert.equal(a.build_calls, 1, 'deduped child built exactly once')
	})


	it(`get_ar_columns_instances_list skips a column whose context the server did not send`, async function() {

		const sr = await make_section_record({
			tipo			: 'tipo_miss',
			section_tipo	: 'st_miss',
			section_id		: 1,
			mode			: 'list',
			context			: { request_config:[ { show:{ ddo_map:[
				{ parent:'tipo_miss', column_id:'col1', tipo:'m_ok',		mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' },
				{ parent:'tipo_miss', column_id:'col2', tipo:'m_nodata',	mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' },
				// a grandchild (parent is not self.tipo) must never be considered here.
				// (!) It IS given a context entry and a registered child below, so the
				// only thing that can drop it is the first-level parent filter
				{ parent:'m_ok',      column_id:'col1', tipo:'m_grand',	mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' }
			] } } ] },
			columns_map		: [ { id:'col1' }, { id:'col2' } ],
			// no context entry for m_nodata — that is what makes it the missing-context case
			datum			: { context:[
				{ tipo:'m_ok',    mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' },
				{ tipo:'m_grand', mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' }
			], data:[] }
		})

		const ok = register_child(child_key_of(sr, { model:'component_input_text', tipo:'m_ok', section_tipo:'st_miss', lang:'lg-eng', column_id:'col1' }), spy_child('m_ok'))
		register_child(child_key_of(sr, { model:'component_input_text', tipo:'m_grand', section_tipo:'st_miss', lang:'lg-eng', column_id:'col1' }), spy_child('m_grand'))

		const instances = await sr.get_ar_columns_instances_list()

		assert.equal(instances.length, 1, 'missing context is non-fatal (m_nodata skipped) and a grandchild is never a first-level ddo')
		assert.equal(instances[0], ok, 'the well-defined column still builds')
	})


	it(`get_ar_columns_instances_list uses search.ddo_map in search mode and falls back to show.ddo_map when it is empty`, async function() {

		const base = (tipo) => ({ parent:'tipo_s', column_id:'col1', tipo:tipo, mode:'search', section_tipo:'st_s', model:'component_input_text', lang:'lg-eng' })
		const ctx  = (tipo) => ({ tipo:tipo, mode:'search', section_tipo:'st_s', model:'component_input_text', lang:'lg-eng' })

		// 1) search map defined -> it wins
			const sr_search = await make_section_record({
				tipo:'tipo_s', section_tipo:'st_s', section_id:1, mode:'search',
				context		: { request_config:[ { search:{ ddo_map:[ base('s_search') ] }, show:{ ddo_map:[ base('s_show') ] } } ] },
				columns_map	: [ { id:'col1' } ],
				datum		: { context:[ ctx('s_search'), ctx('s_show') ], data:[] }
			})
			const s_search = register_child(child_key_of(sr_search, { model:'component_input_text', tipo:'s_search', section_tipo:'st_s', lang:'lg-eng', column_id:'col1' }), spy_child('s_search'))
			register_child(child_key_of(sr_search, { model:'component_input_text', tipo:'s_show', section_tipo:'st_s', lang:'lg-eng', column_id:'col1' }), spy_child('s_show'))

			const searched = await sr_search.get_ar_columns_instances_list()
			assert.equal(searched.length, 1, 'one child from the search map')
			assert.equal(searched[0], s_search, 'search.ddo_map wins in search mode')

		// 2) empty search map -> fall back to show
			const sr_fallback = await make_section_record({
				tipo:'tipo_s2', section_tipo:'st_s', section_id:2, mode:'search',
				context		: { request_config:[ { search:{ ddo_map:[] }, show:{ ddo_map:[ Object.assign(base('s_show2'), {parent:'tipo_s2'}) ] } } ] },
				columns_map	: [ { id:'col1' } ],
				datum		: { context:[ ctx('s_show2') ], data:[] }
			})
			const s_show2 = register_child(child_key_of(sr_fallback, { model:'component_input_text', tipo:'s_show2', section_tipo:'st_s', lang:'lg-eng', column_id:'col1' }), spy_child('s_show2'))

			const fell_back = await sr_fallback.get_ar_columns_instances_list()
			assert.equal(fell_back.length, 1, 'the show map is used when the search map is empty')
			assert.equal(fell_back[0], s_show2, 'fallback child built')
	})


	it(`get_ar_columns_instances_list shares one build pass between concurrent callers`, async function() {

		const sr = await make_section_record({
			tipo:'tipo_w', section_tipo:'st_w', section_id:1, mode:'list',
			context		: { request_config:[ { show:{ ddo_map:[
				{ parent:'tipo_w', column_id:'col1', tipo:'w_a', mode:'list', section_tipo:'st_w', model:'component_input_text', lang:'lg-eng' }
			] } } ] },
			columns_map	: [ { id:'col1' } ],
			datum		: { context:[ { tipo:'w_a', mode:'list', section_tipo:'st_w', model:'component_input_text', lang:'lg-eng' } ], data:[] }
		})

		// slow child so the second call certainly lands while the first is pending
		const key	= child_key_of(sr, { model:'component_input_text', tipo:'w_a', section_tipo:'st_w', lang:'lg-eng', column_id:'col1' })
		const child	= register_child(key, {
			id			: key,
			build_calls	: 0,
			build		: async function(){ this.build_calls++; await new Promise(r => setTimeout(r, 60)); return true }
		})

		// (!) the method is an `async function`, so each CALL returns its own wrapper
		// promise; what is shared is the inner `_instances_waiter` (and therefore the
		// single build pass), not the returned promise identity
		const p1 = sr.get_ar_columns_instances_list()
		const p2 = sr.get_ar_columns_instances_list()

		const [r1, r2] = await Promise.all([p1, p2])

		assert.equal(r1, r2, 'both callers get the same array')
		assert.equal(r1.length, 1, 'the child is present once, not duplicated')
		assert.equal(child.build_calls, 1, 'only one build pass ran')
		assert.equal(sr._instances_waiter, null, 'waiter released on success')

		// a later call short-circuits on ar_instances without touching the waiter
		const r3 = await sr.get_ar_columns_instances_list()
		assert.equal(r3, r1, 'post-completion call returns the cached array')
		assert.equal(child.build_calls, 1, 'still one build')
	})


	it(`get_ar_columns_instances_list honours fixed_mode===true for the child mode`, async function() {

		const sr = await make_section_record({
			tipo:'tipo_fm', section_tipo:'st_fm', section_id:1, mode:'list',
			context		: { request_config:[ { show:{ ddo_map:[
				{ parent:'tipo_fm', column_id:'col1', tipo:'fm_a', mode:'edit', fixed_mode:true, section_tipo:'st_fm', model:'component_input_text', lang:'lg-eng' },
				// fixed_mode as a non-boolean is NOT the flag: this child keeps the record mode
				{ parent:'tipo_fm', column_id:'col2', tipo:'fm_b', mode:'edit', fixed_mode:'edit', section_tipo:'st_fm', model:'component_input_text', lang:'lg-eng' }
			] } } ] },
			columns_map	: [ { id:'col1' }, { id:'col2' } ],
			datum		: { context:[
				{ tipo:'fm_a', mode:'edit', section_tipo:'st_fm', model:'component_input_text', lang:'lg-eng' },
				{ tipo:'fm_b', mode:'edit', section_tipo:'st_fm', model:'component_input_text', lang:'lg-eng' }
			], data:[] }
		})

		const a = register_child(child_key_of(sr, { model:'component_input_text', tipo:'fm_a', section_tipo:'st_fm', mode:'edit', lang:'lg-eng', column_id:'col1' }), spy_child('fm_a'))
		const b = register_child(child_key_of(sr, { model:'component_input_text', tipo:'fm_b', section_tipo:'st_fm', mode:'list', lang:'lg-eng', column_id:'col2' }), spy_child('fm_b'))

		const instances = await sr.get_ar_columns_instances_list()

		assert.equal(instances.length, 2, 'both columns build')
		assert.equal(instances[0], a, 'fixed_mode===true -> the child is instanced in the ontology mode (edit)')
		assert.equal(instances[1], b, 'a truthy non-true fixed_mode keeps the section_record mode (list)')
	})
})


/**
* SECTION_RECORD (time machine keying)
* The tool_time_machine preview portal and the live "Now" portal render the SAME
* entries of the SAME component, both with id_variant 'tool_time_machine'. The only
* coordinate that tells them apart is the TM row id (matrix_id), and it must reach:
*
*   get_section_records — from the CALLER (options || caller), never the locator
*   the section_record   — in its instance key and as `data_source`
*   its children         — matrix_id (key) to every child; data_source 'tm' ONLY to
*                          the component_dataframe (the only child whose record IS
*                          the TM row's; the server refuses the row for any other)
*
* Before 2026-09-29 get_section_records passed neither: the preview received the
* live, already-built section_record from the cache — and with it the live
* dataframe child — so the preview always showed the live frames.
*
* Children here are REAL instances (component_input_text, component_dataframe),
* built with autoload=false from the injected datum: no API request is issued.
* Every instance created is destroyed deep in after() (registry hygiene).
*/

// tm fixtures. Generic test TLD only
	const TM_MAIN_TIPO		= 'test_tm_main'	// the previewed portal (main component)
	const TM_HOST_TIPO		= 'test3'			// its section
	const TM_TARGET_TIPO	= 'test_tm_target'	// the linked record's section
	const TM_DF_TIPO		= 'test_tm_df'		// dataframe slot
	const TM_TEXT_TIPO		= 'test_tm_text'	// a plain child of the linked record
	const TM_MATRIX_ID		= 51581272

	// one portal entry: linked record test_tm_target/5, main item id (id_key) 3
	const tm_entries = () => [{ id:3, section_tipo:TM_TARGET_TIPO, section_id:5, paginated_key:0 }]

	const tm_context = () => [
		{ model:'component_dataframe', tipo:TM_DF_TIPO, section_tipo:TM_TARGET_TIPO, parent:TM_MAIN_TIPO, type:'component', mode:'edit', lang:'lg-nolan', request_config:[] },
		{ model:'component_input_text', tipo:TM_TEXT_TIPO, section_tipo:TM_TARGET_TIPO, parent:TM_MAIN_TIPO, type:'component', mode:'edit', lang:'lg-nolan', request_config:[] }
	]

	// frame datum entry for the main item id_key 3 — `frame_id` marks whose datum it is
	const tm_frame = (frame_id) => ({
		tipo				: TM_DF_TIPO,
		section_tipo		: TM_TARGET_TIPO,
		section_id			: 1, // the caller's (host) section_id
		mode				: 'edit',
		id_key				: 3,
		main_component_tipo	: TM_MAIN_TIPO,
		entries				: frame_id===null ? [] : [{ type:'dd490', section_tipo:'test_tm_frame', section_id:frame_id, id_key:3, main_component_tipo:TM_MAIN_TIPO }]
	})

	// the two portal callers get_section_records sees
	const make_tm_caller = (extra={}) => Object.assign({
		model			: 'component_portal',
		tipo			: TM_MAIN_TIPO,
		section_tipo	: TM_HOST_TIPO,
		section_id		: 1,
		mode			: 'edit',
		lang			: 'lg-nolan',
		id_variant		: 'tool_time_machine',
		permissions		: 1,
		context			: { request_config:[] },
		data			: { entries:tm_entries() }
	}, extra)

	// tm_built — every instance these cases create, destroyed deep in after()
	const tm_built = []



describe(`SECTION_RECORD (time machine keying)`, async () => {

	after(async function(){
		for (const instance of tm_built) {
			if (instance && instance.status!=='destroyed') {
				await instance.destroy(true, true, false)
			}
		}
		tm_built.length = 0
	})


	it(`a TM caller and a live caller over the same entries get distinct section_records and dataframe children, each with its own datum`, async function() {

		this.timeout(10000)

		// preview (TM row: frame 585 absent -> no frame) vs live (frame 585)
			const tm_datum		= { context:tm_context(), data:[ tm_frame(null) ] }
			const live_datum	= { context:tm_context(), data:[ tm_frame(585) ] }

			const tm_caller		= make_tm_caller({ matrix_id:TM_MATRIX_ID, data_source:'tm', datum:tm_datum })
			const live_caller	= make_tm_caller({ datum:live_datum })

		// live first: it is the one already built (and cached) when the preview asks
			const [live_sr]	= await get_section_records({ caller:live_caller, mode:'edit' })
			const [tm_sr]	= await get_section_records({ caller:tm_caller, mode:'edit' })
			tm_built.push(live_sr, tm_sr)

			assert.ok(live_sr && tm_sr, 'both records are built')
			assert.notStrictEqual(tm_sr, live_sr, 'the preview must NOT receive the live section_record from the cache')
			assert.notEqual(tm_sr.id, live_sr.id, 'distinct instance keys')
			assert.strictEqual(tm_sr.matrix_id, TM_MATRIX_ID, 'the preview record carries the caller matrix_id')
			assert.strictEqual(tm_sr.data_source, 'tm', 'the preview record carries the caller data_source')
			assert.strictEqual(live_sr.matrix_id, null, 'the live record has no matrix_id')
			assert.strictEqual(live_sr.data_source, null, 'the live record has no data_source')
			assert.strictEqual(tm_sr.datum, tm_datum, 'the preview record holds the TM datum')
			assert.strictEqual(live_sr.datum, live_datum, 'the live record holds the live datum')

		// children
			const live_children	= await live_sr.get_ar_instances_edit()
			const tm_children	= await tm_sr.get_ar_instances_edit()
			tm_built.push(...live_children, ...tm_children)

			const live_df	= live_children.find(el => el.model==='component_dataframe')
			const tm_df		= tm_children.find(el => el.model==='component_dataframe')
			const tm_text	= tm_children.find(el => el.model==='component_input_text')
			const live_text	= live_children.find(el => el.model==='component_input_text')

			assert.ok(live_df && tm_df && tm_text && live_text, 'both records build both children')
			assert.notStrictEqual(tm_df, live_df, 'the preview dataframe is NOT the live dataframe')
			assert.notStrictEqual(tm_text, live_text, 'the preview plain child is NOT the live one')

			assert.deepEqual(tm_df.data.entries, [], 'the preview dataframe shows the TM row (no frame)')
			assert.equal(live_df.data.entries.length, 1, 'the live dataframe keeps its frame')
			assert.equal(live_df.data.entries[0].section_id, 585, 'the live frame is 585')

		// option forwarding: matrix_id to every child, data_source ONLY to the dataframe
			assert.strictEqual(tm_df.matrix_id, TM_MATRIX_ID, 'the dataframe child is keyed by the TM row')
			assert.strictEqual(tm_df.data_source, 'tm', 'the dataframe child reads as of the TM row')
			assert.strictEqual(tm_text.matrix_id, TM_MATRIX_ID, 'a plain child is keyed by the TM row too')
			assert.notEqual(tm_text.data_source, 'tm', 'a plain child (another record) must NOT get data_source tm')
			assert.notEqual(live_df.data_source, 'tm', 'the live dataframe has no data_source')

		// sync_data: the live dataframe subscribes, the preview one must not
			const subscribed_events = (instance) => (instance.events_tokens || [])
				.map(token => event_manager.tokenMap.get(token)?.event_name)
			assert.ok(subscribed_events(live_df).some(el => el && el.startsWith('sync_data_')), 'the live dataframe subscribes to sync_data (control)')
			assert.notOk(subscribed_events(tm_df).some(el => el && el.startsWith('sync_data_')), 'the preview dataframe must NOT subscribe to live sync_data')

		// destroying the preview subtree leaves the live record intact
			await tm_sr.destroy(true, true, false)
			assert.equal(tm_sr.status, 'destroyed', 'preview record destroyed')
			assert.equal(tm_df.status, 'destroyed', 'preview dataframe destroyed with it (deep)')
			assert.notEqual(live_sr.status, 'destroyed', 'the live record survives')
			assert.notEqual(live_df.status, 'destroyed', 'the live dataframe survives')
			assert.strictEqual(get_instance_by_id(live_sr.id), live_sr, 'the live record is still registered')
			assert.strictEqual(get_instance_by_id(live_df.id), live_df, 'the live dataframe is still registered')
	})


	it(`get_dataframe (literal-main path) forwards matrix_id AND data_source 'tm' from a TM preview main`, async function() {

		this.timeout(10000)

		// a literal main (e.g. a component_iri preview) holding its slot ddo and the frame datum
			const make_main = (extra={}) => Object.assign({
				tipo			: 'test_tm_lit',
				section_tipo	: TM_HOST_TIPO,
				section_id		: 1,
				context			: { request_config:[ { show:{ ddo_map:[
					{ model:'component_dataframe', tipo:TM_DF_TIPO, section_tipo:TM_HOST_TIPO, mode:'edit' }
				] } } ] },
				datum			: { context:[
					{ model:'component_dataframe', tipo:TM_DF_TIPO, section_tipo:TM_HOST_TIPO, type:'component', mode:'edit', lang:'lg-nolan', request_config:[] }
				], data:[
					Object.assign(tm_frame(585), { section_tipo:TM_HOST_TIPO, main_component_tipo:'test_tm_lit' })
				] }
			}, extra)

			const frame_options = { section_id:1, id_key:3, main_component_tipo:'test_tm_lit', lang:'lg-nolan' }

			const tm_df		= await get_dataframe(Object.assign({ self:make_main({ matrix_id:TM_MATRIX_ID, data_source:'tm' }) }, frame_options))
			const live_df	= await get_dataframe(Object.assign({ self:make_main() }, frame_options))
			tm_built.push(tm_df, live_df)

			assert.ok(tm_df && live_df, 'both frames are built')
			assert.notStrictEqual(tm_df, live_df, 'distinct frame instances')
			assert.strictEqual(tm_df.matrix_id, TM_MATRIX_ID, 'the preview frame is keyed by the TM row')
			assert.strictEqual(tm_df.data_source, 'tm', 'the preview frame reads as of the TM row')
			assert.notEqual(live_df.data_source, 'tm', 'the live frame has no data_source')
			assert.equal(tm_df.data.entries[0].section_id, 585, 'the preview frame pairs its datum entry by id_key (no matrix_id match needed)')

		// matrix_id is NOT a pairing discriminator: an item carrying a (foreign) matrix_id still
		// pairs by id_key + main_component_tipo (the retired el.matrix_id branch would drop it)
			const stamped_main = make_main({ matrix_id:TM_MATRIX_ID, data_source:'tm' })
			stamped_main.datum.data[0].matrix_id = 999
			const stamped_df = await get_dataframe(Object.assign({ self:stamped_main }, frame_options))
			tm_built.push(stamped_df)
			assert.equal(stamped_df.data?.entries?.[0]?.section_id, 585, 'an item matrix_id never filters the pairing')

			const subscribed_events = (instance) => (instance.events_tokens || [])
				.map(token => event_manager.tokenMap.get(token)?.event_name)
			assert.ok(subscribed_events(live_df).some(el => el && el.startsWith('sync_data_')), 'the live frame subscribes to sync_data (control)')
			assert.notOk(subscribed_events(tm_df).some(el => el && el.startsWith('sync_data_')), 'the preview frame must NOT subscribe to live sync_data')
	})


	it(`get_dataframe (literal-main path) keys a nested main with matrix_id but NO data_source: no tm read for another record, no live sync inside the preview`, async function() {

		this.timeout(10000)

		// a nested literal main of a linked record inside a preview portal row: section_record
		// build_instance forwards matrix_id (keying) but not data_source. Its frame is a DIFFERENT
		// record than the TM row's, so a data_source 'tm' read would be refused by the server
		// (tmRowBelongsToRecord) and blank the frame.
			const nested_main = {
				tipo			: 'test_tm_nested',
				section_tipo	: TM_TARGET_TIPO,
				section_id		: 5,
				matrix_id		: TM_MATRIX_ID,
				context			: { request_config:[ { show:{ ddo_map:[
					{ model:'component_dataframe', tipo:TM_DF_TIPO, section_tipo:TM_TARGET_TIPO, mode:'edit' }
				] } } ] },
				datum			: { context:[
					{ model:'component_dataframe', tipo:TM_DF_TIPO, section_tipo:TM_TARGET_TIPO, type:'component', mode:'edit', lang:'lg-nolan', request_config:[] }
				], data:[
					Object.assign(tm_frame(585), { section_id:5, main_component_tipo:'test_tm_nested' })
				] }
			}

			const frame = await get_dataframe({ self:nested_main, section_id:5, id_key:3, main_component_tipo:'test_tm_nested', lang:'lg-nolan' })
			tm_built.push(frame)

			assert.ok(frame, 'the frame is built')
			assert.strictEqual(frame.matrix_id, TM_MATRIX_ID, 'the frame is still keyed by the TM row (no collision with the live frame)')
			assert.ok(frame.id_variant.endsWith(`_${TM_MATRIX_ID}`), 'matrix_id is part of the frame id_variant')
			assert.notEqual(frame.data_source, 'tm', 'a nested main without data_source tm must NOT send tm reads for another record')

			const subscribed_events = (instance) => (instance.events_tokens || [])
				.map(token => event_manager.tokenMap.get(token)?.event_name)
			// reads stay live (no data_source 'tm' above), but the frame is a descendant of a TM
			// preview (matrix_id up its chain): a live save must not re-render inside the snapshot
			// (events_subscription is_time_machine_view walks the whole caller chain)
			assert.notOk(subscribed_events(frame).some(el => el && el.startsWith('sync_data_')), 'a frame inside a TM preview does not follow live saves (sync_data)')
	})


	it(`the tool 'Now' pane (id_variant tool_time_machine, no matrix_id) and the page get distinct dataframe children; a deep destroy of one leaves the other`, async function() {

		this.timeout(10000)

		// own main tipo: no key overlap with the other cases of this suite
			const NOW_MAIN_TIPO = 'test_tm_now'
			const now_context = () => tm_context().map(el => Object.assign(el, { parent:NOW_MAIN_TIPO }))
			const now_frame = (frame_id) => {
				const frame = tm_frame(frame_id)
				frame.main_component_tipo = NOW_MAIN_TIPO
				frame.entries.forEach(el => { el.main_component_tipo = NOW_MAIN_TIPO })
				return frame
			}

		// same live datum, same entries; only the caller id_variant differs (the page portal has none)
			const page_caller	= make_tm_caller({ tipo:NOW_MAIN_TIPO, id_variant:null, datum:{ context:now_context(), data:[ now_frame(585) ] } })
			const now_caller	= make_tm_caller({ tipo:NOW_MAIN_TIPO, datum:{ context:now_context(), data:[ now_frame(585) ] } })

		// the page first: it is the one already built (and cached) when the tool opens
			const [page_sr]	= await get_section_records({ caller:page_caller, mode:'edit' })
			const [now_sr]	= await get_section_records({ caller:now_caller, mode:'edit' })
			tm_built.push(page_sr, now_sr)
			assert.ok(page_sr && now_sr, 'both records are built')
			assert.notStrictEqual(now_sr, page_sr, 'distinct section_records (control: their id_variant differs)')

			const page_children	= await page_sr.get_ar_instances_edit()
			const now_children	= await now_sr.get_ar_instances_edit()
			tm_built.push(...page_children, ...now_children)

			const page_df	= page_children.find(el => el.model==='component_dataframe')
			const now_df	= now_children.find(el => el.model==='component_dataframe')
			assert.ok(page_df && now_df, 'both records build their dataframe child')
			assert.notStrictEqual(now_df, page_df, 'the Now pane must NOT receive the page dataframe from the cache')
			assert.notEqual(now_df.id, page_df.id, 'distinct dataframe instance keys')
			assert.strictEqual(now_df.caller, now_sr, 'the Now dataframe belongs to the Now record')
			assert.strictEqual(page_df.caller, page_sr, 'the page dataframe still belongs to the page record')

		// key contract: <section_record id_variant>_<base>_<id_key>_<main_component_tipo>
		// (base = <tipo>_<section_tipo>_<section_id>_<caller section_tipo>_<caller section_id>)
			const base = `${NOW_MAIN_TIPO}_${now_sr.section_tipo}_5_${TM_HOST_TIPO}_1`
			assert.equal(now_df.id_variant, `tool_time_machine_${base}_3_${NOW_MAIN_TIPO}`, 'the dataframe id_variant keeps the parent id_variant prefix')
			assert.equal(page_df.id_variant, `${base}_3_${NOW_MAIN_TIPO}`, 'without a parent id_variant the key is unchanged')

		// closing the tool deep-destroys its subtree: the page dataframe must survive
			await now_sr.destroy(true, true, true)
			assert.equal(now_df.status, 'destroyed', 'the Now dataframe is destroyed with its record (deep)')
			assert.notEqual(page_df.status, 'destroyed', 'the page dataframe survives the tool close')
			assert.strictEqual(get_instance_by_id(page_df.id), page_df, 'the page dataframe is still registered')
			assert.strictEqual(get_instance_by_id(page_sr.id), page_sr, 'the page record is still registered')
	})


	it(`get_section_records takes matrix_id from options over the caller, and never from the locator`, async function() {

		const datum = { context:[], data:[] }

		// options win over the caller
			const [from_options] = await get_section_records({
				caller		: make_tm_caller({ matrix_id:111, data_source:'tm', datum:datum, tipo:'test_tm_opt' }),
				mode		: 'edit',
				matrix_id	: 222,
				data_source	: 'tm'
			})
			tm_built.push(from_options)
			assert.strictEqual(from_options.matrix_id, 222, 'options.matrix_id wins over caller.matrix_id')

		// a dd15-like entry carrying its own matrix_id must NOT key the record
			const [from_locator] = await get_section_records({
				caller	: make_tm_caller({ datum:datum, tipo:'test_tm_loc' }),
				mode	: 'edit',
				entries	: [{ section_tipo:TM_TARGET_TIPO, section_id:6, paginated_key:0, matrix_id:333 }]
			})
			tm_built.push(from_locator)
			assert.strictEqual(from_locator.matrix_id, null, 'locator.matrix_id is never read')
			assert.strictEqual(from_locator.data_source, null, 'no data_source without a TM caller')
	})


	it(`a section caller with no matrix_id keeps the pre-existing section_record key`, async function() {

		const caller = {
			model			: 'section',
			tipo			: 'test_tm_sec',
			section_tipo	: 'test_tm_sec',
			section_id		: null,
			mode			: 'list',
			lang			: 'lg-eng',
			permissions		: 1,
			context			: { request_config:[] },
			datum			: { context:[], data:[] },
			data			: { entries:[{ section_tipo:'test_tm_sec', section_id:8, paginated_key:0 }] }
		}

		const [sr] = await get_section_records({ caller:caller })
		tm_built.push(sr)

		const expected_key = key_instances_builder({
			model			: 'section_record',
			tipo			: 'test_tm_sec',
			section_tipo	: 'test_tm_sec',
			section_id		: 8,
			mode			: 'list',
			lang			: 'lg-eng'
		})
		assert.equal(sr.id, expected_key, 'no matrix_id / data_source segment in the key of a plain section record')
		assert.strictEqual(sr.matrix_id, null, 'matrix_id stays null')
	})
})



/**
* SECTION_RECORD (caller show_interface)
* A page that hands a section its own request_config may declare, per ddo,
* `properties.show_interface` (the preset editors and tool_user_admin declare
* `{tools:false}`). The server never sees it (client ddo whitelist, spec §7.8),
* so section_record applies it to the child's context clone
* (apply_caller_show_interface). Pinned: the declaration reaches the child; and
* every limit that keeps other behaviour unchanged — only show_interface; the
* element's own interface wins (request_config show.interface overlaid by
* properties.show_interface, the set_context_vars precedence); only a section
* caller's main dedalo show.ddo_map, matched by tipo + section_tipo + parent;
* malformed values ignored; nothing shared with the page.
*/
describe(`SECTION_RECORD (caller show_interface)`, async () => {

	const ctx = (extra={}) => ({
		model			: 'component_input_text',
		tipo			: 'csi_1',
		section_tipo	: 'csi_st',
		mode			: 'edit',
		properties		: {},
		...extra
	})
	const caller_with = (ddo_properties, extra_ddo={}, caller_extra={}) => ({
		model			: 'section',
		request_config	: [{
			api_engine	: 'dedalo',
			type		: 'main',
			show		: { ddo_map : [{ tipo:'csi_1', section_tipo:'csi_st', parent:'csi_st', properties:ddo_properties, ...extra_ddo }] }
		}],
		...caller_extra
	})

	it(`the caller's show_interface reaches the child context`, function() {
		const context = ctx()
		const applied = apply_caller_show_interface({ tipo:'csi_st', caller:caller_with({show_interface:{tools:false, button_add:false}}) }, context)
		assert.equal(applied, true)
		assert.deepEqual(context.properties.show_interface, {tools:false, button_add:false})
	})

	it(`the ontology wins a conflicting key; the caller only adds`, function() {
		const context = ctx({ properties:{ show_interface:{tools:true, button_add:true} } })
		apply_caller_show_interface({ tipo:'csi_st', caller:caller_with({show_interface:{tools:false, button_fullscreen:false}}) }, context)
		assert.deepEqual(context.properties.show_interface, {tools:true, button_add:true, button_fullscreen:false})
	})

	it(`no other properties key is taken from the caller`, function() {
		const context = ctx({ properties:{ css:{a:1} } })
		apply_caller_show_interface({ tipo:'csi_st', caller:caller_with({show_interface:{tools:false}, css:{b:2}, view:'line', source:{}}) }, context)
		assert.deepEqual(context.properties, { css:{a:1}, show_interface:{tools:false} })
	})

	it(`only a section caller, only its main dedalo show.ddo_map`, function() {
		const decl = {show_interface:{tools:false}}
		const cases = [
			{ caller:null },
			{ caller:{...caller_with(decl), model:'component_portal'} },
			{ caller:{ model:'section', request_config:null } },
			{ caller:{ model:'section', request_config:[{ api_engine:'zenon', type:'main', show:{ ddo_map:[{tipo:'csi_1', properties:decl}] } }] } },
			{ caller:{ model:'section', request_config:[{ api_engine:'dedalo', type:'secondary', show:{ ddo_map:[{tipo:'csi_1', properties:decl}] } }] } }
		]
		for (const self of cases) {
			const context = ctx()
			assert.equal(apply_caller_show_interface({ tipo:'csi_st', ...self }, context), false)
			assert.deepEqual(context.properties, {}, 'context untouched')
		}
	})

	it(`the ddo is matched by tipo AND section_tipo ('self', absent and arrays match)`, function() {
		const decl = {show_interface:{tools:false}}
		const match = (extra_ddo) => apply_caller_show_interface({ tipo:'csi_st', caller:caller_with(decl, extra_ddo) }, ctx())
		assert.equal(match({section_tipo:'self'}), true)
		assert.equal(match({section_tipo:undefined}), true)
		assert.equal(match({section_tipo:['x', 'csi_st']}), true)
		assert.equal(match({section_tipo:'other_st'}), false, 'same tipo in another section is another element')
		assert.equal(match({tipo:'csi_2'}), false)
	})

	it(`a malformed show_interface is ignored`, function() {
		for (const bad of ['tools:false', [{tools:false}], null, 7, undefined]) {
			const context = ctx()
			assert.equal(apply_caller_show_interface({ tipo:'csi_st', caller:caller_with({show_interface:bad}) }, context), false)
			assert.deepEqual(context.properties, {})
		}
	})

	it(`the element's own show.interface (request_config) is kept, properties overlaying it`, function() {
		// set_context_vars reads properties.show_interface INSTEAD of
		// request_config_object.show.interface once the former exists, so the
		// merge must seed from both or an ontology show.interface is lost
		const context = ctx({
			request_config : [{ api_engine:'dedalo', type:'main', show:{ interface:{ button_tree:true, tools:true, button_link:false } } }],
			properties : { show_interface:{ tools:false } }
		})
		apply_caller_show_interface({ tipo:'csi_st', caller:caller_with({show_interface:{tools:true, button_link:true, button_add:false}}) }, context)
		assert.deepEqual(context.properties.show_interface, {
			tools		: false, // properties over show.interface over the caller
			button_tree	: true,  // element show.interface
			button_link	: false, // element show.interface over the caller
			button_add	: false  // caller, unset by the element
		})
	})

	it(`the ddo is matched by parent too ('self'/absent = the row's section)`, function() {
		const decl = {show_interface:{tools:false}}
		const match = (extra_ddo) => apply_caller_show_interface({ tipo:'csi_st', caller:caller_with(decl, extra_ddo) }, ctx())
		assert.equal(match({parent:'self'}), true)
		assert.equal(match({parent:undefined}), true)
		assert.equal(match({parent:'csi_portal'}), false, 'a deeper ddo of the same tipo/section is another element')
	})

	it(`nothing is shared with the page's request_config`, function() {
		const caller = caller_with({show_interface:{tools:false, button_edit_options:{action_mousedown:'navigate'}}})
		const context = ctx()
		apply_caller_show_interface({ tipo:'csi_st', caller }, context)
		context.properties.show_interface.button_edit_options.action_mousedown = 'changed'
		context.properties.show_interface.tools = true
		const declared = caller.request_config[0].show.ddo_map[0].properties.show_interface
		assert.equal(declared.button_edit_options.action_mousedown, 'navigate')
		assert.equal(declared.tools, false)
	})

	it(`end to end: a child built by get_ar_instances_edit gets show_interface.tools false`, async function() {

		this.timeout(8000)

		const caller = {
			...caller_with({show_interface:{tools:false}}),
			section_tipo	: 'csi_st',
			section_id		: 1,
			permissions		: {}
		}
		const sr = new section_record()
		await sr.init({
			model			: 'section_record',
			tipo			: 'csi_st',
			section_tipo	: 'csi_st',
			section_id		: 1,
			mode			: 'edit',
			lang			: 'lg-eng',
			context			: {},
			datum			: { context:[], data:[] },
			caller			: caller,
			id_variant		: 'csi_e2e'
		})
		sr.datum.context = [{
			...ctx(),
			parent			: 'csi_st',
			type			: 'component',
			lang			: 'lg-nolan',
			permissions		: 2,
			tools			: [{ name:'tool_time_machine' }]
		}]

		const built = await sr.get_ar_instances_edit()
		try {
			assert.equal(built.length, 1, 'one child built')
			assert.equal(built[0].show_interface.tools, false, 'the declared tools:false reached the component')
			assert.equal(built[0].show_interface.button_add, true, 'undeclared keys keep the defaults')
			assert.deepEqual(sr.datum.context[0].properties, {}, 'the shared datum.context is untouched')
		} finally {
			for (const instance of built) {
				await instance.destroy?.()
			}
		}
	})
})



// @license-end
