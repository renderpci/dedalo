// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert */
/*eslint no-undef: 'error'*/
import {ts_object,key_instances_builder} from '../../../core/ts_object/js/ts_object.js'
import {ui} from '../../../core/common/js/ui.js'

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


describe('TS_OBJECT : ', function() {

	// DOM container
	const container = document.getElementById('content');

	const component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container',
		parent			: container
	})

	const message_label_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container',
		inner_html		: '<hr>',
		parent			: container
	})

	const items = [
		{
			section_tipo : 'ts1',
			section_id : '1'
		},
		{
			section_tipo : 'lg1',
			section_id : '283'
		},
		{
			section_tipo : 'es1',
			section_id : '8131'
		}
	]

	items.forEach(el => {

		const section_tipo	= el.section_tipo
		const section_id	= el.section_id

		// Simulates a real caller
		const caller = {
			filter			: {},
			build_options	: {},
			id				: 'area_thesaurus_dd100_dd100_list_lg-eng',
			id_base			: 'dd100__dd100',
			model			: 'area_thesaurus'
		}

		// OPtions to init the ts_object
		const instance_options = {
			area_model		: 'area_thesaurus',
			caller			: caller,
			children_tipo	: 'hierarchy49',
			is_ontology		: false,
			is_root_node	: true,
			linker			: undefined,
			section_id		: section_id, // '1',
			section_tipo	: section_tipo, // 'ts1',
			thesaurus_mode	: 'default',
			thesaurus_view_mode : null
		}

		let instance

		describe(`Instance ${section_tipo} - ${section_id}`, async function() {
			it(`INIT`, async function() {

				// get_instance
				instance = await ts_object.get_instance(instance_options)
				if(SHOW_DEBUG===true) {
					console.log('ts_object instance:', instance);
				}

				message_label_container.innerHTML += `Instance init ${section_tipo}${section_id}<br>`

				assert.deepEqual(
					instance.status,
					'initialized',
					'Expected initialized'
				);

				const expected_id = `ts_object_${section_tipo}_${section_id}_hierarchy49_default`

				// Check the main instance properties with a reference value
				const to_compare = {
					ar_instances				: [],
					area_model					: "area_thesaurus",
					caller						: caller,
					children_data				: undefined,
					children_tipo				: "hierarchy49",
					data						: undefined,
					events_tokens				: [],
					id							: expected_id,
					is_ontology					: false,
					is_open						: false,
					is_root_node				: true,
					linker						: undefined,
					mode						: "edit",
					model						: "ts_object",
					permissions_button_delete	: undefined,
					permissions_button_new		: undefined,
					permissions_indexation		: undefined,
					section_id					: section_id, // "1",
					section_tipo				: section_tipo, // "ts1",
					status						: "initialized",
					thesaurus_mode				: "default",
					thesaurus_view_mode			: null,
					ts_id						: undefined,
					ts_parent					: undefined,
					virtual_order				: undefined
				}
				for(const key in to_compare) {
					assert.deepEqual(
						instance[key],
						to_compare[key],
						'Expected ' + key + ' - ' + to_compare[key]
					);
				}

				// key_instances_builder
				const instance_key = key_instances_builder(instance_options)
				assert.deepEqual(
					instance_key,
					expected_id,
					'Expected ' +expected_id
				);
			});//end it(`INIT`, async function

			// describe(`Build instance ${section_tipo}${section_id}`, () => {
			it(`BUILD`, async function() {

				const autoload = false
				const result = await instance.build(autoload)

				message_label_container.innerHTML += `Instance build ${section_tipo}${section_id}<br>`

				assert.deepEqual(
					instance.status,
					'built',
					'Expected built'
				);

				assert.deepEqual(
					result,
					true,
					'Expected true'
				);
			});//end it(`BUILD`, async function

			// describe(`Render instance ${section_tipo}${section_id}`, () => {
			it(`RENDER`, async function() {

				const render_options = {
					render_level : 'full'
				}
				const wrapper = await instance.render(render_options)

				message_label_container.innerHTML += `Instance render ${section_tipo}${section_id}<br>`

				// Place into the DOM
				component_container.appendChild(wrapper)

				assert.deepEqual(
					instance.status,
					'rendered',
					'Expected rendered'
				);

				assert.deepEqual(
					wrapper instanceof HTMLElement,
					true,
					'Expected true'
				);

				assert.deepEqual(
					wrapper.classList.contains('wrap_ts_object'),
					true,
					'Expected true'
				);

				assert.deepEqual(
					wrapper.dataset.section_tipo === instance.section_tipo,
					true,
					'Expected true'
				);

				assert.deepEqual(
					wrapper.dataset.section_id === instance.section_id,
					true,
					'Expected true'
				);

				assert.deepEqual(
					wrapper.dataset.id === instance.id,
					true,
					'Expected true'
				);

				// Render as content
				const wrapper2 = await instance.render({
					render_level : 'content'
				})

				assert.deepEqual(
					wrapper2 instanceof HTMLElement,
					true,
					'Expected true'
				);

				const content_data = wrapper2.querySelector('.content_data')

				assert.deepEqual(
					content_data instanceof HTMLElement,
					true,
					'Expected true'
				);
			});//end it(`BUILD`, async function

			// describe(`Destroy instance ${section_tipo}${section_id}`, () => {
			it(`DESTROY`, async function() {

				await delay(1200);

				const result = await instance.destroy(
					true, // delete_self
					true, // delete_dependencies
					true // remove_dom
				);

				message_label_container.innerHTML += `Instance destroyed ${section_tipo}${section_id}<hr>`

				assert.deepEqual(
					result,
					{
						delete_dependencies : true,
						delete_self : true
					},
					'Expected true'
				);

				assert.deepEqual(
					instance.node === null,
					true,
					'Expected true'
				);

				assert.deepEqual(
					instance.ar_instances,
					[],
					'Expected true'
				);

				instance = null
			});//end it(`DESTROY`, async function
		});//end describe(`Instance ${section_tipo}${section_id}`

	});//end forEach

});//describe build



// @license-end
