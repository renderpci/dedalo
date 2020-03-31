// test.js
import {get_instance, key_instances_builder, delete_instance, get_all_instances} from '../../common/js/instances.js'
import {data_manager} from '../../common/js/data_manager.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'
import {component_date} from '../../component_date/js/component_date.js'
import {tool_lang} from '../../tools/tool_lang/js/tool_lang.js'



// utilities
	function fn_random_string(length=128) {
		var result           = '';
		var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àü\'ñç';
		var charactersLength = characters.length;
		for ( var i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}
	function fn_random_number(length=10000000) {
		return Math.floor(Math.random() * Math.floor(length));
	}
	function fn_random_json() {
		const value = {
			"text" 	 : fn_random_string(64),
			"number" : fn_random_number()
		}
		return value
	}
	function fn_random_locator() {
		const section_tipo 			= arguments[0][0]
		const from_component_tipo 	= arguments[0][1]
		const paginated_key 		= typeof arguments[0][2]!=="undefined" ? arguments[0][2] : false

		const value = {}

			value.type 					= "dd151"
			value.section_id 			= (fn_random_number(50) || 1).toString()
			value.section_tipo 			= section_tipo // "dd501"
			// if (paginated_key!==false) {
				// value.paginated_key 	= paginated_key
			// }
			value.from_component_tipo 	= from_component_tipo // "test144"

		return value
	}
	function fn_random_date() {
		let day 	= fn_random_number(30) || 1
		let month 	= fn_random_number(12) || 1
		let year  	= fn_random_number(2020) || 1
		const time  = component_date.prototype.convert_date_to_seconds({
			day 	: day,
            month 	: month,
            year 	: year
		}, 'date')

		const value =  {
            start : {
                day 	: day,
                time 	: time,
                year 	: year,
                month 	: month
            }
        }
		return value
	}
	function fn_random_email() {
		let result           	= ''
		const length 		 	= 40
		const characters       	= 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength 	= characters.length;
		for ( var i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		result += '@mydomain.net'
		return result;
	}



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
	const options = []

	// components general
		const section_tipo 	= 'test65'
		const section_id 	= 5
		const mode 			= 'edit'
		const lang 			= 'lg-eng'
		const permissions 	= 2



	var model = 'component_input_text',
		tipo  = 'test159'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_string
	})

	var model = 'component_number',
		tipo  = 'test139'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_number
	})

	var model = 'component_text_area',
		tipo  = 'test32'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_string
	})

	var model = 'component_json',
		tipo  = 'test150'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_json
	})

	var model = 'component_radio_button',
		tipo  = 'test144'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_locator,
		new_value_params: ['dd501', tipo]
	})

	var model = 'component_check_box',
		tipo  = 'test146'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_locator,
		new_value_params: ['dd501', tipo]
	})

	var model = 'component_publication',
		tipo  = 'test148'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_locator,
		new_value_params: ['dd64', tipo]
	})

	var model = 'component_date',
		tipo  = 'test145'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component', properties : {date_mode : 'date'} },
		new_value 		: fn_random_date,
		new_value_params: []
	})

	var model = 'component_autocomplete',
		tipo  = 'test153'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component', properties : {} },
		new_value 		: fn_random_locator,
		new_value_params: ['es1', tipo, 0]
	})

	var model = 'component_filter',
		tipo  = 'test151'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_locator,
		new_value_params: ['dd501', tipo]
	})

	var model = 'component_select',
		tipo  = 'test55'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_locator,
		new_value_params: ['dd64', tipo]
	})

	var model = 'component_email',
		tipo  = 'test140'
	options.push({
		model 			: model,
		tipo  			: tipo,
		section_tipo 	: section_tipo,
		section_id 		: section_id,
		mode 			: mode,
		lang 			: lang,
		// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component'},
		new_value 		: fn_random_email,
		new_value_params: []
	})

	// PORTAL NOT USED ANYMORE
	// var model = 'component_portal',
	// 	tipo  = 'test149'
	// options.push({
	// 	model 			: model,
	// 	tipo  			: tipo,
	// 	section_tipo 	: section_tipo,
	// 	section_id 		: section_id,
	// 	mode 			: mode,
	// 	lang 			: lang,
	// 	// context 		: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component', properties : {} },
	// 	new_value 		: fn_random_locator,
	// 	new_value_params: ['es1', tipo, 0]
	// })


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



// components lifecycle functions for any component instance
	describe("components : lifecycle", function(){

		function make_test (options, property, expected, stage) {
			//it(`${JSON.stringify(property)} => Init: ${expected}`, async function() {
			it(`${JSON.stringify(property)} => Init ${options.model}: ${expected}`, async function() {

				// get and set element context
					const current_data_manager 	= new data_manager()
					const element_context = await current_data_manager.get_element_context({
						tipo 			: options.tipo,
						section_tipo 	: options.section_tipo,
						section_id		: options.section_id
					})
					console.log("************* calculated element_context:",element_context.result[0]);
					options.context = element_context.result[0]

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

		// init
			describe("init component based on options values to create a component instance: status = inited, lang = lg-eng and permissions = null", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {

						make_test(options[i], 'status', 'inited', 'init')
						make_test(options[i], 'lang', options[i].lang, 'init')
						make_test(options[i], 'permissions', null, 'init')
					})
				}
			});


		// build
			describe("build component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {

						make_test(options[i], 'status', 'builded', 'build')
						// make_test(options[i], 'permissions', options[i].context.permissions, 'build')
						make_test(options[i], 'properties', null, 'build')
						make_test(options[i], 'typo', null, 'build')
					})
				}
			});


		// render
			describe("render component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'status', 'rendered', 'render')
					})
				}
			});


		// refresh
			describe("refresh component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'status', 'rendered', 'refresh')
					})
				}
			});


		// destroy
			describe("destroy component based on existing instance", function() {

				for (let i = 0; i < options.length; i++) {

					describe(options[i].model, function() {
						make_test(options[i], 'instance', 'destroy', 'destroy')
					})
				}
			});
	});


// components change data functions for any component instance
	describe("components : change data", function(){

		function make_test_change_data(options, equals) {

			const new_value = options.new_value(options.new_value_params) //  old_value + 1
				// console.log("new_value:",new_value);

			const test_title = (equals===true)
				? `${options.model} => Save new_value = new_value (` + JSON.stringify(new_value) + ')'
				: `${options.model} => Save new_value != old_value (` + JSON.stringify(new_value) + ')'

			it(test_title, async function() {

				// get and set element context
					const current_data_manager 	= new data_manager()
					const element_context = await current_data_manager.get_element_context({
						tipo 			: options.tipo,
						section_tipo 	: options.section_tipo,
						section_id		: options.section_id
					})

					options.context = element_context.result[0]

				// first instance
					const old_instance = await get_instance(options)
					await old_instance.build(true)
						console.log("old_instance:",old_instance);
					const old_value = typeof old_instance.data.value!=="undefined"
						? old_instance.data.value[0]
						: null

					// const new_value = old_value + 1
					// const test_title = (equals===true) ? `${options.model} => Save old value: ${old_value} => new_value = old_value + 1: ${new_value}`: `${options.model} => Save old value: ${old_value} => new_value != old_value: ${new_value}`

					// save
						const changed_data = Object.freeze({
							action	: 'insert',
							key		: 0,
							value	: new_value,
						})
						await old_instance.change_value({
							changed_data : changed_data,
							refresh 	 : false
						})

					// destroy
						if (old_instance) {
							await old_instance.destroy(true, true, true)
						}

				// new instance
					const new_instance = await get_instance(options)
					await new_instance.build(true)


					if (equals===true) {

						const reference_value = new_value
						const data_value      = new_instance.data.value[0]

						// locator case check
						if (typeof data_value.from_component_tipo!=="undefined" && data_value.from_component_tipo) {

							const a = {
								section_tipo 		: data_value.section_tipo,
								section_id 			: data_value.section_id,
								from_component_tipo : data_value.from_component_tipo
							}
							const b = {
								section_tipo 		: reference_value.section_tipo,
								section_id 			: reference_value.section_id,
								from_component_tipo : reference_value.from_component_tipo
							}
							assert.equal( JSON.stringify(a), JSON.stringify(b), "Compares equal saved value and sended value [locator]" )

						}else{

							assert.equal( JSON.stringify(data_value), JSON.stringify(reference_value), "Compares equal saved value and sended value" )
						}

					}else{

						assert.notEqual( JSON.stringify(new_instance.data.value[0]), JSON.stringify(old_value), "Compares notEqual data value and old value" )
					}

					await new_instance.destroy()
		    });
		}

		describe("save data equals", function() {

			for (let i = 0; i < options.length; i++) {

				describe(options[i].model, function() {
					make_test_change_data(options[i], true)
				})
			}
		});

		describe("save data NOT equals", function() {

			for (let i = 0; i < options.length; i++) {

				describe(options[i].model, function() {
					make_test_change_data(options[i], false)
				})
			}
		});

	});




// exec mocha
	// mocha.setup({ignoreLeaks: true});
	mocha.checkLeaks(false)
	mocha.run();


