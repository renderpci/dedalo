/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_json} from '../../component_json/js/render_edit_component_json.js'
	import {render_list_component_json} from '../../component_json/js/render_list_component_json.js'
	import {render_mini_component_json} from '../../component_json/js/render_mini_component_json.js'
	import {render_search_component_json} from '../../component_json/js/render_search_component_json.js'



export const component_json = function(){

	this.id				= null

	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null
	this.section_lang	= null

	this.context		= null
	this.data			= null

	this.parent			= null
	this.node			= null

	this.tools			= null

	this.editors		= []

	return true
};//end component_json



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_json.prototype.init				= component_common.prototype.init
	component_json.prototype.build				= component_common.prototype.build
	component_json.prototype.render				= common.prototype.render
	component_json.prototype.refresh			= common.prototype.refresh
	component_json.prototype.destroy			= common.prototype.destroy

	// change data
	component_json.prototype.save				= component_common.prototype.save
	component_json.prototype.update_data_value	= component_common.prototype.update_data_value
	component_json.prototype.update_datum		= component_common.prototype.update_datum
	component_json.prototype.change_value		= component_common.prototype.change_value
	component_json.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_json.prototype.mini				= render_mini_component_json.prototype.mini
	component_json.prototype.list				= render_list_component_json.prototype.list
	component_json.prototype.tm					= render_list_component_json.prototype.list
	component_json.prototype.edit				= render_edit_component_json.prototype.edit
	component_json.prototype.edit_in_list		= render_edit_component_json.prototype.edit
	component_json.prototype.search				= render_search_component_json.prototype.search
	component_json.prototype.change_mode		= component_common.prototype.change_mode



/**
* LOAD_EDITOR_FILES
* @return promise
*/
component_json.prototype.load_editor_files = function() {

	const self = this

	// load dependences js/css
		const load_promises = []

		// css file load
			const lib_css_file = DEDALO_ROOT_WEB + '/lib/jsoneditor/dist/jsoneditor.min.css'
			load_promises.push( common.prototype.load_style(lib_css_file) )

		// js module import
			const load_promise = import('../../../lib/jsoneditor/dist/jsoneditor.min.js') // used minified version for now
			load_promises.push( load_promise )
			//self.JSONEditor = JSONEditor

	const js_promise = Promise.all(load_promises)


	return js_promise
};//end load_editor_files



/**
* SET_VALUE
* @return promise
*/
component_json.prototype.set_value = async function(value) {

	const self = this

	await self.editors[0].set(value)

	return true
};//end set_value



/**
* LOAD_CONTEXT
*/
	// component_json.prototype.load_context = function() {

	// 	const self = this

	// 	if (self.context) {

	// 		return new Promise(function(resolve) {
	// 		  resolve(self.context)
	// 		});
	// 	}

	// 	const options = {
	// 		model 			: 'section_record',
	// 		tipo 			: self.section_tipo,
	// 		section_tipo 	: self.section_tipo,
	// 		section_id		: self.section_id,
	// 		mode			: self.mode,
	// 		lang			: self.section_lang
	// 	}

	// 	const tipo = self.tipo

	// 	// section instance
	// 		const js_promise = instances.get_instance(options).then(function(current_section_record){

	// 			const context = current_section_record.get_component_context(tipo);

	// 			//event_manager.publish('stateChange')

	// 			// set
	// 				self.context = context
	// 		})

	// 	//event_manager.subscribe('stateChange', () => self.render())

	// 	return js_promise
	// };//end load_context



/**
* LOAD_DATA
*/
	// component_json.prototype.load_data = function(){

	// 	const self = this

	// 	const options = {
	// 		model 			: 'section_record',
	// 		tipo 			: self.section_tipo,
	// 		section_tipo 	: self.section_tipo,
	// 		section_id		: self.section_id,
	// 		mode			: self.mode,
	// 		lang			: self.section_lang
	// 	}

	// 	const tipo = self.tipo

	// 	// section instance
	// 		const js_promise = instances.get_instance(options).then(function(current_section){

	// 			self.data =	current_section.get_component_data(tipo);

	// 			return self.data
	// 		})

	// 	return js_promise
	// };//end load_data



/**
* RENDER
* @return promise
*/
	// component_json.prototype.render = function(){

	// 	const self = this

	// 	const context = self.context
	// 	return self.load_data().then(function(){

	// 		return new Promise(function(resolve){

	// 			// render
	// 				const current_render = new render_component_json(self)

	// 				let node = ""
	// 				const mode = self.mode
	// 				switch (mode){
	// 					case 'list':
	// 						node = current_render.list()
	// 					break

	// 					case 'edit':
	// 					default :
	// 						node = current_render.edit()
	// 				}

	// 			// set node
	// 				self.node = node

	// 			// return self
	// 				//setTimeout(function(){
	// 					resolve(self)
	// 				//},1000)
	// 		})
	// 	})
	// };//end render


