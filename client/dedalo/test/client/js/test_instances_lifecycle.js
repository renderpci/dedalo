// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {
	elements
} from './elements.js'
import {
	get_instance,
	get_all_instances,
	delete_instance,
	delete_instances,
	find_instances,
	key_instances_builder
} from '../../../core/common/js/instances.js'



// vars
	const ar_view_edit = [
		'line_edit',
		'print'
	]
	const ar_view_list = [
		'mini',
		'text'
	]
	const ar_mode = [
		'edit',
		'list',
		'search'
	]
	const ar_mode_length	= ar_mode.length
	const elements_length	= elements.length
	const caller			= await get_instance({
		model			: 'section',
		section_tipo	: 'test3',
		tipo			: 'test3',
		mode			: 'list'
	})



describe(`INSTANCES LIFE-CYCLE`, async function() {

	// instances
	it(`instances`, async function() {

		const module = await import('../../../core/common/js/instances.js')

		assert.equal(typeof module, 'object', 'module must be object');
		[
			'get_instance',
			'get_all_instances',
			'delete_instances',
			'find_instances',
			'key_instances_builder'

		].map((el)=>{
			assert.equal(typeof module[el], 'function', 'el must be function');
		})
	})

	// elements iterate
	for (let i = 0; i < elements_length; i++) {

		// element is an object with the instance options
		const element = elements[i]

		describe(`${element.model.toUpperCase()}`, async function() {

			// modes iterate for each element (edit, list, search)
				await (async ()=>{
					for (let k = 0; k < ar_mode_length; k++) {

						element.mode = ar_mode[k]
						element.view = 'default'

						const options = {
							id_variant		: Math.random() + '-' + Math.random(),
							lang			: element.lang,
							mode			: ar_mode[k],
							model			: element.model,
							section_id		: element.section_id,
							section_tipo	: element.section_tipo,
							tipo			: element.tipo,
							view			: element.view,
							caller			: caller
						}

						// exec
						life_cycle_test(options, element.view)
					}
				})()
		});

	}//end for (let i = 0; i < elements_length; i++)
});//end describe(`COMPONENTS LIFE-CYCLE`



/**
* LIFE_CYCLE_TEST
* @param object element
* @return void
*/
async function life_cycle_test(element) {

	// options
	const options = element

	describe(`${element.model} ${element.mode}`, function() {

		let test_instance, test_key, key, key_options

		// key
		it(`key_instances_builder`, async function() {
			key = key_instances_builder(options)

			// asserts
				assert.equal(typeof key, 'string', 'key must be string');

			// test_key
				key_options = {
					model			: 'component_portal',
					tipo			: 'oh25',
					section_tipo	: 'oh1',
					section_id		: 1587,
					mode			: 'edit',
					lang			: 'lg-eng',
					parent			: 'oh23',
					matrix_id		: '14',
					id_variant		: Math.random(),
					column_id		: 4
				}
				test_key		= key_instances_builder(key_options)
				const values	= Object.values(key_options)

			// asserts
				assert.equal(test_key, values.join('_'), 'test_key must match');
		});

		// get_instance
		it(`get_instance`, async function() {

			// init instance
				const t0 = performance.now()

				const new_instance = await get_instance(options)

				const time = Math.round(performance.now()-t0)
				assert.equal(new_instance.id, key);
				if(SHOW_DEBUG===true) {
					// console.log(`Time to init element ${options.model}:`, `${time} ms`);
				}

			// caller force insert ar_instances
				// This is not how real world works, but we need here test to
				// destroy instances without build it
				new_instance.caller.ar_instances.push(new_instance)

			// asserts
				assert.equal(new_instance.status, 'initialized', 'Instance status must be initialized');
				assert.equal(new_instance.mode, options.mode);
				assert.equal(new_instance.id, key);

			// test instance
				test_instance = await get_instance(key_options)
				assert.equal(test_instance.id, test_key);
		});

		// get_all_instances
		it(`get_all_instances`, async function() {

			const all_instances = get_all_instances()

			// asserts
				assert.equal(Array.isArray(all_instances), true, 'all_instances must be array');
				assert.equal(all_instances.length>0, true);
				assert.equal(test_instance.id, test_key);
		});

		// find_instances
		it(`find_instances`, async function() {

			const found_instances = find_instances({
				tipo			: options.tipo,
				section_tipo	: options.section_tipo,
				section_id		: options.section_id,
				mode			: options.mode,
				lang			: options.lang,
			})

			const found_instances_length = found_instances.length

			// asserts
				assert.equal(Array.isArray(found_instances), true, 'found_instances must be array');
				assert.equal(found_instances_length, 1);
		});

		// delete_instance
		it(`delete_instances`, async function() {

			const total_instances_length = get_all_instances().length

			const deleted = delete_instances({
				tipo			: options.tipo,
				section_tipo	: options.section_tipo,
				section_id		: options.section_id,
				mode			: options.mode,
				lang			: options.lang,
			})

			const new_total_instances_length = get_all_instances().length

			// asserts
				assert.equal(deleted, 1, 'deleted must be 1');
				assert.equal(new_total_instances_length, total_instances_length - 1);
		});

		// destroy instance
		it(`destroy instance`, async function() {

			// to_destroy_instance
				const to_destroy_instance = await get_instance({
					model			: 'component_portal',
					tipo			: 'oh25',
					section_tipo	: 'oh1',
					section_id		: 423,
					mode			: 'edit',
					lang			: 'lg-eng',
					parent			: 'oh23',
					matrix_id		: '14',
					id_variant		: Math.random(),
					caller			: element.caller
				})
				element.caller.ar_instances.push(to_destroy_instance)
				const destroyed = await to_destroy_instance.destroy(true)

			// asserts
				assert.deepEqual(destroyed, { delete_self : true })

			// find into caller
				const caller_found = element.caller.ar_instances.find(el => el.id===to_destroy_instance.id)

			// asserts
				assert.equal(caller_found, undefined, 'No expected found the deleted instance into the caller ar_instances')
		});

	});//end describe(element.model, function()
}//end life_cycle_test



// @license-end
