/*global get_label, page_globals, SHOW_DEBUG, JSONEditor, import */
/*eslint no-undef: "error"*/



// imports
	import {common,load_data_debug} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	// import {clone, dd_console} from '../../common/js/utils/index.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {render_area} from './render_area.js'



/**
* AREA
*/
export const area = function() {

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
}//end area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area.prototype.init				= area_common.prototype.init
	// area.prototype.build			= area_common.prototype.build
	// area.prototype.render		= common.prototype.render
	area.prototype.refresh			= common.prototype.refresh
	area.prototype.destroy			= common.prototype.destroy
	area.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area.prototype.edit				= render_area.prototype.edit
	area.prototype.list				= render_area.prototype.list



/**
* BUILD
* Load and parse necessary data to create a full ready instance
* @param bool autoload = false
* @return bool
*/
area.prototype.build = async function(autoload=true) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data	= self.data || {}

	// rqo
		const generate_rqo = async function(){

			if (!self.context) {
				// request_config_object. get the request_config_object from request_config
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// rqo build
			const action	= 'search'
			const add_show	= self.add_show ? self.add_show : self.mode==='tm' ? true : false
			self.rqo = self.rqo || await self.build_rqo_show(
				self.request_config_object, // object request_config_object
				action,  // string action like 'search'
				add_show // bool add_show
			)
		}
		await generate_rqo()

	// load from DDBB
		if (autoload===true) {

			// load data
				const api_response = await data_manager.request({
					body : self.rqo
				})
				if (!api_response || !api_response.result) {
					self.running_with_errors = [
						'area build autoload api_response: '+ (api_response.error || api_response.msg)
					]
					console.error("Error: area build autoload api_response:", api_response);
					return false
				}

			// set the result to the datum
				self.datum	= api_response.result

			// set context and data to current instance
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
					const context	= self.datum.context.find(el => el.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				self.widgets	= self.datum.context.filter(el => el.parent===self.tipo && el.typo==='widget')

			// rebuild the request_config_object and rqo in the instance
			// request_config_object
				self.request_config_object	= self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')

			// rqo build
				self.rqo = await self.build_rqo_show(self.request_config_object, 'get_data')
		}//end if (autoload===true)

		self.label = self.context.label


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
area.prototype.render = async function(options={}) {

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
	// area.prototype.init_json_editor = async function(widget_object) {

	// 	const self = this

	// 	const editor_id			= widget_object.editor_id
	// 	const trigger			= widget_object.trigger
	// 	const body_response		= widget_object.body_response
	// 	const print_response	= widget_object.print_response

	// 	const get_input_value = function(input_id) {
	// 		return document.getElementById(input_id).value
	// 	}

	// 	return new Promise(function(resolve){

	// 	// load dependencies js/css
	// 		load_json_editor_files()
	// 		.then(()=>{

	// 			const editor_text_area = document.getElementById(editor_id)
	// 				  // Hide real data container
	// 				  editor_text_area.style.display = "none"

	// 			const result_div = document.getElementById("convert_search_object_to_sql_query_response")

	// 			// create the editor
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
	// 						const body_options = JSON.parse(editor_text)
	// 						if (body_options) {
	// 							window.localStorage.setItem('json_editor_sqo', editor_text);
	// 						}

	// 					const dd_api = trigger.dd_api.indexOf("get_input_value:")!==-1
	// 						? get_input_value( trigger.dd_api.replace('get_input_value:', '') )
	// 						: trigger.dd_api

	// 					const action = trigger.action.indexOf("get_input_value:")!==-1
	// 						? get_input_value( trigger.action.replace('get_input_value:', '') )
	// 						: trigger.action

	// 					// data_manager
	// 					const api_response = await data_manager.request({
	// 						body : {
	// 							dd_api	: dd_api,
	// 							action	: action,
	// 							options	: editor_text
	// 						}
	// 					})

	// 					print_response(body_response, api_response)

	// 					return api_response
	// 				}
	// 			}

	// 			// const editor_value	= null; //'{"id":"temp","filter":[{"$and":[{"$or":[{"q":"{\"section_id\":\"4\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]},{"q":"{\"section_id\":\"2\",\"section_tipo\":\"numisdata300\",\"component_tipo\":\"numisdata309\"}","lang":"all","path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"}]}]},{"q":"1932","lang":"all","path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]}]}],"select":[{"path":[{"name":"Catálogo","modelo":"component_select","section_tipo":"numisdata3","component_tipo":"numisdata309"},{"name":"Catálogo","modelo":"component_input_text","section_tipo":"numisdata300","component_tipo":"numisdata303"}]},{"path":[{"name":"Número Catálogo","modelo":"component_input_text","section_tipo":"numisdata3","component_tipo":"numisdata27"}]},{"path":[{"name":"Ceca","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata30"},{"name":"Ceca","modelo":"component_input_text","section_tipo":"numisdata6","component_tipo":"numisdata16"}]},{"path":[{"name":"Autoridad","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata29"},{"name":"Apellidos","modelo":"component_input_text","section_tipo":"numisdata22","component_tipo":"rsc86"}]},{"path":[{"name":"Denominación","modelo":"component_autocomplete","section_tipo":"numisdata3","component_tipo":"numisdata34"},{"name":"Denominación","modelo":"component_input_text","section_tipo":"numisdata33","component_tipo":"numisdata97"}]}],"limit":50,"offset":0}'
	// 			// localStorage.removeItem('json_editor_api');
	// 			const sample_data	= null
	// 			const saved_value	= localStorage.getItem('json_editor_sqo')
	// 			const editor_value	= JSON.parse(saved_value) || sample_data

	// 			// editor instance
	// 			const editor = new JSONEditor(container, options, editor_value)

	// 			resolve(editor)
	// 		})
	// 	})
	// }//end init_json_editor