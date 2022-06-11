/*global it, page_globals, describe, mocha assert */
/*eslint no-undef: "error"*/



// test.js
import {get_instance, key_instances_builder, delete_instance, get_all_instances} from '../../common/js/instances.js'
// import {data_manager} from '../../common/js/data_manager.js'
// import {create_source} from '../../common/js/common.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'
// import {component_date} from '../../component_date/js/component_date.js'
import {tool_lang} from '../../../tools/tool_lang/js/tool_lang.js'
import * as fn from './data.js'



// reference model
	// function pow(x, n) {
	// 	/* function code is to be written, empty now */
	// }
	// describe("pow", function() {

	// 	it("2 raised to power 3 is 8", function() {
	// 		assert.equal(pow(2, 3), 8);
	// 	});

	// 	it("3 raised to power 4 is 81", function() {
	// 		assert.equal(pow(3, 4), 81);
	// 	});

	// });



// Define components that will be tested
	const elements = []

	// components general values
		const section_tipo	= 'test3'
		const section_id	= 1
		const mode			= 'edit'
		const lang			= 'lg-eng'
		const permissions	= 2

	// component_av
		elements.push({
			model				: 'component_av',
			tipo				: 'test94',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.custom_locator,
			new_value_params	: [section_tipo, section_id, 'test94']
		})

	// component_calculation -to disappear-  (WORKING HERE)

	// component_check_box
		elements.push({
			model				: 'component_check_box',
			tipo				: 'test146',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.random_locator,
			new_value_params	: ['dd501','test146']
		})

	// component_date
		elements.push({
			model			: 'component_date',
			tipo			: 'test145',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: page_globals.dedalo_data_nolan,
			lang			: lang,
			new_value		: fn.random_date
		})

	// component_email
		elements.push({
			model			: 'component_email',
			tipo			: 'test208',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: page_globals.dedalo_data_nolan,
			lang			: lang,
			new_value		: fn.random_email
		})

	// component_external -zenon- (WORKING HERE)

	// component_filter
		elements.push({
			model				: 'component_filter',
			tipo				: 'test101',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: page_globals.dedalo_data_nolan,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: [section_tipo,'test101'] // [section_tipo, from_component_tipo, paginated_key]
		})

	// component_filter_master
		elements.push({
			model				: 'component_filter_master',
			tipo				: 'test70',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.random_locator,
			new_value_params	: [section_tipo,'test70'] // [section_tipo, from_component_tipo, paginated_key]
		})

	// component_filter_records
		elements.push({
			model				: 'component_filter_records',
			tipo				: 'test69',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.random_filter_records,
			new_value_params	: [] // [section_tipo, from_component_tipo, paginated_key]
		})

	// component_geolocation
		elements.push({
			model				: 'component_geolocation',
			tipo				: 'test100',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.random_geolocation,
			new_value_params	: [] // [section_tipo, from_component_tipo, paginated_key]
		})

	// component grouper/sync ?????? (WORKING HERE)

	// component_html_text -full tinymce- (WORKING HERE)

	// component_image
		elements.push({
			model				: 'component_image',
			tipo				: 'test99',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: page_globals.dedalo_data_nolan,
			new_value			: fn.random_image_data,
			new_value_params	: []
		})

	// component_info -widgets- (WORKING HERE)

	// component_input_text
		elements.push({
			model			: 'component_input_text',
			tipo			: 'test52',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			new_value		: fn.random_string
		})

	// component_inverse -section_id from caller- (WORKING HERE)

	// component_ip -to disappear- (WORKING HERE)

	// component_iri
		elements.push({
			model			: 'component_iri',
			tipo			: 'test140',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			new_value		: fn.random_iri_data
		})

	// component_json
		elements.push({
			model			: 'component_json',
			tipo			: 'test150',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: page_globals.dedalo_data_nolan,
			new_value		: fn.random_json
		})

	// component_number
		elements.push({
			model			: 'component_number',
			tipo			: 'test139',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			new_value		: fn.random_number
		})

	// component_password
		elements.push({
			model			: 'component_password',
			tipo			: 'test152',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: page_globals.dedalo_data_nolan,
			new_value		: fn.random_string,
			test_save		: false
		})

	// component_pdf
		elements.push({
			model				: 'component_pdf',
			tipo				: 'test85',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_pdf_data,
			new_value_params	: []
		})

	// component_portal (basic v5 config)
		elements.push({
			model				: 'component_portal',
			tipo				: 'test80',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['test38', 'test80', 0] // [section_tipo, from_component_tipo, paginated_key]
		})

	// component_publication
		elements.push({
			model				: 'component_publication',
			tipo				: 'test92',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['dd64','test92']
		})

	// component_radio_button
		elements.push({
			model				: 'component_radio_button',
			tipo				: 'test144',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['dd501','test144']
		})

	// component_relation_children
		elements.push({
			model				: 'component_relation_children',
			tipo				: 'test201',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: [section_tipo,'test201']
		})

	// component_relation_index
		elements.push({
			model				: 'component_relation_index',
			tipo				: 'test25',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['es1','test25']
		})

	// component_relation_model
		elements.push({
			model				: 'component_relation_model',
			tipo				: 'test169',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['es2','test169']
		})

	// component_relation_parent
		elements.push({
			model				: 'component_relation_parent',
			tipo				: 'test71',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['es1','test71'],
			test_save			: false
		})

	// component_relation_related
		elements.push({
			model				: 'component_relation_related',
			tipo				: 'test56',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: [section_tipo,'test56']
		})

	// component_section_id
		elements.push({
			model			: 'component_section_id',
			tipo			: 'test102',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			new_value		: fn.random_string,
			test_save		: false
		})

	// component_security_access
		elements.push({
			model				: 'component_security_access',
			tipo				: 'test157',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_security_access
		})

	// component_select
		elements.push({
			model				: 'component_select',
			tipo				: 'test91',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['es1','test91']
		})

	// component_select_lang
		elements.push({
			model				: 'component_select_lang',
			tipo				: 'test89',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_locator,
			new_value_params	: ['lg1','test89']
		})

	// component_semantic_node -render portal column- (WORKING HERE)

	// component_svg
		elements.push({
			model				: 'component_svg',
			tipo				: 'test177',
			section_tipo		: section_tipo,
			section_id			: section_id,
			mode				: mode,
			lang				: lang,
			new_value			: fn.random_image_data
		})

	// component_text_area
		elements.push({
			model			: 'component_text_area',
			tipo			: 'test17',
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			new_value		: fn.random_string
		})



// instances

	// key_instances_builder
		describe("instances : key_instances_builder", function(){

			function make_test (elements, expected) {
				it(`${JSON.stringify(elements)} => '${expected}'`, function(done) {
					assert.equal( key_instances_builder(elements), expected);
					done()
				});
			}

			const model				= 'component_input_text'
			const tipo				= 'test52'
			// const section_tipo	= 'test3'
			// const section_id		= 1
			// const mode			= 'edit'
			// const lang			= 'lg-eng'

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("builds instance key based on elements values (using component_input_text)", function() {

				// using section_id value as int
					make_test({
						"model"			: model,
						"tipo"			: tipo,
						"section_tipo"	: section_tipo,
						"section_id"	: section_id,
						"mode"			: mode,
						"lang"			: lang
					}, `${model}_${tipo}_${section_tipo}_${section_id}_${mode}_${lang}`); // like 'component_input_text_test52_test65_1_edit_lg-eng'

				// using null as section_id value
					make_test({
						"model"			: model,
						"tipo"			: tipo,
						"section_tipo"	: section_tipo,
						"section_id"	: null,
						"mode"			: mode,
						"lang"			: lang
					}, `${model}_${tipo}_${section_tipo}_${mode}_${lang}`); // like 'component_input_text_test52_test65_edit_lg-eng'

				// without receive some vars like section_id and lang
					make_test({
						"model"			: model,
						"tipo"			: tipo,
						"section_tipo"	: section_tipo,
						"section_id"	: null,
						"mode"			: mode,
						"lang"			: null
					}, `${model}_${tipo}_${section_tipo}_${mode}`); // like 'component_input_text_test52_test65_edit'
			});
		});
	// get_instance
		describe("instances : get_instance", function(){

			function make_test(elements, expected) {
				it(`${JSON.stringify(elements)} => '${expected.name}'`, async function() {
					const instance = await get_instance(elements)
					assert.instanceOf(instance, expected, 'result is an instance of expected '+instance.name);
				});
			}
			// page instance
				describe("builds page instance from elements", function() {
						make_test({
							model	: "page",
							context	: []
						}, page);
				});
			// component_input_text instance
				describe("builds component_input_text instance from elements", function() {
						make_test({
							model	: "component_input_text",
							tipo	: 'test52',
							mode	: mode,
							lang	: lang,
							context	: {}
						}, component_input_text);
				});
			// tool_lang instance
				describe("builds tool_lang instance from elements", function() {
						make_test({
							model		: "tool_lang",
							mode		: mode,
							lang		: lang,
							tool_object	: {},
							caller		: {}
						}, tool_lang);
				});
		});
	// delete_instance
		describe("instances : delete_instance", function(){

			function make_test (elements, expected) {
				it(`${JSON.stringify(elements)} => DELETED: ${expected}`, async function() {

					// console.log("new_instance:",new_instance);
					const deleted = await delete_instance(elements);
					assert.equal(deleted, expected);
				});
			}

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("delete component_input_text instance based on elements values to create the key: No delete [do not exists]", function() {
				// using value as int
					const elements = {
						model	: "component_input_text",
						tipo	: "test52",
						mode	: mode,
						lang	: lang,
						context	: {}
					}
					make_test(elements, 0);
			});

			describe("delete component_input_text instance based on elements values to create the key: Yes delete 1", function() {
				// using value as int
					const elements = {
						model	: "component_input_text",
						tipo	: "test52",
						mode	: mode,
						lang	: "lg-vlca",
						context	: {}
					}
					const new_instance = get_instance(elements)
					make_test(elements, 1);
			});

			describe("delete page instance based on elements values to create the key: Yes delete 1", function() {
				// create instance
				const elements  = {
					"model"	: "page"
				}
				make_test(elements, 1);
			});
		});



// components lifecycle functions for any component instance
	describe("components : lifecycle", function(){

		function make_test (elements, property, expected, stage) {
			//it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {
			it(`${JSON.stringify(property)} => Init ${elements.model}: ${expected}`, async function() {

				// get and set element context
					// const current_data_manager 	= new data_manager()
					// const element_context = await current_data_manager.get_element_context({
					// 	tipo 			: elements.tipo,
					// 	section_tipo 	: elements.section_tipo,
					// 	section_id		: elements.section_id
					// })
					// // console.log("************* calculated element_context:",element_context.result[0]);
					// elements.context = element_context.result[0]

				// direct minimum context
					const request_config = [{
						api_engine	: "dedalo",
						show		: {
							ddo_map : []
						},
						sqo			: {
							section_tipo : [elements.section_tipo]
						}
					}]
					elements.context = {
						request_config : request_config // [source]
					}

				// init instance
					const new_instance = await get_instance(elements)
						// console.log("new_instance:", stage, clone(new_instance) );

				if (stage==='build' || stage==='render' || stage==='refresh' || stage==='destroy') {

					await new_instance.build(true)

					if (stage==='render') {
						await new_instance.render()
					}
					else if (stage==='refresh') {
						await new_instance.render()
						await new_instance.refresh()
					}
					else if (stage==='destroy') {

						const instance_id	= new_instance.id
						//const instance_key 	= elements.key || key_instances_builder(elements, true)
						const instances	= get_all_instances()

						// console.log("instances:",instances)
						// 	console.log("instance_id:",instance_id)
						// 		console.log("instance_key:",instance_key);

						// const found_instance_before_destroy = instances.filter(instance => instance.id===instance_id)
						await new_instance.destroy()

						// exists after destroy ?
							const found_instance_after_destroy = instances.filter(instance => instance.id===instance_id)
							// console.log("found_instance_before_destroy:",found_instance_before_destroy)
							// console.log("found_instance_after_destroy:",found_instance_after_destroy)
							assert.equal(found_instance_after_destroy.length, 0)

						return false // stop on destroy
					}
				}

				if (property) {
					switch (property) {
						case 'status':
							assert.equal(new_instance.status, expected)
							break;
						case 'lang':
							assert.equal(new_instance.lang, expected)
							break;
						case 'permissions':
							assert.equal(new_instance.permissions, expected)
							break;
						default:
							assert.equal(new_instance.status, expected)
							break;
					}
				}

				await new_instance.destroy()
			});
		}//end function make_test

		// init
			describe("INIT component based on elements values to create a component instance: status = initiated, lang = lg-eng and permissions = null", function() {

				for (let i = 0; i < elements.length; i++) {
					describe(elements[i].model, function() {
						// params: elements, property, expected, stage
						make_test(elements[i], 'status', 'initiated', 'init')
					})
				}
			});


		// build
			describe("BUILD component based on elements values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < elements.length; i++) {
					describe(elements[i].model, function() {
						// params: elements, property, expected, stage
						make_test(elements[i], 'status', 'builded', 'build')
						// make_test(elements[i], 'permissions', 3, 'build')
					})
				}
			});


		// render
			describe("RENDER component based on elements values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < elements.length; i++) {
					describe(elements[i].model, function() {
						// params: elements, property, expected, stage
						make_test(elements[i], 'status', 'rendered', 'render')
					})
				}
			});


		// refresh
			describe("REFRESH component based on elements values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < elements.length; i++) {
					// params: elements, property, expected, stage
					describe(elements[i].model, function() {
						make_test(elements[i], 'status', 'rendered', 'refresh')
					})
				}
			});


		// destroy
			describe("DESTROY component based on existing instance", function() {

				for (let i = 0; i < elements.length; i++) {
					// params: elements, property, expected, stage
					describe(elements[i].model, function() {
						make_test(elements[i], 'instance', 'destroy', 'destroy')
					})
				}
			});
	});



// components change data functions for any component instance
	describe("components : change data", function(){

		function make_test_change_data(elements, equals) {

			const new_value = elements.new_value(elements.new_value_params) //  old_value + 1

			const test_title = (equals===true)
				? `${elements.model} => Save new_value  = new_value (` + JSON.stringify(new_value) + ')'
				: `${elements.model} => Save new_value != old_value (` + JSON.stringify(new_value) + ')'

			it(test_title, async function() {

				// get and set element context
					// const current_data_manager = new data_manager()
					// const element_context = await current_data_manager.get_element_context({
					// 	tipo			: elements.tipo,
					// 	section_tipo	: elements.section_tipo,
					// 	section_id		: elements.section_id
					// })
					// elements.context = element_context.result[0]

				// create and add request_config
					const request_config = [{
						api_engine	: "dedalo",
						show		: {
							ddo_map : []
						},
						sqo			: {
							section_tipo : [elements.section_tipo]
						}
					}]
					elements.context = {
						request_config : request_config // [source]
					}

				// old instance
					const old_instance = await get_instance(elements)
					await old_instance.build(true)

					const old_value = typeof old_instance.data.value!=="undefined"
						? old_instance.data.value[0]
						: null

					// const new_value = old_value + 1
					// const test_title = (equals===true) ? `${elements.model} => Save old value: ${old_value} => new_value = old_value + 1: ${new_value}`: `${elements.model} => Save old value: ${old_value} => new_value != old_value: ${new_value}`

					// save
						const changed_data = Object.freeze({
							action	: 'insert',
							key 	: 0,
							value	: new_value
						})
						const api_response_save = await old_instance.change_value({
							changed_data	: changed_data,
							refresh			: false
						})

					// destroy
						if (old_instance) {
							// await old_instance.destroy(true, true, true)
							old_instance.destroy(true, true, true)
						}

				// new instance
					const new_instance = await get_instance(elements)
					await new_instance.build(true)
						// console.log("____________ new_instance:",new_instance);

					if (equals===true) {

						const reference_value	= new_value
						const data_value		= new_instance.data.value[0]

						// locator case check
						if (data_value && typeof data_value.from_component_tipo!=="undefined" && data_value.from_component_tipo) {

							const a = {
								section_tipo		: data_value.section_tipo,
								section_id			: data_value.section_id,
								from_component_tipo	: data_value.from_component_tipo
							}
							const b = {
								section_tipo		: reference_value.section_tipo,
								section_id			: reference_value.section_id,
								from_component_tipo	: reference_value.from_component_tipo
							}
							assert.equal( JSON.stringify(a), JSON.stringify(b), "Compares equal saved value and sended value [locator]" )

						}else{

							const expected	= data_value
								? JSON.stringify(data_value)
								: null

							console.log("data_value:",new_instance.data.value);
							const equal_to	= JSON.stringify(reference_value)
							assert.equal( expected, equal_to, "Compares equal saved value and sended value" )
						}

					}else{
						// console.log("new_instance.datum:",new_instance.datum);
						const expected	= new_instance.data.value && new_instance.data.value.length>0
							? JSON.stringify(new_instance.data.value[0])
							: null
						const equal_to	= JSON.stringify(old_value)
						assert.notEqual( expected, equal_to, "Compares notEqual data value and old value" )
					}

					await new_instance.destroy()
			});//end it(test_title, async function()
		}//end function make_test_change_data

		describe("save data equals", function() {

			for (let i = 0; i < elements.length; i++) {

				if (elements[i].test_save===false) {
					continue
				}
				const model = elements[i].model
				describe(model, function() {
					make_test_change_data(elements[i], true)
				})
			}
		});

		describe("save data NOT equals", function() {

			for (let i = 0; i < elements.length; i++) {

				if (elements[i].test_save===false) {
					continue
				}

				const model = elements[i].model
				describe(model, function() {
					make_test_change_data(elements[i], false)
				})
			}
		});
	});



// exec mocha
	if (page_globals.is_logged!==true) {

		// user is not logged
		const container = document.getElementById('mocha')
		if (container) {
			container.innerHTML = `Please, login`
		}
	}else{

		mocha.checkLeaks(false)
		mocha.setup({globals: [
			'flatpickr' // library used by component_date
		]});

		mocha.run();
	}
