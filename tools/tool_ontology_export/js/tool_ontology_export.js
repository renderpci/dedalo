// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
// you can import and use your own modules or any dedalo module of section, components or other tools.
// by default you will need the tool_common to init, build and render.
// use tool_common is not mandatory, but it can help to do typical task as open tool window, or load the section and components defined in ontology.
// import dd_console if you want to use dd_console with specific console.log messages
	import {dd_console} from '../../../core/common/js/utils/index.js'
// import data_manager if you want to access to Dédalo API
	import {data_manager} from '../../../core/common/js/data_manager.js'
// import common to use destroy, render, refresh and other useful methods
	import {common, create_source} from '../../../core/common/js/common.js'
// tool_common, basic methods used by all the tools
	import {tool_common} from '../../tool_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_ontology_export} from './render_tool_ontology_export.js' // self tool rendered (called from render common)



/**
* TOOL_ONTOLOGY_EXPORT
* Tool to make interesting things, but nothing in particular
*/
export const tool_ontology_export = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	// ontologies. List of available ontologies from main_ontology
	this.ontologies		= null
	// selected_ontologies. User selected ontologies (checkbox checked = true)
	this.selected_ontologies = []
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_ontology_export.prototype.render	= tool_common.prototype.render
	tool_ontology_export.prototype.destroy	= common.prototype.destroy
	tool_ontology_export.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_ontology_export.prototype.edit		= render_tool_ontology_export.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_ontology_export.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
	// it will assign common vars as:
		// model
		// section_tipo
		// section_id
		// lang
		// mode
		// etc
	// set the caller if it was defined or create it and set the tool_config or create new one if tool_config was not defined.
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool common_build
*/
tool_ontology_export.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
	// it will load the components or sections defined in ontology ddo_map.
	// it's possible to set your own load_ddo_map adding to something as:
	// tool_common.prototype.build.call(this, autoload, {load_ddo_map : function({
	// 	your own code here to load components
	// })}
	// it will assign or create the context of the tool calling to get_element_context
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// call API to get_ontologies and fix it
		const api_response	= await self.get_ontologies()
		self.ontologies		= api_response?.result

	// selected ontologies
		const saved_selected_ontologies = localStorage.getItem('selected_ontologies')
		self.selected_ontologies = saved_selected_ontologies ? JSON.parse(saved_selected_ontologies) : [];

	return common_build
}//end build_custom



/**
* GET_ONTOLOGIES
* Call the API to process the get the list of available ontologies from main_ontology
* @return promise response
*/
tool_ontology_export.prototype.get_ontologies = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_ontologies')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_ontologies API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end get_ontologies



/**
* EXPORT_ONTOLOGIES
* Call the API to export the user selected ontologies
* @return object|false response
*/
tool_ontology_export.prototype.export_ontologies = async function () {

	const self = this

	// check self.selected_ontologies
		if (self.selected_ontologies.length===0) {
			console.error('Ignored empty selected ontologies:', self.selected_ontologies);
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'export_ontologies')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				selected_ontologies : self.selected_ontologies
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})

		// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> export_ontologies API api_response:",'DEBUG', api_response);
		}


	return api_response
}//end export_ontologies



// @license-end
