// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, after, assert, window */
/*eslint no-undef: "error"*/
'use strict';



import {section_record} from '../../../core/section_record/js/section_record.js'
import {add_instance, delete_instance, key_instances_builder} from '../../../core/common/js/instances.js'



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



describe(`SECTION_RECORD`, async () => {

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
			const id_variant = `${sr.tipo}_${sr.section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`
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
			const id_variant = `${sr.tipo}_${sr.section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`
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
* column_id); a child requested under any other key falls through to a dynamic import
* of a non-existent module, resolves null, and is filtered out.
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
	const id_variant_of = (sr, section_id) =>
		`${sr.tipo}_${section_id}_${sr.caller.section_tipo}_${sr.caller.section_id}`

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
		assert.equal(sr.matrix_id, null, 'matrix_id defaults to null (not undefined)')
		assert.equal(sr.node, null, 'node is null before render')
		assert.equal(sr.label, null, 'label is null on init')
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

		const second	= await sr.init({
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

		window.SHOW_DEBUG = show_debug_backup

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
		assert.equal(stub.id_key, undefined, 'non-dataframe stub must NOT carry pairing keys')
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
		// the dataframe child is registered too: if it were built it WOULD show up
		register_child(child_key_of(sr, dataframe), spy_child('df_g'))

		const instances = await sr.get_ar_instances_edit()

		assert.equal(instances.length, 1, 'a section caller must exclude component_dataframe')
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
				// a grandchild (parent is not self.tipo) must never be considered here
				{ parent:'m_ok',      column_id:'col1', tipo:'m_grand',	mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' }
			] } } ] },
			columns_map		: [ { id:'col1' }, { id:'col2' } ],
			// no context entry for m_nodata / m_grand
			datum			: { context:[ { tipo:'m_ok', mode:'list', section_tipo:'st_miss', model:'component_input_text', lang:'lg-eng' } ], data:[] }
		})

		const ok = register_child(child_key_of(sr, { model:'component_input_text', tipo:'m_ok', section_tipo:'st_miss', lang:'lg-eng', column_id:'col1' }), spy_child('m_ok'))

		const instances = await sr.get_ar_columns_instances_list()

		assert.equal(instances.length, 1, 'missing context is non-fatal: the column is simply skipped')
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



// @license-end
