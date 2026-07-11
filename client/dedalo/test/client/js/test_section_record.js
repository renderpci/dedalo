// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';



import {section_record} from '../../../core/section_record/js/section_record.js'
import {add_instance, key_instances_builder} from '../../../core/common/js/instances.js'



/**
* TEST_SECTION_RECORD
* Focused regression tests for the two child-build error paths in section_record:
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


// @license-end
