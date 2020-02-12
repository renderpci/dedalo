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

	// delete_instance
		describe("instances : lifecycle", function(){

			// using value as int
			const options = {
				"model" 		: "component_input_text",
				"tipo"  		: "test159",
				"section_tipo" 	: "test65",
				"section_id" 	: 5,
				"mode" 			: "edit",
				"lang" 			: "lg-eng",
				"context" 		: {permissions: 1}
				//"datum"			: {data:[]}
			}

			function make_test (options, property, expected, stage) {
				//it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {
				it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {

					const new_instance = await get_instance(options)

					if (stage ==='build') {
						console.log("new_instance:",new_instance);
						await new_instance.build(true)
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
				
					make_test(options, 'status', 'inited', 'init')
					make_test(options, 'lang', options.lang, 'init')
					make_test(options, 'permissions', null, 'init')
					
			});

			describe("build instance based on options values to create a component instance: status = builded and permissions = 1", function() {
				
					make_test(options, 'status', 'builded', 'build')
					make_test(options, 'permissions', options.context.permissions, 'build')

					make_test(options, 'properties', null, 'build')
					make_test(options, 'typo', null, 'build')
					
			});

		});


// exec mocha
	mocha.run();
