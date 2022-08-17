/*global it, page_globals, describe, mocha assert */
/*eslint no-undef: "error"*/



/**
* UNIT_TEST
* 	To check basic functionalities of Dédalo elements
*/



import {
	elements,
	section_tipo,
	section_id,
	mode,
	lang
} from './elements.js'
// import * as fn from './data.js'
import {get_instance, key_instances_builder, delete_instance, get_all_instances} from '../../common/js/instances.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'
import {tool_lang} from '../../../tools/tool_lang/js/tool_lang.js'
// import {data_manager} from '../../common/js/data_manager.js'
// import {create_source} from '../../common/js/common.js'



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



// short vars
	const elements_length = elements.length



// instances

	// key_instances_builder
		describe("instances : key_instances_builder", function() {

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
		describe("instances : get_instance", function() {

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
		describe("instances : delete_instance", function() {

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
						lang	: "lg-eng",
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
	describe("components : lifecycle", function() {

		function make_test(element, property, expected, stage) {

			//it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {
			it(`${JSON.stringify(property)} => Init ${element.model}: ${expected}`, async function() {
				// this.timeout(5000);

				return new Promise(async (resolve) => {

					// get and set element context
						// const element_context = await data_manager.get_element_context({
						// 	tipo 			: element.tipo,
						// 	section_tipo 	: element.section_tipo,
						// 	section_id		: element.section_id
						// })
						// // console.log("************* calculated element_context:",element_context.result[0]);
						// element.context = element_context.result[0]

					// direct minimum context
						const request_config = [{
							api_engine	: 'dedalo',
							show		: {
								ddo_map : []
							},
							sqo			: {
								section_tipo : [element.section_tipo]
							}
						}]
						element.context = {
							request_config : request_config // [source]
						}

					// init instance
						const new_instance = await get_instance(element)
							// console.log("new_instance:", stage);

					// if (stage==='build' || stage==='render' || stage==='refresh' || stage==='destroy') {
					if (stage!=='init') {

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
							//const instance_key 	= element.key || key_instances_builder(element, true)
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

							// resolve()
							// return false // stop on destroy
						}
					}

					if (stage!=='destroy') {

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
					}

					resolve()
				})
			});
		}//end function make_test


		// init
			describe("INIT component based on elements values to create a component instance: status = initiated, lang = lg-eng and permissions = null", function() {
				for (let i = 0; i < elements_length; i++) {
					describe(elements[i].model, function() {
						make_test(
							elements[i], // object element
							'status', // string property
							'initiated', // string expected
							'init' // string stage
						)
					})
				}
			});


		// build
			describe("BUILD component based on elements values to create a component instance: status = builded and permissions = 1", function() {
				for (let i = 0; i < elements_length; i++) {
					describe(elements[i].model, function() {
						make_test(
							elements[i], // object element
							'status', // string property
							'builded', // string expected
							'build' // string stage
						)
					})
				}
			});


		// render
			describe("RENDER component based on elements values to create a component instance: status = builded and permissions = 1", function() {
				for (let i = 0; i < elements_length; i++) {
					describe(elements[i].model, function() {
						make_test(
							elements[i], // object element
							'status', // string property
							'rendered', // string expected
							'render' // string stage
						)
					})
				}
			});


		// refresh
			describe("REFRESH component based on elements values to create a component instance: status = builded and permissions = 1", function() {
				for (let i = 0; i < elements_length; i++) {
					describe(elements[i].model, function() {
						make_test(elements[i], // object element
							'status',  // string property
							'rendered', // string expected
							'refresh' // string stage
						)
					})
				}
			});


		// destroy
			describe("DESTROY component based on existing instance", function() {
				for (let i = 0; i < elements_length; i++) {
					describe(elements[i].model, function() {
						make_test(elements[i], // object element
						'instance', // string property
						'destroy', // string expected
						'destroy' // string stage
						)
					})
				}
			});
	});//end components lifecycle



// components change data functions for any component instance
	describe("components : change data", function(){

		function make_test_change_data(elements, equals) {

			const new_value = elements.new_value(elements.new_value_params) //  old_value + 1

			const test_title = (equals===true)
				? `${elements.model} => Save new_value  = new_value (` + JSON.stringify(new_value) + ')'
				: `${elements.model} => Save new_value != old_value (` + JSON.stringify(new_value) + ')'

			it(test_title, async function() {

				// get and set element context
					// const element_context = await data_manager.get_element_context({
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


		// save data equals
			describe("save data equals", function() {

				for (let i = 0; i < elements_length; i++) {

					if (elements[i].test_save===false) {
						continue
					}
					const model = elements[i].model
					describe(model, function() {
						make_test_change_data(elements[i], true)
					})
				}
			});

		// save data NOT equals
			describe("save data NOT equals", function() {

				for (let i = 0; i < elements_length; i++) {

					if (elements[i].test_save===false) {
						continue
					}

					const model = elements[i].model
					describe(model, function() {
						make_test_change_data(elements[i], false)
					})
				}
			});
	});//end components change data



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
