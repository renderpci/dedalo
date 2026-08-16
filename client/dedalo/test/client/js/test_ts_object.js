// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, before, after, assert */
/*eslint no-undef: 'error'*/
import {ts_object,key_instances_builder} from '../../../core/ts_object/js/ts_object.js'
import {ui} from '../../../core/common/js/ui.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
import {same_section_id} from '../../../core/common/js/utils/index.js'

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

	// Fixture node identities. These are deliberately DECOUPLED from live DB
	// records: this is a unit test of the ts_object build/render/destroy pipeline,
	// not an integration test of the thesaurus data. Earlier revisions hardcoded
	// real records (e.g. 'ts1/1') which vanished when the install changed, making
	// the suite fail for reasons unrelated to ts_object. The node data is now
	// supplied by the mock below (see before()), so any identity is stable.
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

	// Mock data_manager.request so build()/get_node_data resolve against
	// deterministic fixtures instead of the live server. Keyed by
	// `${action}_${section_tipo}_${section_id}` (same convention as
	// test_ts_object_extended.js). Restored in after().
	const original_request = data_manager.request

	// Fixture responses, keyed `${action}_${section_tipo}_${section_id}`. Declared
	// at describe scope so later blocks (the model badge below) can register their
	// own node without a second mock.
	const responses = new Map()

	before(function() {

		// Build one get_node_data fixture per item
		items.forEach(el => {
			const key = `get_node_data_${el.section_tipo}_${el.section_id}`
			responses.set(key, {
				ok : true,
				data : {
					ts_id						: `${el.section_tipo}_${el.section_id}`,
					ts_parent					: null,
					section_tipo				: el.section_tipo,
					section_id					: el.section_id,
					order						: 1,
					is_descriptor				: true,
					is_indexable				: true,
					has_descriptor_children		: false,
					permissions_button_new		: 3,
					permissions_button_delete	: 3,
					permissions_indexation		: 3,
					ar_elements					: [
						{
							type	: 'term',
							tipo	: `${el.section_tipo}_term`,
							value	: `Term ${el.section_tipo} ${el.section_id}`,
							model	: 'component_input_text'
						}
					]
				}
			})
		})

		data_manager.request = async (options) => {
			const body		= options.body
			const action	= body?.action
			const source	= body?.source || {}
			const key		= `${action}_${source.section_tipo || ''}_${source.section_id || ''}`

			if (responses.has(key)) {
				return responses.get(key)
			}

			// Node with no children fixtures: the test never expands, so
			// get_children_data is not expected. Any other call gets a benign
			// success so an unrelated stray request cannot break the pipeline.
			return { ok : true, data : true }
		}
	})

	after(function() {
		data_manager.request = original_request
	})

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
					virtual_order				: null // ts_object init sets `options.virtual_order || null`
				}
				for(const key in to_compare) {
					// section_id crosses as number or string: assert identity, not type
					if (key==='section_id') {
						assert.deepEqual(
							same_section_id(instance[key], to_compare[key]),
							true,
							'Expected section_id - ' + to_compare[key]
						);
						continue;
					}
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
					// dataset reads are always strings; the instance id may be int or string
					same_section_id(wrapper.dataset.section_id, instance.section_id),
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


	// MODEL BADGE ('M' icon)
	// The server stamps `model_value` on the element whose value is 'M'
	// (src/core/ts_object/ts_object.ts). render_ts_line appends it as a
	// `.model_value` div, hidden unless page_globals.show_models is true —
	// area_thesaurus toggles that flag with Ctrl+M.
	describe('Model badge (model_value)', function() {

		const section_tipo	= 'ts1'
		const section_id	= '900'
		let show_models_backup

		before(function() {
			show_models_backup = window.page_globals.show_models
			responses.set(`get_node_data_${section_tipo}_${section_id}`, {
				ok : true,
				data : {
					ts_id						: `${section_tipo}_${section_id}`,
					ts_parent					: null,
					section_tipo				: section_tipo,
					section_id					: section_id,
					order						: 1,
					is_descriptor				: true,
					is_indexable				: true,
					has_descriptor_children		: false,
					permissions_button_new		: 3,
					permissions_button_delete	: 3,
					permissions_indexation		: 3,
					ar_elements					: [
						{
							type	: 'term',
							tipo	: `${section_tipo}_term`,
							value	: 'Processes',
							model	: 'component_input_text'
						},
						{
							type		: 'icon',
							tipo		: 'ontology6',
							value		: 'M',
							model_value	: 'area_tool',
							model		: 'component_portal'
						}
					]
				}
			})
		})

		after(function() {
			window.page_globals.show_models = show_models_backup
		})

		const build_instance = async function() {
			const instance = await ts_object.get_instance({
				area_model		: 'area_thesaurus',
				caller			: {
					filter			: {},
					build_options	: {},
					id				: 'area_thesaurus_dd100_dd100_list_lg-eng',
					id_base			: 'dd100__dd100',
					model			: 'area_thesaurus'
				},
				children_tipo	: 'hierarchy49',
				is_ontology		: false,
				is_root_node	: true,
				section_id		: section_id,
				section_tipo	: section_tipo,
				thesaurus_mode	: 'default',
				thesaurus_view_mode : null
			})
			await instance.build(false)
			return instance
		}

		it('renders the model name next to the M icon, hidden by default', async function() {

			window.page_globals.show_models = false

			const instance	= await build_instance()
			const wrapper	= await instance.render({ render_level : 'full' })
			const badge		= wrapper.querySelector('.model_value')

			assert.deepEqual(
				badge instanceof HTMLElement,
				true,
				'Expected a .model_value node for the M element'
			);

			assert.deepEqual(
				badge.textContent,
				'area_tool',
				'Expected the model name as badge text'
			);

			assert.deepEqual(
				badge.classList.contains('hide'),
				true,
				'Expected the badge hidden while show_models is false'
			);

			await instance.destroy(true, true, true)
		});

		it('shows the badge when show_models is on (Ctrl+M state)', async function() {

			window.page_globals.show_models = true

			const instance	= await build_instance()
			const wrapper	= await instance.render({ render_level : 'full' })
			const badge		= wrapper.querySelector('.model_value')

			assert.deepEqual(
				badge.classList.contains('hide'),
				false,
				'Expected the badge visible while show_models is true'
			);

			await instance.destroy(true, true, true)
		});

		it('never renders a badge for an element without model_value', async function() {

			// The first fixture item carries a term element only.
			const instance	= await ts_object.get_instance({
				area_model		: 'area_thesaurus',
				caller			: {
					filter			: {},
					build_options	: {},
					id				: 'area_thesaurus_dd100_dd100_list_lg-eng',
					id_base			: 'dd100__dd100',
					model			: 'area_thesaurus'
				},
				children_tipo	: 'hierarchy49',
				is_ontology		: false,
				is_root_node	: true,
				section_id		: items[0].section_id,
				section_tipo	: items[0].section_tipo,
				thesaurus_mode	: 'default',
				thesaurus_view_mode : null
			})
			await instance.build(false)
			const wrapper = await instance.render({ render_level : 'full' })

			assert.deepEqual(
				wrapper.querySelector('.model_value'),
				null,
				'Expected no .model_value node'
			);

			await instance.destroy(true, true, true)
		});

	});//end describe Model badge

});//describe build



// @license-end
