/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common,load_data_debug} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_area_development, build_form} from './render_area_development.js'



/**
* AREA_DEVELOPMENT
*/
export const area_development = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status

	this.dd_request	= {
		show	: null
	}

	return true
};//end area_development



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_development.prototype.init				= area_common.prototype.init
	// area_development.prototype.build			= area_common.prototype.build
	area_development.prototype.render			= common.prototype.render
	area_development.prototype.refresh			= common.prototype.refresh
	area_development.prototype.destroy			= common.prototype.destroy
	area_development.prototype.build_dd_request	= common.prototype.build_dd_request
	area_development.prototype.edit				= render_area_development.prototype.edit
	area_development.prototype.list				= render_area_development.prototype.list



/**
* BUILD
* @return promise
*	bool true
*/
area_development.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// set dd_request
		self.dd_request.show = self.dd_request.show || self.build_dd_request('show', self.context.request_config, 'get_data')

	// debug
		const dd_request_show_original = JSON.parse(JSON.stringify(self.dd_request.show))

	if (autoload===true) {

		// load data
			const current_data_manager	= new data_manager()
			const api_response			= await current_data_manager.read(self.dd_request.show)

		// set the result to the datum
			self.datum = api_response.result

		// debug
			if(SHOW_DEBUG===true) {
				event_manager.subscribe('render_'+self.id, function(){
					load_data_debug(self, api_response, dd_request_show_original)
				})
			}
	}

	// set context and data to current instance
		self.context	= self.datum.context.filter(element => element.tipo===self.tipo)
		self.data		= self.datum.data.filter(element => element.tipo===self.tipo)
		self.widgets	= self.datum.context.filter(element => element.parent===self.tipo && element.typo==='widget')

		const area_ddo	= self.context.find(element => element.type==='area')
		self.label		= area_ddo.label

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);

		}

	// status update
		self.status = 'builded'

	return true
};//end build




/**
* INIT_JSON_EDITOR
*/
area_development.prototype.init_json_editor = async function(widget_object) {

	const self = this

	const editor_id			= widget_object.editor_id
	const trigger			= widget_object.trigger
	const body_response		= widget_object.body_response
	const print_response	= widget_object.print_response

	const get_input_value = function(input_id) {
		return document.getElementById(input_id).value
	}

	// load dependences js/css
	const js_promise = load_json_editor_files().then(()=>{

		const editor_text_area = document.getElementById(editor_id)
			  // Hide real data container
			  editor_text_area.style.display = "none"

		const result_div = document.getElementById("convert_search_object_to_sql_query_response")

		// create the editor
		const container	= document.getElementById(editor_id + '_container')
		const options	= {
			mode	: 'code',
			modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
			onError	: function (err) {
				alert(err.toString());
			},
			onChange: async function () {
				const editor_text = editor.getText()
				if (editor_text.length<3) return

				// check is json valid and store
					const body_options = JSON.parse(editor_text)
					if (body_options) {
						window.localStorage.setItem('json_editor_sqo', editor_text);
					}

				const dd_api = trigger.dd_api.indexOf("get_input_value:")!==-1
					? get_input_value( trigger.dd_api.replace('get_input_value:', '') )
					: trigger.dd_api

				const action = trigger.action.indexOf("get_input_value:")!==-1
					? get_input_value( trigger.action.replace('get_input_value:', '') )
					: trigger.action

				// data_manager
				const api_response = await data_manager.prototype.request({
					body : {
						dd_api	: dd_api,
						action	: action,
						options	: editor_text
					}
				})
				console.log("api_response:",api_response);

				print_response(body_response, api_response)

				return api_response
			}
		}

		// const editor_value	= null; //'{"id":"temp","filter":[{"$and":[{"$or":[{"q":"{\"section_id\":\"4\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]},{"q":"{\"section_id\":\"2\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]}]},{"q":"1932","lang":"all","path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]}]}],"select":[{"path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"},{"name":"Catálogo","modelo":"component_input_text","section_tipo":"numisdata300","component_tipo":"numisdata303"}]},{"path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]},{"path":[{"name":"Ceca","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata30"},{"name":"Ceca","modelo":"component_input_text","section_tipo":"numisdata6","component_tipo":"numisdata16"}]},{"path":[{"name":"Autoridad","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata29"},{"name":"Apellidos","modelo":"component_input_text","section_tipo":"numisdata22","component_tipo":"rsc86"}]},{"path":[{"name":"Denominación","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata34"},{"name":"Denominación","modelo":"component_input_text","section_tipo":"numisdata33","component_tipo":"numisdata97"}]}],"limit":50,"offset":0}'
		// localStorage.removeItem('json_editor_api');
		const sample_data	= null
		const saved_value	= localStorage.getItem('json_editor_sqo')
		const editor_value	= JSON.parse(saved_value) || sample_data

		// editor instance
		const editor = new JSONEditor(container, options, editor_value)

		return editor
	})


	return true
};//end init_json_editor



/**
* INIT_JSON_EDITOR_API
*/
area_development.prototype.init_json_editor_api = async function(widget_object) {

	const self = this

	// short vars
		const editor_id			= widget_object.editor_id
		const trigger			= widget_object.trigger
		const body_response		= widget_object.body_response
		const print_response	= widget_object.print_response


	// load dependences js/css
	const js_promise = load_json_editor_files().then(()=>{

		// dom elements
			const widget_container = document.getElementById(widget_object.id) // "dedalo_api_test_enviroment"

		// inputs
			const input_dd_api_base		= widget_container.querySelector('#dd_api_base')
			input_dd_api_base.value		= localStorage.getItem('input_dd_api_base') || 'dd_core_api'
			input_dd_api_base.addEventListener("change", function(){
				 localStorage.setItem('input_dd_api_base', this.value)
			})

			const input_dd_api_fn		= widget_container.querySelector('#dd_api_fn')
			input_dd_api_fn.value		= localStorage.getItem('input_dd_api_fn') || 'read'
			input_dd_api_fn.addEventListener("change", function(){
				 localStorage.setItem('input_dd_api_fn', this.value)
			})

			const input_dd_api_request	= widget_container.querySelector('#dd_api_request')
			input_dd_api_request.value	= localStorage.getItem('input_dd_api_request') || 'dd_request'
			input_dd_api_request.addEventListener("change", function(){
				 localStorage.setItem('input_dd_api_request', this.value)
			})

		// button submit
			const button_submit = widget_container.querySelector("#submit_api")
			button_submit.addEventListener("click",async function(e){

				const editor_text = editor.getText()

				if (editor_text.length<3) {
					return false
				}

				const body_options = JSON.parse(editor_text)
				if (!body_options) {
					console.warn("Invalid editor text", body_options);
					return false
				}

				const dd_api			= input_dd_api_base.value
				const action			= input_dd_api_fn.value
				const dd_api_request	= input_dd_api_request.value

				// data_manager
				const api_response = await data_manager.prototype.request({
					body : {
						dd_api				: dd_api,
						action				: action,
						[dd_api_request]	: body_options
					}
				})
				console.log("/// json_editor_api api_response:",api_response);

				print_response(body_response, api_response)

				return api_response
			},false)

		// text area hiden
			const editor_text_area = document.getElementById(editor_id)
				  // Hide real data container
				  editor_text_area.style.display = "none"

		// result container
			const result_div = document.getElementById("convert_search_object_to_sql_query_response")

		// json editor
			const container	= document.getElementById(editor_id + '_container')
			const options	= {
				mode	: 'code',
				modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
				onError	: function (err) {
					alert(err.toString());
				},
				onChange: async function () {
					const editor_text = editor.getText()
					if (editor_text.length<3) return

					// check is json valid and store
					const body_options = JSON.parse(editor_text)
					if (body_options) {
						window.localStorage.setItem('json_editor_api', editor_text);
					}
				}
			}
			// localStorage.removeItem('json_editor_api');
			const sample_data	= [{"typo":"source","type":"component","action":"get_data","model":"component_input_text","tipo":"test159","section_tipo":"test65","section_id":"1","mode":"edit","lang":"lg-eng"}]
			const saved_value	= localStorage.getItem('json_editor_api')
			const editor_value	= JSON.parse(saved_value) || sample_data
			const editor		= new JSONEditor(container, options, editor_value)

		return editor
	})


	return js_promise
};//end init_json_editor_api



/**
* LOAD_JSON_EDITOR_FILES
*/
const load_json_editor_files = function() {

	// load dependences js/css
	const load_promises = []

	const lib_css_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.css'
	load_promises.push( common.prototype.load_style(lib_css_file) )

	// const lib_js_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.js'
	// load_promises.push( common.prototype.load_script(lib_js_file) )
	const load_promise = import('../../../lib/jsoneditor/dist/jsoneditor.min.js') // used minified version for now
	load_promises.push( load_promise )

	const load_all = Promise.all(load_promises).then(async function(response){
		//console.log("JSONEditor:",response);
	})

	return load_all
};//end load_json_editor_files



/**
* INIT_FORM
* @return DOM node form
*/
area_development.prototype.init_form = async function(widget_object) {

	build_form(widget_object)

	return true
};//end init_form
