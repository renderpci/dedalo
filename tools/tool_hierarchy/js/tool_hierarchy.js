// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
// you can import and use your own modules or any dedalo module of section, components or other tools.
// by default you will need the tool_common to init, build and render.
// use tool_common is not mandatory, but it can help to do typical task as open tool window, or load the section and components defined in ontology.
// import dd_console if you want to use dd_console with specific console.log messages
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
// import data_manager if you want to access to Dédalo API
	import {data_manager} from '../../../core/common/js/data_manager.js'
// import get_instance to create and init sections or components.
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
// import common to use destroy, render, refresh and other useful methods
	import {common, create_source} from '../../../core/common/js/common.js'
// tool_common, basic methods used by all the tools
	import {tool_common} from '../../tool_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_hierarchy} from './render_tool_hierarchy.js' // self tool rendered (called from render common)



/**
* TOOL_HIERARCHY
* Tool to make interesting things, but nothing in particular
*/
export const tool_hierarchy = function () {

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
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_hierarchy.prototype.render		= tool_common.prototype.render
	tool_hierarchy.prototype.destroy	= common.prototype.destroy
	tool_hierarchy.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_hierarchy.prototype.edit		= render_tool_hierarchy.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_hierarchy.prototype.init = async function(options) {

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
tool_hierarchy.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
	// it will load the components or sections defined in ontology ddo_map.
	// it's possible to set your own load_ddo_map adding to something as:
	// tool_common.prototype.build.call(this, autoload, {load_ddo_map : function({
	// 	your own code here to load components
	// })}
	// it will assign or create the context of the tool calling to get_element_context
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {
		// when the tool_common load the component you could assign to the tool instance with specific actions.
		// Like fix main_element for convenience
		// main_element could be any component that you need to use inside the tool.
		// use the 'role' property in ddo_map to define and locate the ddo
			// const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			// self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GENERATE_VIRTUAL_SECTION
* Call the API to generate a new Ontology
* @return promise response
*/
tool_hierarchy.prototype.generate_virtual_section = async function(options) {

	const self = this

	const force_to_create = options.force_to_create || false

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'generate_virtual_section')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_id		: self.caller.section_id,
				section_tipo	: self.caller.section_tipo,
				force_to_create : force_to_create
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> generate_virtual_section API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end generate_virtual_section



// @license-end
