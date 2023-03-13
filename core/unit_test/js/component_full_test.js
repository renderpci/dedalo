/*global it, describe, assert */
/*eslint no-undef: "error"*/

import {
	elements
} from './elements.js'
import {get_instance} from '../../common/js/instances.js'
import {event_manager} from '../../common/js/event_manager.js'
import {ui} from '../../common/js/ui.js'
import {url_vars_to_object} from '../../common/js/utils/index.js'
// import {search} from '../../search/js/search.js'
// import {clone} from '../../common/js/utils/util.js'



const url_vars	= url_vars_to_object(window.location.search)
const model		= url_vars.model

// element is an object with the instance options
const element	= elements.find(el => el.model===model)



// search change_search_element event subscription
	event_manager.subscribe('change_search_element', fn_change_search_element)
	async function fn_change_search_element(instance) {
		// show save animation. add save_success class to component wrappers (green line animation)
		ui.component.exec_save_successfully_animation(instance)
		// set instance as changed or not based on their value
		const hilite = (
			(instance.data.value && instance.data.value.length>0) ||
			(instance.data.q_operator && instance.data.q_operator.length>0)
		)
		ui.hilite({
			instance	: instance, // instance object
			hilite		: hilite // bool
		})
	}


// vars
	const pairs = [
		{
			mode : 'list',
			view : 'default'
		},
		// {
		// 	mode : 'list',
		// 	view : 'line'
		// },
		// {
		// 	mode : 'list',
		// 	view : 'mini'
		// },
		// {
		// 	mode : 'list',
		// 	view : 'text'
		// },
		{
			mode : 'edit',
			view : 'default'
		},
		// {
		// 	mode : 'edit',
		// 	view : 'line'
		// },
		// {
		// 	mode : 'search',
		// 	view : 'default'
		// }
	]
	const elements_length	= elements.length
	const pairs_length		= pairs.length

	// DOM containers
	const _content	= document.getElementById('content');
	const content	= ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container',
		parent			: _content
	})



describe(`COMPONENT FULL TEST`, async function() {

	describe(`${element.model.toUpperCase()}`, async function() {

		{
			// render edit basis

			const mode			= 'edit'
			const view			= 'default'
			const permissions	= 0
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'built', 'Status is built');
			assert.notEqual(new_instance.node, null, 'Main node is null');
		}

		{
			// render edit basis

			const mode			= 'edit'
			const view			= 'default'
			const permissions	= 1
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.notEqual(new_instance.node.content_data, null, 'Exists content_data pointer');
			// assert.notEqual(new_instance.node.content_data[0], null);
			assert.notEqual( new_instance.node.querySelector(':scope >.label'), null, 'Exist node label')
		}

		{
			// render edit basis

			const mode			= 'edit'
			const view			= 'default'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.notEqual(new_instance.node.content_data, null, 'Exists content_data pointer');
			// assert.notEqual(new_instance.node.content_data[0], null);
			assert.notEqual( new_instance.node.querySelector(':scope >.label'), null, 'Exist node label')
		}

		{
			// render edit basis

			const mode			= 'edit'
			const view			= 'line'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.notEqual(new_instance.node.content_data, null, 'Exists content_data pointer');
			// assert.notEqual(new_instance.node.content_data[0], null);
			assert.equal( new_instance.node.querySelector(':scope >.label'), null, 'Exist node label')
			assert.notEqual( new_instance.node.querySelector('.content_data'), null, 'Exist node content_data')
			// assert.notEqual( new_instance.node.querySelector('.content_value'), null, 'Exists content_value')
		}

		{
			// render edit basis

			const mode			= 'edit'
			const view			= 'print'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.notEqual(new_instance.node.content_data, null, 'Exists content_data pointer');
			// assert.notEqual(new_instance.node.content_data[0], null);
			assert.notEqual( new_instance.node.querySelector(':scope >.label'), null, 'Exist node label')
			assert.notEqual( new_instance.node.querySelector('.content_data'), null, 'Exist node content_data')
			// assert.notEqual( new_instance.node.querySelector('.content_value'), null, 'Exists content_value')
		}

		{
			// render list basis

			const mode			= 'list'
			const view			= 'default'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.equal( new_instance.node.querySelector(':scope >.label'), null, 'Not Exist node label')
		}

		{
			// render list basis

			const mode			= 'list'
			const view			= 'mini'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
			assert.equal( new_instance.node.querySelector(':scope >.label'), null, 'Not Exist node label')
		}

		{
			// render list basis

			const mode			= 'list'
			const view			= 'text'
			const permissions	= 2
			const options = {
				model			: element.model,
				tipo			: element.tipo,
				section_tipo	: element.section_tipo,
				section_id		: element.section_id,
				lang			: element.lang,
				mode			: mode,
				view			: view,
				id_variant		: mode + '_' + view + '_' + Math.random() + '-' + Math.random()
			}
			const new_instance = await get_instance(options)
			await new_instance.build(true)
			new_instance.permissions = permissions
			const new_node = await new_instance.render()

			// insert in DOM
			ui.create_dom_element({
				element_type	: 'h1',
				inner_html		: `${element.model.toUpperCase()} mode: ${mode}, view: ${view}, permissions: ${new_instance.permissions}`,
				parent			: content
			})
			content.appendChild(new_node)

			// asserts
			assert.equal(new_instance.status, 'rendered', 'Status is rendered');
			assert.notEqual(new_instance.node, null, 'Exists main node');
		}


		// modes iterate for each element (edit, list, search)
			// await (async ()=>{
			// 	for (let k = 0; k < pairs_length; k++) {

			// 		const pair = pairs[k]

			// 		const options = {
			// 			model			: element.model,
			// 			tipo			: element.tipo,
			// 			section_tipo	: element.section_tipo,
			// 			section_id		: element.section_id,
			// 			lang			: element.lang,
			// 			mode			: pair.mode,
			// 			view			: pair.view,
			// 			id_variant		: pair.mode + '_' + pair.view + '_' + Math.random() + '-' + Math.random()
			// 		}

			// 		// exec
			// 		rendering_test(options, pair.container)
			// 	}
			// })()
	});
});//end describe(`COMPONENT FULL TEST`)



/**
* RENDERING_TEST
* @param object options
* @return void
*/
async function rendering_test(options, container) {

	let new_instance = null

	describe(`${options.model} ${options.view} ${options.mode} `, function() {

		it(`${options.model} RENDER ${options.mode} ${options.view}`, async function() {

			// init instance
				new_instance = await get_instance(options)

			// build instance
				await new_instance.build(true)

			// render instance
				const new_node = await new_instance.render()

			// search case
				if (new_instance.mode==='search') {
					const search_component = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'search_component',
						parent			: container
					})
					// insert in DOM
					search_component.appendChild(new_node)
				}else{
					// insert in DOM
					container.appendChild(new_node)
				}

			// asserts
				assert.equal(new_instance.status, 'rendered');
				assert.notEqual(new_instance.node, null);
		});
	});//end describe(options.model, function()
}//end rendering_test
