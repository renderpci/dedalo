/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, import */
/*eslint no-undef: "error"*/



// imports
	import {common,load_data_debug} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
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


	return true
}//end area_development



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_development.prototype.init				= area_common.prototype.init
	// area_development.prototype.build			= area_common.prototype.build
	// area_development.prototype.render		= common.prototype.render
	area_development.prototype.refresh			= common.prototype.refresh
	area_development.prototype.destroy			= common.prototype.destroy
	area_development.prototype.build_rqo_show	= common.prototype.build_rqo_show
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

	// rqo_config
		self.rqo_config	= self.context.request_config
			? self.context.request_config.find(el => el.api_engine==='dedalo')
			: {}

	// rqo build
		self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, 'get_data')
		self.rqo.prevent_lock = true

	// debug
		const rqo_original = clone(self.rqo)

	// load from DDBB
		if (autoload===true) {

			// load data
				const api_response = await data_manager.request({body:self.rqo})

			// set the result to the datum
				self.datum	= api_response.result

			// set context and data to current instance
				self.context	= self.datum.context.find(el => el.tipo===self.tipo)
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				self.widgets	= self.datum.context.filter(el => el.parent===self.tipo && el.typo==='widget')

			// rebuild the rqo_config and rqo in the instance
			// rqo_config
				self.rqo_config	= self.context.request_config.find(el => el.api_engine==='dedalo')

			// rqo build
				self.rqo = await self.build_rqo_show(self.rqo_config, 'get_data')
		}//end if (autoload===true)

		self.label = self.context.label


	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'builded'


	return true
}//end build



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first DOM node stored in instance 'node' array
*/
area_development.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render




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
				const api_response = await data_manager.request({
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
}//end init_json_editor



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
			const widget_container = document.getElementById(widget_object.id) // "dedalo_api_test_environment"

		// button submit
			const button_submit = widget_container.querySelector("#submit_api")
			button_submit.addEventListener("click",async function(e){

				const editor_text = editor.getText()
				if (editor_text.length<3) {
					return false
				}

				const rqo = JSON.parse(editor_text)
				if (!rqo) {
					console.warn("Invalid editor text", rqo);
					return false
				}

				// data_manager
				const api_response = await data_manager.request({
					body : rqo
				})
				console.log("/// json_editor_api api_response:",api_response);

				print_response(body_response, api_response)

				return api_response
			})

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
}//end init_json_editor_api



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
}//end load_json_editor_files



/**
* INIT_FORM
* @return DOM node form
*/
area_development.prototype.init_form = async function(widget_object) {

	build_form(widget_object)

	return true
}//end init_form
