// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: "error"*/
'use strict';

import {
	elements
} from './elements.js'
import {get_instance, get_all_instances, delete_instance} from '../../../core/common/js/instances.js'



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



// const content = document.getElementById('content');



describe(`COMPONENTS LIFE-CYCLE`, async function() {

	this.timeout(5000);

	// elements iterate
	for (let i = 0; i < elements_length; i++) {

		// element is an object with the instance options
		const element = elements[i]

		describe(`${element.model.toUpperCase()}`, async function() {

			this.timeout(15000);

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
							view			: element.view
						}

						// exec
						life_cycle_test(options, element.view)
					}
				})()

			// views_edit iterate (line_edit)
				await (async ()=>{
					for (let k = 0; k < ar_view_edit.length; k++) {

						element.mode = 'edit'
						element.view = ar_view_edit[k]

						const options = {
							id_variant		: Math.random() + '-' + Math.random(),
							lang			: element.lang,
							mode			: ar_mode[k],
							model			: element.model,
							section_id		: element.section_id,
							section_tipo	: element.section_tipo,
							tipo			: element.tipo,
							view			: element.view
						}

						// exec
						life_cycle_test(options, element.view)
					}
				})()

			// views_list iterate (mini)
				await (async ()=>{
					for (let k = 0; k < ar_view_list.length; k++) {

						element.mode = 'list'
						element.view = ar_view_list[k]

						const options = {
							id_variant		: Math.random() + '-' + Math.random(),
							lang			: element.lang,
							mode			: ar_mode[k],
							model			: element.model,
							section_id		: element.section_id,
							section_tipo	: element.section_tipo,
							tipo			: element.tipo,
							view			: element.view
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
async function life_cycle_test(element, view) {

	let new_instance = null

	describe(`${element.model} ${element.mode} ${view} `, function() {

		this.timeout(15000);

		it(`${element.model} INIT ${element.mode}`, async function() {

			// options
				const options = element

			// init instance
				new_instance = await get_instance(options)

			// asserts
				assert.equal(new_instance.status, 'initialized', 'Instance status must be initialized ');
				assert.equal(new_instance.mode, options.mode);
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

			// build instance
				await new_instance.build(true)

			// asserts
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
				// if (new_instance.mode==='edit') {
				// 	content.prepend(new_node)
				// }

			// asserts
				assert.equal(new_instance.status, 'rendered');
				assert.notEqual(new_instance.node, null);

				if (new_instance.mode==='edit' && new_instance.view!=='line' && new_instance.view!=='mini') {
					// assert.notEqual(
					// 	new_instance.node.content_data,
					// 	null,
					// 	'element node content data must be null'
					// );
					// assert.notEqual(new_instance.node.content_data, undefined);
					assert.notEqual(
						new_instance.node.querySelector('.label'),
						null,
						`label must be a DOM node on edit mode. (view: ${new_instance.view} - mode: ${new_instance.mode})`
					);
					const buttons_container = new_instance.node.querySelector('.buttons_container')
					assert.notEqual(buttons_container, null);
					assert.notEqual(new_instance.node.querySelector('.content_data'), null);
				}
				else if(new_instance.mode==='list') {
					// console.log('+++ new_instance.node:', new_instance.node);
					if (new_instance.view!=='text') {
						// console.log('new_instance.node:', new_instance.node, new_instance.mode, new_instance.view);
						const skip_models = [
							'component_portal',
							'component_relation',
							'component_3d',
							'component_av',
							'component_image',
							'component_pdf',
							'component_svg',
							'component_relation_children',
							'component_relation_index',
							'component_relation_related',
							'component_relation_parent',
							'component_text_area',
							'component_json'
						]
						if (!skip_models.includes(new_instance.model)) {
							// assert.equal(new_instance.node.content_data, undefined, 'content_data must be undefined on list mode');
							assert.equal(
								new_instance.node.querySelector('.content_data'),
								null,
								'content_data must be null on list mode'
							);
						}
						assert.equal(new_instance.node.querySelector('.label'), null, 'label must be null on list mode');
						assert.equal(new_instance.node.querySelector('.buttons_container'), null, 'buttons_container must be null on list mode');
					}
				}
		});

		it(`${element.model} DESTROY ${element.mode}`, async function() {

			// destroy instance
				const destroy_result = await new_instance.destroy(
					true,  // delete_self . default true
					true, // delete_dependencies . default false
					true // remove_dom . default false
				);

				assert.equal(
					destroy_result.delete_dependencies,
					true,
					'delete_dependencies: ' + JSON.stringify(destroy_result.delete_dependencies)
				)
				assert.equal(
					destroy_result.delete_self,
					true,
					'destroy_result.delete_self: ' + JSON.stringify(destroy_result.delete_self)
				)
				assert.equal(new_instance.status, 'destroyed')
				assert.deepEqual(new_instance.ar_instances, [])
				assert.deepEqual(new_instance.node, null)
				assert.deepEqual(new_instance.events_tokens, [])

			// all instances check
				let all_instances = get_all_instances()

				// component_iri case
				// Because component_iri creates the component_dataframe on render without wait,
				// the ar_instances additions is made it after the component is destroyed.
				if (new_instance.model==='component_iri') {
					const found = all_instances.find(el => el.model === 'component_dataframe')
					if (found) {
						if(!delete_instance(found.id)) {
							console.log('Deleting instance failed:', found.id);
						}
						// update values
						all_instances = get_all_instances()
					}
				}

				assert.deepEqual(
					all_instances,
					[],
					'all_instances: ' + JSON.stringify(all_instances)
				);

		});

	});//end describe(element.model, function()
}//end life_cycle_test



// @license-end
