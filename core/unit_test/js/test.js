// test.js
import {get_instance, key_instances_builder, delete_instance} from '../../common/js/instances.js'
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
	const options_input_text = {
		"model" 		: "component_input_text",
		"tipo"  		: "test159",
		"section_tipo" 	: "test65",
		"section_id" 	: 5,
		"mode" 			: "edit",
		"lang" 			: "lg-eng",
		"context" 		: {permissions: 1, tipo: 'test159', model: 'component_input_text', section_tipo: 'test65', lang: 'lg-eng', type:'component'}
		//"datum"			: {data:[]}
	}

	const options_number = {
		"model" 		: "component_number",
		"tipo"  		: "test139",
		"section_tipo" 	: "test65",
		"section_id" 	: 5,
		"mode" 			: "edit",
		"lang" 			: "lg-eng",
		"context" 		: {permissions: 1, tipo: 'test139', model: 'component_number', section_tipo: 'test65', lang: 'lg-eng', type:'component'}
	}

	const options = []
	options.push(options_input_text)
	options.push(options_number)

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

				// whitout receive some vars like section_id and lang
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

					const new_instance = await get_instance(options)

					if (stage ==='build' || stage === 'render') {
						await new_instance.build(true)

						if (stage === 'render') {
							await new_instance.render()
						}

					}

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
