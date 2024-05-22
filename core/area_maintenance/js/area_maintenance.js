// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, JSONEditor, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {common, build_autoload} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_area_maintenance, build_form} from './render_area_maintenance.js'



/**
* AREA_MAINTENANCE
*/
export const area_maintenance = function() {

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
}//end area_maintenance



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// area_maintenance.prototype.init			= area_common.prototype.init
	// area_maintenance.prototype.build			= area_common.prototype.build
	// area_maintenance.prototype.render		= common.prototype.render
	area_maintenance.prototype.refresh			= common.prototype.refresh
	area_maintenance.prototype.destroy			= common.prototype.destroy
	area_maintenance.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area_maintenance.prototype.edit				= render_area_maintenance.prototype.edit
	area_maintenance.prototype.list				= render_area_maintenance.prototype.list



/**
* INIT
* Custom init
*/
area_maintenance.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await area_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)

		// load additional JS/CSS
		// highlightjs from https://highlightjs.org/
			common.prototype.load_style(
				DEDALO_ROOT_WEB + '/core/area_maintenance/css/highlightjs/dark.min.css'
			)
			common.prototype.load_script(
				DEDALO_ROOT_WEB + '/core/area_maintenance/css/highlightjs/highlight.min.js'
			)


	return common_init
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
area_maintenance.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// request_config_object
		self.request_config_object	= (self.context && self.context.request_config)
			? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
			: {}

	// rqo build
		self.rqo = self.rqo || await self.build_rqo_show(self.request_config_object, 'get_data')
		self.rqo.prevent_lock = true

	// debug
		// const rqo_original = clone(self.rqo)

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, area_maintenance without context:", api_response);
					return false
				}

			// debug
				if(SHOW_DEBUG===true) {
					console.log('area_maintenance build api_response:', api_response);
				}

			// set the result to the datum
				self.datum	= api_response.result

			// set context and data to current instance
			// set Context
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context = self.datum.context.find(el => el.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context || {}
					}
				}
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				// self.widgets	= self.datum.context.filter(el => el.parent===self.tipo && el.typo==='widget')
				self.widgets	= self.data && self.data.datalist
					? self.data.datalist
					: []

			// rebuild the request_config_object and rqo in the instance
			// request_config_object
				self.request_config_object	= self.context
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: null

			// rqo build
				self.rqo = await self.build_rqo_show(self.request_config_object, 'get_data')
		}//end if (autoload===true)

	// label
		self.label = self.context
			? self.context.label
			: 'Area Development'

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("__Time to build", self.model, " ms:", performance.now()-t0);
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first DOM node stored in instance 'node' array
*/
area_maintenance.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render




/**
* INIT_JSON_EDITOR
* @param object widget_object
* @return bool
*/
	// area_maintenance.prototype.init_json_editor = async function(widget_object) {

	// 	// const self = this

	// 	const editor_id			= widget_object.editor_id
	// 	const trigger			= widget_object.trigger
	// 	const body_response		= widget_object.body_response
	// 	const print_response	= widget_object.print_response

	// 	const get_input_value = function(input_id) {
	// 		return document.getElementById(input_id).value
	// 	}

	// 	// load dependencies js/css
	// 	load_json_editor_files()
	// 	.then(()=>{

	// 		const editor_text_area = document.getElementById(editor_id)
	// 			  // Hide real data container
	// 			  editor_text_area.style.display = 'none'

	// 		// const result_div = document.getElementById('convert_search_object_to_sql_query_response')

	// 		// create the editor
	// 		const container	= document.getElementById(editor_id + '_container')
	// 		const options	= {
	// 			mode	: 'code',
	// 			modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
	// 			onError	: function (err) {
	// 				alert(err.toString());
	// 			},
	// 			onChange: async function () {
	// 				const editor_text = editor.getText()
	// 				if (editor_text.length<3) return

	// 				// check is json valid and store
	// 					const body_options = JSON.parse(editor_text)
	// 					if (body_options) {
	// 						window.localStorage.setItem('json_editor_sqo', editor_text);
	// 					}

	// 				const dd_api = trigger.dd_api.indexOf('get_input_value:')!==-1
	// 					? get_input_value( trigger.dd_api.replace('get_input_value:', '') )
	// 					: trigger.dd_api

	// 				const action = trigger.action.indexOf('get_input_value:')!==-1
	// 					? get_input_value( trigger.action.replace('get_input_value:', '') )
	// 					: trigger.action

	// 				// data_manager
	// 				const api_response = await data_manager.request({
	// 					body : {
	// 						dd_api	: dd_api,
	// 						action	: action,
	// 						options	: editor_text
	// 					}
	// 				})
	// 				console.log('api_response:',api_response);

	// 				print_response(body_response, api_response)

	// 				return api_response
	// 			}
	// 		}

	// 		// const editor_value	= null; //'{"id":"temp","filter":[{"$and":[{"$or":[{"q":"{\"section_id\":\"4\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","model":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]},{"q":"{\"section_id\":\"2\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","model":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]}]},{"q":"1932","lang":"all","path":[{"name":"Número Catálogo","model":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]}]}],"select":[{"path":[{"name":"Catálogo","model":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"},{"name":"Catálogo","model":"component_input_text","section_tipo":"numisdata300","component_tipo":"numisdata303"}]},{"path":[{"name":"Número Catálogo","model":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]},{"path":[{"name":"Ceca","model":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata30"},{"name":"Ceca","model":"component_input_text","section_tipo":"numisdata6","component_tipo":"numisdata16"}]},{"path":[{"name":"Autoridad","model":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata29"},{"name":"Apellidos","model":"component_input_text","section_tipo":"numisdata22","component_tipo":"rsc86"}]},{"path":[{"name":"Denominación","model":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata34"},{"name":"Denominación","model":"component_input_text","section_tipo":"numisdata33","component_tipo":"numisdata97"}]}],"limit":50,"offset":0}'
	// 		// localStorage.removeItem('json_editor_api');
	// 		const sample_data	= null
	// 		const saved_value	= localStorage.getItem('json_editor_sqo')
	// 		const editor_value	= JSON.parse(saved_value) || sample_data

	// 		// editor instance
	// 		const editor = new JSONEditor(container, options, editor_value)

	// 		return editor
	// 	})


	// 	return true
	// }//end init_json_editor



/**
* INIT_JSON_EDITOR_API
*/
	// area_maintenance.prototype.init_json_editor_api = async function(widget_object) {

	// 	// const self = this

	// 	// short vars
	// 		const editor_id			= widget_object.editor_id
	// 		// const trigger		= widget_object.trigger
	// 		const body_response		= widget_object.body_response
	// 		const print_response	= widget_object.print_response


	// 	// load dependencies js/css
	// 	const js_promise = load_json_editor_files().then(()=>{

	// 		// dom elements
	// 			const widget_container = document.getElementById(widget_object.id) // "dedalo_api_test_environment"

	// 		// button submit
	// 			const button_submit = widget_container.querySelector("#submit_api")
	// 			button_submit.addEventListener("click", async function(e){
	// 				e.stopPropagation()

	// 				const editor_text = editor.getText()
	// 				if (editor_text.length<3) {
	// 					return false
	// 				}

	// 				const rqo = JSON.parse(editor_text)
	// 				if (!rqo) {
	// 					console.warn("Invalid editor text", rqo);
	// 					return false
	// 				}

	// 				// data_manager
	// 				const api_response = await data_manager.request({
	// 					body : rqo
	// 				})
	// 				console.log("/// json_editor_api api_response:",api_response);

	// 				print_response(body_response, api_response)

	// 				return api_response
	// 			})

	// 		// text area hidden
	// 			const editor_text_area = document.getElementById(editor_id)
	// 				  // Hide real data container
	// 				  editor_text_area.style.display = "none"

	// 		// result container
	// 			// const result_div = document.getElementById("convert_search_object_to_sql_query_response")

	// 		// json editor
	// 			const container	= document.getElementById(editor_id + '_container')
	// 			const options	= {
	// 				mode	: 'code',
	// 				modes	: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
	// 				onError	: function (err) {
	// 					alert(err.toString());
	// 				},
	// 				onChange: async function () {
	// 					const editor_text = editor.getText()
	// 					if (editor_text.length<3) return

	// 					// check is json valid and store
	// 					const body_options = JSON.parse(editor_text)
	// 					if (body_options) {
	// 						window.localStorage.setItem('json_editor_api', editor_text);
	// 					}
	// 				}
	// 			}
	// 			// localStorage.removeItem('json_editor_api');
	// 			const sample_data	= [{"typo":"source","type":"component","action":"get_data","model":"component_input_text","tipo":"test159","section_tipo":"test65","section_id":"1","mode":"edit","lang":"lg-eng"}]
	// 			const saved_value	= localStorage.getItem('json_editor_api')
	// 			const editor_value	= JSON.parse(saved_value) || sample_data
	// 			const editor		= new JSONEditor(container, options, editor_value)

	// 		return editor
	// 	})


	// 	return js_promise
	// }//end init_json_editor_api



/**
* LOAD_JSON_EDITOR_FILES
* @return Promise
*/
export const load_json_editor_files = function() {

	// load dependencies js/css
	const load_promises = []

	const lib_css_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.css'
	load_promises.push( common.prototype.load_style(lib_css_file) )

	// const lib_js_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.js'
	// load_promises.push( common.prototype.load_script(lib_js_file) )
	const load_promise = import('../../../lib/jsoneditor/dist/jsoneditor.min.js') // used minified version for now
	load_promises.push( load_promise )

	const load_all = Promise.all(load_promises)


	return load_all
}//end load_json_editor_files



/**
* INIT_FORM
* Alias of build_form
* @param object widget_object
* @return HTMLElement form_container
*/
area_maintenance.prototype.init_form = function(widget_object) {

	return build_form(widget_object)
}//end init_form



// @license-end
