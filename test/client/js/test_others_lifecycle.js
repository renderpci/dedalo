// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

// import {
// 	elements
// } from './elements.js'
import {get_instance, get_all_instances} from '../../../core/common/js/instances.js'



// general values
	const section_tipo	= 'test3'
	const section_id	= 1
	const mode			= 'edit'
	const lang			= 'lg-eng'
	const permissions	= 2

// get_elelemnts
	function get_elelemnts(){

		const elements = [];

		// login
			elements.push({
				model	: 'login',
				tipo	: 'dd229',
				mode	: mode,
				lang	: lang
			})

		// install
			// const install_context = await (async function(){
			// 	const rqo = {
			// 		action	: 'get_element_context',
			// 		source	: {model : 'install'}
			// 	}
			// 	const install_api_response = await data_manager.request({
			// 		body : rqo
			// 	})
			// 	return install_api_response.result
			// 		? install_api_response.result.find(el => el.model==='install')
			// 		: {}
			// })()
			elements.push({
				model	: 'install',
				tipo	: 'dd1590',
				mode	: 'install',
				lang	: lang,
				// context	: async function(){
				// 	const rqo = {
				// 		action	: 'get_element_context',
				// 		source	: {model : 'install'}
				// 	}
				// 	const install_api_response = await data_manager.request({
				// 		body : rqo
				// 	})
				// 	console.log('install_api_response:', install_api_response);
				// 	return install_api_response.result
				// 		? install_api_response.result.find(el => el.model==='install')
				// 		: {}
				// }
			})

		// menu
			elements.push({
				model	: 'menu',
				lang	: lang
			})

		// page
			elements.push({
				model	: 'page',
				menu	: true
			})


		return elements
	}//end get_elelemnts

// get_widgets
	function get_widgets(){

		const elements = [];

		const add = (name) => {
			elements.push({
				name	: name,
				path	: '../../../core/area_maintenance/widgets/'+name+'/js/'+name+'.js',
				mode	: mode,
				lang	: lang,
				value	: null
			})
		}

		// area maintenance widgets
		[
			'add_hierarchy',
			'build_database_version',
			'check_config',
			'counters_status',
			'database_info',
			'dedalo_api_test_environment',
			'environment',
			'export_hierarchy',
			'lock_components',
			'make_backup',
			'move_locator',
			'move_tld',
			'php_info',
			'php_user',
			'publication_api',
			'regenerate_relations',
			'register_tools',
			'sequences_status',
			'sqo_test_environment',
			'system_info',
			'unit_test',
			'update_code',
			'update_data_version',
			'update_ontology'
		].map(add)


		return elements
	}//end get_widgets

// get_services
	function get_services(){

		const elements = [];

		const add = (name) => {
			elements.push({
				name	: name,
				path	: `../../../core/services/${name}/js/${name}.js`,
				mode	: mode,
				lang	: lang,
				value	: null
			})
		}

		// area maintenance widgets
		[
			// 'service_autocomplete',
			// 'service_ckeditor',
			'service_dropzone',
			// 'service_subtitles', // not finished
			// 'service_time_machine',
			// 'service_tinymce',
			'service_tmp_section',
			'service_upload'
		].map(add)


		return elements
	}//end get_services



describe("OTHERS LIFE-CYCLE", function() {

	describe('Regular elements', function() {

		// regular elements
		const elements = get_elelemnts()
		const elements_length = elements.length
		for (let i = 0; i < elements_length; i++) {

			const element = elements[i]
			// console.log('-- element:', i, element.model, element);

			describe(element.model, async function() {

				let new_instance = null

				it(`${element.model} INIT`, async function() {

					const expected = 'initialized'

					// context function case. Call and wait here
						if (element.context && typeof element.context==='function') {
							element.context = await element.context()
						}

						const options = {
							id_variant		: Math.random() + '-' + Math.random(),
							lang			: element.lang,
							mode			: 'edit',
							model			: element.model,
							section_id		: element.section_id,
							section_tipo	: element.section_tipo,
							tipo			: element.tipo,
							view			: element.view,
							context			: element.context || null
						}

					// init instance
						new_instance = await get_instance(options)
						// console.log('init new_instance:', new_instance);

					assert.equal(new_instance.status, expected);
				});

				it(`${element.model} BUILD (autoload=true)`, async function() {

					const expected = 'built'

					// build instance
						await new_instance.build(true)
						console.log('build new_instance:', new_instance);
						if (element.context) {
							new_instance.context = element.context
						}

					assert.equal(new_instance.status, expected);
				});

				it(`${element.model} RENDER`, async function() {

					const expected = 'rendered'

					// render instance
						await new_instance.render()
						// console.log('render new_instance:', new_instance);

					assert.equal(new_instance.status, expected);
				});

				it(`${element.model} DESTROY`, async function() {

					const expected = 'destroyed'

					// destroy instance
						await new_instance.destroy(
							true,  // delete_self . default true
							true, // delete_dependencies . default false
							true // remove_dom . default false
						)

					const all_instances = get_all_instances()

					assert.equal(new_instance.status, expected)
					assert.deepEqual(new_instance.ar_instances, [])
					assert.deepEqual(new_instance.node, null)
					assert.deepEqual(new_instance.events_tokens, [])
					assert.deepEqual(all_instances, [])
				});
			});//end describe(element.model, function()
		}//end for (let i = 0; i < elements.length; i++)
	});

	describe('Widgets', function() {

		// widgets
		const widgets = get_widgets()
		const widgets_length = widgets.length
		for (let i = 0; i < widgets_length; i++) {

			const element = widgets[i]

			describe(element.name, async function() {

				let new_instance = null

				it(`${element.name} INIT`, async function() {

					const expected = 'initialized'

					// load element
					const module = await import(element.path)

					// instance widget
					new_instance = await new module[element.name]()

					// init widget
					await new_instance.init({
						id			: element.name,
						id_variant	: Math.random() + '-' + Math.random(),
						lang		: element.lang,
						mode		: element.mode, // list
						model		: 'widget',
						name		: element.name,
						value		: element.value,
						caller		: null
					})

					// const init_options = {
					// 	id			: element.name,
					// 	id_variant	: Math.random() + '-' + Math.random(),
					// 	lang		: element.lang,
					// 	mode		: element.mode, // list
					// 	model		: element.name,
					// 	name		: element.name,
					// 	value		: element.value,
					// 	context		: {},
					// 	caller		: {
					// 		context : {}
					// 	}
					// }
					// new_instance = await get_instance(init_options)

					assert.equal(new_instance.status, expected);
				});

				it(`${element.name} BUILD (autoload=true)`, async function() {

					const expected = 'built'

					// build instance
					await new_instance.build(true)

					assert.equal(new_instance.status, expected);
				});

				it(`${element.name} RENDER`, async function() {

					if (element.name==='unit_test') {
						// No render unit_test because cause an internal loop
					}else{
						const expected = 'rendered'

						// render instance
						await new_instance.render()
						// console.log('render new_instance:', new_instance);

						assert.equal(new_instance.status, expected);
					}
				});

				it(`${element.name} DESTROY`, async function() {

					const expected = 'destroyed'

					// destroy instance
						await new_instance.destroy(
							true,  // delete_self . default true
							true, // delete_dependencies . default false
							true // remove_dom . default false
						)

					assert.equal(new_instance.status, expected)
					assert.deepEqual(new_instance.ar_instances, [])
					assert.deepEqual(new_instance.node, null)
					assert.deepEqual(new_instance.events_tokens, [])
					// assert.deepEqual(all_instances, [])
				});
			});//end describe(element.name, function()

		}//end for (let i = 0; i < widgets_length; i++)
	});

	describe('Services', function() {

		// services
		const services = get_services()
		const services_length = services.length
		for (let i = 0; i < services_length; i++) {

			const element = services[i]

			describe(element.name, async function() {

				let new_instance = null

				it(`${element.name} INIT`, async function() {

					const expected = 'initialized'

					// load element
					const module = await import(element.path)

					// // instance service
					// new_instance = await new module[element.name]()

					// // init service
					// await new_instance.init({
					// 	id			: element.name,
					// 	id_variant	: Math.random() + '-' + Math.random(),
					// 	lang		: element.lang,
					// 	mode		: element.mode, // list
					// 	model		: 'service',
					// 	name		: element.name,
					// 	value		: element.value,
					// 	context : {},
					// 	caller		: {
					// 		context : {}
					// 	}
					// })

					const init_options = {
						id			: element.name,
						id_variant	: Math.random() + '-' + Math.random(),
						lang		: element.lang,
						mode		: element.mode, // list
						model		: element.name,
						name		: element.name,
						value		: element.value,
						context		: {},
						caller		: {
							context : {}
						}
					}
					new_instance = await get_instance(init_options)

					assert.equal(new_instance.status, expected);
				});

				it(`${element.name} BUILD (autoload=true)`, async function() {

					const expected = 'built'

					// build instance
					await new_instance.build(true)

					assert.equal(new_instance.status, expected);
				});

				it(`${element.name} RENDER`, async function() {

					const expected = 'rendered'

					// render instance
						await new_instance.render()
						// console.log('render new_instance:', new_instance);

					assert.equal(new_instance.status, expected);
				});

				it(`${element.name} DESTROY`, async function() {

					const expected = 'destroyed'

					// destroy instance
						await new_instance.destroy(
							true,  // delete_self . default true
							true, // delete_dependencies . default false
							true // remove_dom . default false
						)

					assert.equal(new_instance.status, expected)
					assert.deepEqual(new_instance.ar_instances, [])
					assert.deepEqual(new_instance.node, null)
					assert.deepEqual(new_instance.events_tokens, [])
					// assert.deepEqual(all_instances, [])
				});
			});//end describe(element.name, function()

		}//end for (let i = 0; i < services_length; i++)
	});
});



// @license-end
