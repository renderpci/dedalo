/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'


// vars
	const ar_view_edit = [
		'line_edit'
	]
	const ar_view_list = [
		'mini'
	]
	const ar_mode = [
		'edit',
		'list',
		'search'
	]
	const ar_mode_length	= ar_mode.length
	const elements_length	= elements.length



const content = document.getElementById('content');



describe(`COMPONENTS LIFE-CYCLE`, async function() {

	// elements iterate
	for (let i = 0; i < elements_length; i++) {

		// element is an object with the instance options
		const element = elements[i]

		describe(`${element.model.toUpperCase()}`, async function() {

			// modes iterate for each element
			for (let k = 0; k < ar_mode_length; k++) {

				element.mode = ar_mode[k]

				// exec
				life_cycle_test(element)
			}

			// views_edit iterate
			for (let k = 0; k < ar_view_edit.length; k++) {
				element.mode = 'edit'
				element.view = ar_view_edit[k]

				// exec
				life_cycle_test(element)
			}

			// views_edit iterate
			for (let k = 0; k < ar_view_list.length; k++) {

				element.mode = 'list'
				element.view = ar_view_list[k]

				// exec
				life_cycle_test(element)
			}
		});

	}//end for (let i = 0; i < elements_length; i++)
});//end describe(`COMPONENTS LIFE-CYCLE`



/**
* LIFE_CYCLE_TEST
* @param object element
* @return void
*/
async function life_cycle_test(element) {

	describe(`${element.model} ${element.mode} ${element.view}`, async function() {

		let new_instance = null

		it(`${element.model} INIT ${element.mode}`, async function() {

			// init instance
				new_instance = await get_instance(element)

			const expected = 'initiated'
			assert.equal(new_instance.status, expected);
			assert.equal(new_instance.mode, element.mode);
			assert.equal(new_instance.context, null);
			assert.equal(new_instance.node, null);
			assert.equal(new_instance.active, false);
			assert.equal(new_instance.is_data_changed, false);

			assert.notEqual(new_instance.model, null);
			assert.notEqual(new_instance.tipo, null);
			assert.notEqual(new_instance.section_tipo, null);
			assert.notEqual(new_instance.mode, null);
			assert.notEqual(new_instance.lang, null);
			assert.notEqual(new_instance.standalone, null);
		});

		it(`${element.model} BUILD (autoload=true) ${element.mode}`, async function() {

			// init instance
				await new_instance.build(true)

			assert.equal(new_instance.status, 'built');
			// assert.equal(new_instance.mode, element_mode);
			assert.notEqual(new_instance.context, null);

			assert.notEqual(new_instance.type, null);
			assert.notEqual(new_instance.label, null);
			assert.notEqual(new_instance.tools, null);
			assert.notEqual(new_instance.permissions, null);
			assert.notEqual(new_instance.view, null);
			assert.notEqual(new_instance.rqo_test, null);
			assert.notEqual(new_instance.data, null);
			assert.notEqual(new_instance.db_data, null);
		});

		it(`${element.model} RENDER ${element.mode}`, async function() {

			// render instance
				const new_node = await new_instance.render()
				// console.log('new_node:', new_node);

			// insert in DOM
				// if (new_instance.mode==='list') {
				// 	content.prepend(new_node)
				// }

			assert.equal(new_instance.status, 'rendered');
			assert.notEqual(new_instance.node, null);

			if (new_instance.mode==='edit') {
				assert.notEqual(new_instance.node.content_data, null);
				assert.notEqual(new_instance.node.content_data, undefined);
				assert.notEqual(new_instance.node.querySelector('.label'), null);
				assert.notEqual(new_instance.node.querySelector('.buttons_container'), null);
				assert.notEqual(new_instance.node.querySelector('.content_data'), null);
			}
			else if(new_instance.mode==='list') {
				assert.Equal(new_instance.node.content_data, undefined);
				assert.Equal(new_instance.node.querySelector('.label'), null);
				assert.Equal(new_instance.node.querySelector('.buttons_container'), null);
				assert.Equal(new_instance.node.querySelector('.content_data'), null);
			}
		});

		it(`${element.model} DESTROY ${element.mode}`, async function() {

			// destroy instance
				await new_instance.destroy(
					true,  // delete_self . default true
					true, // delete_dependencies . default false
					true // remove_dom . default false
				)

			assert.equal(new_instance.status, 'destroyed')
			assert.deepEqual(new_instance.ar_instances, [])
			assert.deepEqual(new_instance.node, null)
		});

	});//end describe(element.model, function()
}//end life_cycle_test
