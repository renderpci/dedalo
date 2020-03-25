// test.js
import {get_instance, key_instances_builder, delete_instance, get_all_instances} from '../../common/js/instances.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'
import {tool_lang} from '../../tools/tool_lang/js/tool_lang.js'



// model
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
	const options = []

	// var model, tipo, section_tipo, lang, type

	options.push({
		"model" 		: "component_input_text",
		"tipo"  		: "test159",
		"section_tipo" 	: "test65",
		"section_id" 	: 5,
		"mode" 			: "edit",
		"lang" 			: "lg-eng",
		"context" 		: {permissions: 1, tipo: 'test159', model: 'component_input_text', section_tipo: 'test65', lang: 'lg-eng', type:'component'}
		//"datum"			: {data:[]}
	})

	options.push({
		"model" 		: "component_number",
		"tipo"  		: "test139",
		"section_tipo" 	: "test65",
		"section_id" 	: 5,
		"mode" 			: "edit",
		"lang" 			: "lg-eng",
		"context" 		: {permissions: 1, tipo: 'test139', model: 'component_number', section_tipo: 'test65', lang: 'lg-eng', type:'component'}
	})

	options.push({
		"model" 		: "component_text_area",
		"tipo"  		: "test32",
		"section_tipo" 	: "test65",
		"section_id" 	: 5,
		"mode" 			: "edit",
		"lang" 			: "lg-eng",
		"context" 		: {permissions: 1, tipo: 'test32', model: 'component_text_area', section_tipo: 'test65', lang: 'lg-eng', type:'component'}
	})


// instances

	// key_instances_builder
		describe("instances : key_instances_builder", function(){

			function make_test (options, expected) {
				it(`${JSON.stringify(options)} => '${expected}'`, function(done) {
			    	assert.equal( key_instances_builder(options), expected);
			    	done()
			    });
			}

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("builds instance key based on options values", function() {

				// using value as int
					make_test({
						"model" 		: "component_input_text",
						"tipo"  		: "test159",
						"section_tipo" 	: "test65",
						"section_id" 	: 1,
						"mode" 			: "edit",
						"lang" 			: "lg-eng"
					}, 'component_input_text_test159_test65_1_edit_lg-eng');

				// using null as value
					make_test({
							"model" 		: "component_input_text",
							"tipo"  		: "test159",
							"section_tipo" 	: "test65",
							"section_id" 	: null,
							"mode" 			: "edit",
							"lang" 			: "lg-eng"
						}, 'component_input_text_test159_test65_edit_lg-eng');

				// without receive some vars like section_id and lang
					make_test({
							"model" 		: "component_input_text",
							"tipo"  		: "test159",
							"section_tipo" 	: "test65",
							"mode" 			: "edit",
							"lang" 			: "lg-eng"
						}, 'component_input_text_test159_test65_edit_lg-eng');
			});
		});
	// get_instance
		describe("instances : get_instance", function(){

			function make_test(options, expected) {
				it(`${JSON.stringify(options)} => '${expected.name}'`, async function() {
					const instance = await get_instance(options)
					assert.instanceOf(instance, expected, 'result is an instance of expected '+instance.name);
			    });
			}
			// page instance
				describe("builds page instance from options", function() {
						make_test({
							"model" 		: "page"
						}, page);
				});
			// component_input_text instance
				describe("builds component_input_text instance from options", function() {
						make_test({
							"model" 		: "component_input_text",
							"tipo"  		: "test159",
							"mode" 			: "edit",
							"lang" 			: "lg-eng",
							"context" 		: {}
						}, component_input_text);
				});
			// tool_lang instance
				describe("builds tool_lang instance from options", function() {
						make_test({
							"model" 		: "tool_lang",
							"mode" 			: "edit",
							"lang" 			: "lg-eng",
							"tool_object"	: {},
							"caller" 		: {}
						}, tool_lang);
				});
		});
	// delete_instance
		describe("instances : delete_instance", function(){

			function make_test (options, expected) {
				it(`${JSON.stringify(options)} => DELETED: ${expected}`, async function() {

					// console.log("new_instance:",new_instance);
					const deleted 		= await delete_instance(options);
			    	assert.equal(deleted, expected);
			    });
			}

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("delete instance based on options values to create the key: No delete [not exists]", function() {
				// using value as int
					const options = {
						"model" 		: "component_input_text",
						"tipo"  		: "test159",
						"mode" 			: "edit",
						"lang" 			: "lg-cat",
						"context" 		: {}
					}
					make_test(options, 0);
			});

			describe("delete instance based on options values to create the key: Yes delete 1", function() {
				// using value as int
					const options = {
						"model" 		: "component_input_text",
						"tipo"  		: "test159",
						"mode" 			: "edit",
						"lang" 			: "lg-vlca",
						"context" 		: {}
					}
					const new_instance = get_instance(options)
					make_test(options, 1);
			});

			describe("delete instance based on options values to create the key: Yes delete 1", function() {
				// create instance
				const options  = {
					"model"	: "page"
				}
				make_test(options, 1);
			});
		});

	// test lifecycle functions for any component instance
		describe("instances : lifecycle", function(){

			function make_test (options, property, expected, stage) {
				//it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {
				it(`${JSON.stringify(property)} => Init ${options.model}: ${expected}`, async function() {

					// init instance
					const new_instance = await get_instance(options)

					if (stage==='build' || stage==='render' || stage==='refresh' || stage==='destroy') {

						await new_instance.build(true)

						if (stage==='render') {
							await new_instance.render()
						}

						if (stage==='refresh') {
							await new_instance.render()
							await new_instance.refresh()
						}

						if (stage==='destroy') {

							const instance_id 	= new_instance.id
							//const instance_key 	= options.key || key_instances_builder(options, true)
							const instances 	= get_all_instances()

							// console.log("instances:",instances)
							// 	console.log("instance_id:",instance_id)
							// 		console.log("instance_key:",instance_key);

							const found_instance_before_destroy = instances.filter(instance => instance.id===instance_id)
							await new_instance.destroy()
							const found_instance_after_destroy = instances.filter(instance => instance.id===instance_id)

							// console.log("found_instance_before_destroy:",found_instance_before_destroy)
							// console.log("found_instance_after_destroy:",found_instance_after_destroy)

							//assert.equal(found_instance_before_destroy.length, 1)
							assert.equal(found_instance_after_destroy.length, 0)

							return false
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
						    case 'properties':
						 		assert.notEqual(new_instance.permissions, expected)
						     	break;
					     	case 'typo':
						 		assert.notEqual(new_instance.permissions, expected)
						     	break;
						    default:
						 		assert.equal(new_instance.status, expected)
						     	break;
						}
					}

					await new_instance.destroy()
			    });
			}


			describe("init instance based on options values to create a component instance: status = inited, lang = lg-eng and permissions = null", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {

						make_test(options[i], 'status', 'inited', 'init')
						make_test(options[i], 'lang', options[i].lang, 'init')
						make_test(options[i], 'permissions', null, 'init')

					})

				}
			});


			describe("build instance based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {

						make_test(options[i], 'status', 'builded', 'build')
						make_test(options[i], 'permissions', options[i].context.permissions, 'build')

						make_test(options[i], 'properties', null, 'build')
						make_test(options[i], 'typo', null, 'build')

					})
				}
			});


			describe("render instance based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'status', 'rendered', 'render')
					})
				}
			});


			describe("refresh instance based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'status', 'rendered', 'refresh')
					})
				}
			});

			describe("destroy instance based on existing instance", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'instance', 'destroy', 'destroy')
					})
				}

			});

		});


	// test change data functions for any component instance
		describe("instances : change data", function(){

			function make_test (options, equals) {

				const test_title = (equals===true) ? `${options.model} => Save new_value = old_value + 1`: `${options.model} => Save new_value != old_value`

				it(test_title, async function() {

					const old_instance = await get_instance(options)
					await old_instance.build(true)

					const old_value = old_instance.data.value[0]
					const new_value = old_value + 1
					//const test_title = (equals===true) ? `${options.model} => Save old value: ${old_value} => new_value = old_value + 1: ${new_value}`: `${options.model} => Save old value: ${old_value} => new_value != old_value: ${new_value}`

					const changed_data = Object.freeze({
						action	: 'update',
						key		: 0,
						value	: new_value,
					})

					await old_instance.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})

					await old_instance.destroy()

					const new_instance = await get_instance(options)

					await new_instance.build(true)

					if (equals===true) {
						assert.equal(new_instance.data.value[0], new_value)
					}else{
						assert.notEqual(new_instance.data.value[0], old_value)
					}

					await new_instance.destroy()

			    });
			}

			describe("save data equals", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], true)
					})
				}

			});

			describe("save data NOT equals", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], false)
					})
				}

			});

		});




// exec mocha
	mocha.run();


