// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global it, describe, assert, page_globals */
/*eslint no-undef: "error"*/

// import {
// 	elements
// } from './elements.js'
import {get_instance, get_all_instances} from '../../common/js/instances.js'



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

		// add_hierarchy
		elements.push({
			name	: 'add_hierarchy',
			path	: '../../area_maintenance/js/widgets/add_hierarchy/add_hierarchy.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// build_install_version
		elements.push({
			name	: 'build_install_version',
			path	: '../../area_maintenance/js/widgets/build_install_version/build_install_version.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// check_config
		elements.push({
			name	: 'check_config',
			path	: '../../area_maintenance/js/widgets/check_config/check_config.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// counters_status
		elements.push({
			name	: 'counters_status',
			path	: '../../area_maintenance/js/widgets/counters_status/counters_status.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// database_info
		elements.push({
			name	: 'database_info',
			path	: '../../area_maintenance/js/widgets/database_info/database_info.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// dedalo_api_test_environment
		elements.push({
			name	: 'dedalo_api_test_environment',
			path	: '../../area_maintenance/js/widgets/dedalo_api_test_environment/dedalo_api_test_environment.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// dedalo_version
		elements.push({
			name	: 'dedalo_version',
			path	: '../../area_maintenance/js/widgets/dedalo_version/dedalo_version.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// environment
		elements.push({
			name	: 'environment',
			path	: '../../area_maintenance/js/widgets/environment/environment.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// export_hierarchy
		elements.push({
			name	: 'export_hierarchy',
			path	: '../../area_maintenance/js/widgets/export_hierarchy/export_hierarchy.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// export_ontology_to_json
		elements.push({
			name	: 'export_ontology_to_json',
			path	: '../../area_maintenance/js/widgets/export_ontology_to_json/export_ontology_to_json.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// import_ontology_from_json
		elements.push({
			name	: 'import_ontology_from_json',
			path	: '../../area_maintenance/js/widgets/import_ontology_from_json/import_ontology_from_json.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// lock_components
		elements.push({
			name	: 'lock_components',
			path	: '../../area_maintenance/js/widgets/lock_components/lock_components.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// make_backup
		elements.push({
			name	: 'make_backup',
			path	: '../../area_maintenance/js/widgets/make_backup/make_backup.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// move_tld
		elements.push({
			name	: 'move_tld',
			path	: '../../area_maintenance/js/widgets/move_tld/move_tld.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// php_info
		elements.push({
			name	: 'php_info',
			path	: '../../area_maintenance/js/widgets/php_info/php_info.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// php_user
		elements.push({
			name	: 'php_user',
			path	: '../../area_maintenance/js/widgets/php_user/php_user.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// publication_api
		elements.push({
			name	: 'publication_api',
			path	: '../../area_maintenance/js/widgets/publication_api/publication_api.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// regenerate_relations
		elements.push({
			name	: 'regenerate_relations',
			path	: '../../area_maintenance/js/widgets/regenerate_relations/regenerate_relations.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// register_tools
		elements.push({
			name	: 'register_tools',
			path	: '../../area_maintenance/js/widgets/register_tools/register_tools.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// sequences_status
		elements.push({
			name	: 'sequences_status',
			path	: '../../area_maintenance/js/widgets/sequences_status/sequences_status.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// sqo_test_environment
		elements.push({
			name	: 'sqo_test_environment',
			path	: '../../area_maintenance/js/widgets/sqo_test_environment/sqo_test_environment.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// unit_test
		elements.push({
			name	: 'unit_test',
			path	: '../../area_maintenance/js/widgets/unit_test/unit_test.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// update_code
		elements.push({
			name	: 'update_code',
			path	: '../../area_maintenance/js/widgets/update_code/update_code.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// update_data_version
		elements.push({
			name	: 'update_data_version',
			path	: '../../area_maintenance/js/widgets/update_data_version/update_data_version.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		// update_ontology
		elements.push({
			name	: 'update_ontology',
			path	: '../../area_maintenance/js/widgets/update_ontology/update_ontology.js',
			mode	: mode,
			lang	: lang,
			value	: null
		})

		return elements
	}//end get_widgets



describe("OTHERS LIFE-CYCLE", async function() {

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
						id_variant		: Math.random() + '-' + Math.random(),
						lang			: element.lang,
						mode			: element.mode, // list
						model			: 'widget',
						name			: element.name,
						value			: element.value,
						caller			: null
					})

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

		}//end for (let i = 0; i < widgets_length; i++)

	});

});



// @license-end
