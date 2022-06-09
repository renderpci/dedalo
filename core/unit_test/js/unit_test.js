/*global it, page_globals, describe, mocha assert */
/*eslint no-undef: "error"*/



// test.js
import {get_instance, key_instances_builder, delete_instance, get_all_instances} from '../../common/js/instances.js'
// import {data_manager} from '../../common/js/data_manager.js'
// import {create_source} from '../../common/js/common.js'
import {page} from '../../page/js/page.js'
import {component_input_text} from '../../component_input_text/js/component_input_text.js'
import {component_date} from '../../component_date/js/component_date.js'
import {tool_lang} from '../../../tools/tool_lang/js/tool_lang.js'



// utilities
	function fn_random_string(length=128) {

		let result = '';

		const names = ['El raspa','Isis','Monstruo','Osi','Mini','Pitu','Ojitos','Turbina','Susto']
		const randomElement = names[Math.floor(Math.random() * names.length)];
		result += randomElement + ' - '

		const characters		= 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àü\'ñç';
		const charactersLength	= characters.length;
		for ( let i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		   if (i>2) { break }
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
		const section_tipo			= arguments[0][0]
		const from_component_tipo	= arguments[0][1]
		// const paginated_key		= typeof arguments[0][2]!=="undefined" ? arguments[0][2] : false
		const section_id			= (fn_random_number(50) || 1).toString()

		const value = {
			type				: "dd151",
			section_id			: section_id,
			section_tipo		: section_tipo,
			from_component_tipo	: from_component_tipo
		}
		// if (paginated_key!==false) {
			// value.paginated_key 	= paginated_key
		// }

		return value
	}
	function fn_ar_random_locator() {
		const result = fn_random_locator(...arguments)
		return [result]
	}
	function fn_custom_locator() {
		const section_tipo			= arguments[0][0]
		const section_id			= arguments[0][1]
		const from_component_tipo	= arguments[0][2]
		// const paginated_key		= typeof arguments[0][2]!=="undefined" ? arguments[0][2] : false

		const value = {
			type				: "dd151",
			section_id			: (section_id).toString(),
			section_tipo		: section_tipo, // "dd501"
			from_component_tipo	: from_component_tipo // "test144"
		}

		return value
	}
	function fn_random_date() {
		let day		= fn_random_number(30) || 1
		let month	= fn_random_number(12) || 1
		let year	= fn_random_number(2022) || 1
		const time	= component_date.prototype.convert_date_to_seconds({
			day		: day,
			month	: month,
			year	: year
		}, 'date')

		const value =  {
			start : {
				day		: day,
				time	: time,
				year	: year,
				month	: month
			}
		}
		return value
	}
	function fn_random_email() {
		let result				= ''
		const length			= 40
		const characters		= 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength	= characters.length;
		for ( var i = 0; i < length; i++ ) {
		   result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		result += '@mydomain.net'
		return result;
	}
	function fn_random_filter_records() {

		// randomly generated N = 40 length array 0 <= A[N] <= 39
		const value = Array.from({length: 40}, () => Math.floor(Math.random() * 40));

		const item = {
			tipo : 'rsc167',
			value : value
		}

		const result = [item]

		return result;
	}
	function fn_random_geolocation() {
		const alt = fn_random_number(100) // expected int from 1 to 100
		const lat = Math.random() // expected output: a float number from 0 to <1
		const lon = Math.random()
		const zoom = fn_random_number(15) // expected int from 1 to 15

		const result = [{
			alt		: alt,
			lat		: lat,
			lon		: lon,
			zoom	: zoom
		}]

		return result;
	}
	function fn_random_image_data() {
		const result = [
		 {
		  "original_file_name": "rsc29_rsc170_179_deleted_2022-02-11_1347.jpg",
		  "original_upload_date": {
		   "day": fn_random_number(30) || 1,
		   "hour": fn_random_number(23) || 12,
		   "time": fn_random_number(64997809699),
		   "year": fn_random_number(2022) || 1,
		   "month": fn_random_number(12) || 1,
		   "minute": fn_random_number(59) || 1,
		   "second": fn_random_number(59) || 1
		  }
		 }
		]

		return result
	}
	function fn_random_iri_data() {
		const result = {
			iri		: "https://www." + fn_random_string(64) + '-' + fn_random_string(50) +  '.' + fn_random_string(3),
			title	: fn_random_string(128)
		}
		return result;
	}
	function fn_random_pdf_data() {
		const result = {
			section_id : (fn_random_number(50) || 1).toString(),
			section_tipo : "rsc170",
			component_tipo : "rsc74",
			original_file_name : "rsc209_rsc205_" + (fn_random_number(500) || 36).toString() + "_lg-spa.pdf",
			original_upload_date : {
				day : fn_random_number(30) || 1,
				hour : fn_random_number(23) || 1,
				time : fn_random_number(64983057555) || 1,
				year : fn_random_number(2022) || 1,
				month : fn_random_number(12) || 1,
				minute : 19,
				second : 15
			}
		}

		return result
	}
	function fn_random_security_access() {
		const result = [{
			tipo			: "mupi23",
			value			: fn_random_number(10000) || 1,
			section_tipo	: "mupi2"
		},
		{
			tipo			: "oh15",
			value			: fn_random_number(10000) || 1,
			section_tipo	: "oh1"
		}]
		return result
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

	// components general values
		const section_tipo	= 'test3'
		const section_id	= 1
		const mode			= 'edit'
		const lang			= 'lg-eng'
		const permissions	= 2


	// component_av
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_av', 'test94', section_tipo, section_id, mode, page_globals.dedalo_data_nolan, fn_custom_locator, [section_tipo, section_id, 'test94']) )

	// component_calculation (WORKING HERE)

	// component_check_box
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_check_box', 'test146', section_tipo, section_id, mode, lang, fn_random_locator, ['dd501','test146']) )

	// component_date
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_date', 'test145', section_tipo, section_id, mode, lang, fn_random_date, []) )

	// component_email
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_email', 'test208', section_tipo, section_id, mode, lang, fn_random_email, []) )

	// component_external (WORKING HERE)

	// component_filter
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
			}
		})('component_filter', 'test101', section_tipo, section_id, mode, lang, fn_random_locator, [section_tipo,'test101']) )

	// component_filter_master
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
			}
		})('component_filter_master', 'test70', section_tipo, section_id, mode, lang, fn_random_locator, [section_tipo,'test70']) )

	// component_filter_records
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
			}
		})('component_filter_records', 'test69', section_tipo, section_id, mode, lang, fn_random_filter_records, []) )

	// component_geolocation
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
			}
		})('component_geolocation', 'test100', section_tipo, section_id, mode, lang, fn_random_geolocation, []) )

	// component_html_file (WORKING HERE)

	// component_html_text (WORKING HERE)

	// component_image
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_image', 'test99', section_tipo, section_id, mode, page_globals.dedalo_data_nolan, fn_random_image_data, []) )

	// component_info (WORKING HERE)

	// component_input_text
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_input_text', 'test52', section_tipo, section_id, mode, lang, fn_random_string) )

	// component_inverse (WORKING HERE)

	// component_ip (WORKING HERE)

	// component_iri
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_iri', 'test140', section_tipo, section_id, mode, lang, fn_random_iri_data) )

	// component_json
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_json', 'test150', section_tipo, section_id, mode, lang, fn_random_json, []) )

	// component_layout (WORKING HERE)

	// component_number
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_number', 'test139', section_tipo, section_id, mode, lang, fn_random_number, []) )

	// component_password
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_password', 'test152', section_tipo, section_id, mode, lang, fn_random_string) )

	// component_pdf
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_pdf', 'test85', section_tipo, section_id, mode, page_globals.dedalo_data_nolan, fn_random_pdf_data, []) )

	// component_portal (basic v5 config)
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
			}
		})('component_portal', 'test80', section_tipo, section_id, mode, lang, fn_random_locator, ['test38', 'test80', 0]) )

	// component_publication
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_publication', 'test92', section_tipo, section_id, mode, lang, fn_random_locator, ['dd64','test92']) )

	// component_radio_button
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_radio_button', 'test144', section_tipo, section_id, mode, lang, fn_random_locator, ['dd501','test144']) )

	// component_relation_children
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_relation_children', 'test201', section_tipo, section_id, mode, lang, fn_random_locator, [section_tipo,'test201']) )

	// component_relation_index
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_relation_index', 'test25', section_tipo, section_id, mode, lang, fn_random_locator, ['es1','test25']) )

	// component_relation_model
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_relation_model', 'test169', section_tipo, section_id, mode, lang, fn_random_locator, ['es2','test169']) )

	// component_relation_parent
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_relation_parent', 'test71', section_tipo, section_id, mode, lang, fn_random_locator, ['es1','test71']) )

	// component_relation_related
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_relation_related', 'test56', section_tipo, section_id, mode, lang, fn_random_locator, [section_tipo,'test56']) )

	// component_struct (WORKING HERE)

	// component_score (WORKING HERE)

	// component_section_id
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_section_id', 'test102', section_tipo, section_id, mode, lang, fn_random_string) )

	// component_security_access
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_security_access', 'test157', section_tipo, section_id, mode, lang, fn_random_security_access, []) )

	// component_select
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_select', 'test91', section_tipo, section_id, mode, lang, fn_random_locator, ['es1','test91']) )

	// component_select_lang
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_select_lang', 'test89', section_tipo, section_id, mode, lang, fn_random_locator, ['lg1','test89']) )

	// component_semantic_node (WORKING HERE)

	// component_svg
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model				: model,
				tipo				: tipo,
				section_tipo		: section_tipo,
				section_id			: section_id,
				mode				: mode,
				lang				: lang,
				new_value			: new_value,
				new_value_params	: new_value_params
			}
		})('component_svg', 'test177', section_tipo, section_id, mode, page_globals.dedalo_data_nolan, fn_random_image_data, []) )

	// component_text_area
		options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
			return {
				model			: model,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				mode			: mode,
				lang			: lang,
				new_value		: new_value
			}
		})('component_text_area', 'test17', section_tipo, section_id, mode, lang, fn_random_string) )



	// des
		// component_portal v6 toponymy A
		// options.push( (function(model, tipo, section_tipo, section_id, mode, lang, new_value, new_value_params){
		// 	return {
		// 		model				: model,
		// 		tipo				: tipo,
		// 		section_tipo		: section_tipo,
		// 		section_id			: section_id,
		// 		mode				: mode,
		// 		lang				: lang,
		// 		new_value			: new_value,
		// 		new_value_params	: new_value_params // [section_tipo, from_component_tipo, paginated_key]
		// 	}
		// })('component_portal', 'test204', section_tipo, section_id, mode, lang, fn_custom_locator, ['es1', 'test204', 0, 1]) )


		// options.push( (function(model, tipo){
		// 	return {
		// 		model				: model,
		// 		tipo				: tipo,
		// 		section_tipo		: section_tipo,
		// 		section_id			: section_id,
		// 		mode				: mode,
		// 		lang				: lang,
		// 		new_value			: fn_random_locator,
		// 		new_value_params	: ['dd64', tipo]
		// 	}
		// })('component_publication', 'test148') )


		// options.push( (function(model, tipo){
		// 	return {
		// 		model				: model,
		// 		tipo				: tipo,
		// 		section_tipo		: section_tipo,
		// 		section_id			: section_id,
		// 		mode				: mode,
		// 		lang				: lang,
		// 		new_value			: fn_random_locator,
		// 		new_value_params	: ['dd501', tipo]
		// 	}
		// })('component_filter', 'test151') )


		// options.push( (function(model, tipo){
		// 	return {
		// 		model				: model,
		// 		tipo				: tipo,
		// 		section_tipo		: section_tipo,
		// 		section_id			: section_id,
		// 		mode				: mode,
		// 		lang				: lang,
		// 		new_value			: fn_random_locator,
		// 		new_value_params	: ['dd64', tipo]
		// 	}
		// })('component_select', 'test55') )


		// options.push( (function(model, tipo){
		// 	return {
		// 		model				: model,
		// 		tipo				: tipo,
		// 		section_tipo		: section_tipo,
		// 		section_id			: section_id,
		// 		mode				: mode,
		// 		lang				: lang,
		// 		// context			: {permissions: 2, tipo: tipo, model: model, section_tipo: section_tipo, lang: lang, type:'component', properties : {} },
		// 		new_value			: fn_random_locator,
		// 		new_value_params	: ['es1', tipo, 0]
		// 	}
		// })('component_portal', 'test153') )


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

			const model				= 'component_input_text'
			const tipo				= 'test52'
			// const section_tipo	= 'test3'
			// const section_id		= 1
			// const mode			= 'edit'
			// const lang			= 'lg-eng'

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("builds instance key based on options values (using component_input_text)", function() {

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

			function make_test(options, expected) {
				it(`${JSON.stringify(options)} => '${expected.name}'`, async function() {
					const instance = await get_instance(options)
					assert.instanceOf(instance, expected, 'result is an instance of expected '+instance.name);
				});
			}
			// page instance
				describe("builds page instance from options", function() {
						make_test({
							model	: "page",
							context	: []
						}, page);
				});
			// component_input_text instance
				describe("builds component_input_text instance from options", function() {
						make_test({
							model	: "component_input_text",
							tipo	: 'test52',
							mode	: mode,
							lang	: lang,
							context	: {}
						}, component_input_text);
				});
			// tool_lang instance
				describe("builds tool_lang instance from options", function() {
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

			function make_test (options, expected) {
				it(`${JSON.stringify(options)} => DELETED: ${expected}`, async function() {

					// console.log("new_instance:",new_instance);
					const deleted = await delete_instance(options);
					assert.equal(deleted, expected);
				});
			}

			// keys: ['model','tipo','section_tipo','section_id','mode','lang']

			describe("delete component_input_text instance based on options values to create the key: No delete [do not exists]", function() {
				// using value as int
					const options = {
						model	: "component_input_text",
						tipo	: "test52",
						mode	: mode,
						lang	: lang,
						context	: {}
					}
					make_test(options, 0);
			});

			describe("delete component_input_text instance based on options values to create the key: Yes delete 1", function() {
				// using value as int
					const options = {
						model	: "component_input_text",
						tipo	: "test52",
						mode	: mode,
						lang	: "lg-vlca",
						context	: {}
					}
					const new_instance = get_instance(options)
					make_test(options, 1);
			});

			describe("delete page instance based on options values to create the key: Yes delete 1", function() {
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
					// const current_data_manager 	= new data_manager()
					// const element_context = await current_data_manager.get_element_context({
					// 	tipo 			: options.tipo,
					// 	section_tipo 	: options.section_tipo,
					// 	section_id		: options.section_id
					// })
					// // console.log("************* calculated element_context:",element_context.result[0]);
					// options.context = element_context.result[0]

				// direct miniumun context
					const request_config = [{
						api_engine	: "dedalo",
						show		: {
							ddo_map : []
						},
						sqo			: {
							section_tipo : [options.section_tipo]
						}
					}]
					options.context = {
						request_config : request_config // [source]
					}

				// init instance
					const new_instance = await get_instance(options)
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
						//const instance_key 	= options.key || key_instances_builder(options, true)
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
			describe("INIT component based on options values to create a component instance: status = initiated, lang = lg-eng and permissions = null", function() {

				for (let i = 0; i < options.length; i++) {
					describe(options[i].model, function() {
						// params: options, property, expected, stage
						make_test(options[i], 'status', 'initiated', 'init')
					})
				}
			});


		// build
			describe("BUILD component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {
					describe(options[i].model, function() {
						// params: options, property, expected, stage
						make_test(options[i], 'status', 'builded', 'build')
						// make_test(options[i], 'permissions', 3, 'build')
					})
				}
			});


		// render
			describe("RENDER component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {
					describe(options[i].model, function() {
						// params: options, property, expected, stage
						make_test(options[i], 'status', 'rendered', 'render')
					})
				}
			});


		// refresh
			describe("REFRESH component based on options values to create a component instance: status = builded and permissions = 1", function() {

				for (let i = 0; i < options.length; i++) {
					// params: options, property, expected, stage
					describe(options[i].model, function() {
						make_test(options[i], 'status', 'rendered', 'refresh')
					})
				}
			});


		// destroy
			describe("DESTROY component based on existing instance", function() {

				for (let i = 0; i < options.length; i++) {
					// params: options, property, expected, stage
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

			const test_title = (equals===true)
				? `${options.model} => Save new_value  = new_value (` + JSON.stringify(new_value) + ')'
				: `${options.model} => Save new_value != old_value (` + JSON.stringify(new_value) + ')'

			it(test_title, async function() {

				// get and set element context
					// const current_data_manager = new data_manager()
					// const element_context = await current_data_manager.get_element_context({
					// 	tipo			: options.tipo,
					// 	section_tipo	: options.section_tipo,
					// 	section_id		: options.section_id
					// })
					// options.context = element_context.result[0]

				// create and add request_config
					const request_config = [{
						api_engine	: "dedalo",
						show		: {
							ddo_map : []
						},
						sqo			: {
							section_tipo : [options.section_tipo]
						}
					}]
					options.context = {
						request_config : request_config // [source]
					}

				// old instance
					const old_instance = await get_instance(options)
					await old_instance.build(true)

					const old_value = typeof old_instance.data.value!=="undefined"
						? old_instance.data.value[0]
						: null

					// const new_value = old_value + 1
					// const test_title = (equals===true) ? `${options.model} => Save old value: ${old_value} => new_value = old_value + 1: ${new_value}`: `${options.model} => Save old value: ${old_value} => new_value != old_value: ${new_value}`

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
					const new_instance = await get_instance(options)
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

			for (let i = 0; i < options.length; i++) {

				const model = options[i].model
				if (model==='component_password' ||
					model==='component_section_id') {
					continue
				}

				describe(model, function() {
					make_test_change_data(options[i], true)
				})
			}
		});

		describe("save data NOT equals", function() {

			for (let i = 0; i < options.length; i++) {

				const model = options[i].model
				if (model==='component_password' ||
					model==='component_section_id') {
					continue
				}

				describe(model, function() {
					make_test_change_data(options[i], false)
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
