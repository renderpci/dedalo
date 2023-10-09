// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_DEV_TEMPLATE
 *
 * This sample tool is only to use as base or reference for create new tools
 * To see more complete information about how to create tools see the http://dedalo.dev documentation about tools
 */



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
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_dev_template} from './render_tool_dev_template.js' // self tool rendered (called from render common)



/**
* TOOL_DEV_TEMPLATE
* Tool to make interesting things, but nothing in particular
*/
export const tool_dev_template = function () {

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
	// render : using common render entry point, use the tool_common render to prepare the tool to be rendered, it will call to specific render defined in render_tool_dev_template
	tool_dev_template.prototype.render		= tool_common.prototype.render
	// destroy: using common destroy method
	tool_dev_template.prototype.destroy		= common.prototype.destroy
	// refresh: using common refresh method
	tool_dev_template.prototype.refresh		= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_dev_template.prototype.edit		= render_tool_dev_template.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_dev_template.prototype.init = async function(options) {

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

	try {

		// ! enclose custom tool code inside try catch to allow Dédalo to recover from exceptions or non login scenarios

		// set the self specific vars not defined by the generic init (in tool_common)
			self.lang	= options.lang // you can call to 'page_globals.dedalo_data_lang' if you want to use the actual configuration of Dédalo
			self.langs	= page_globals.dedalo_projects_default_langs
			self.etc	= options.etc // you own vars

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload
* @return bool common_build
*/
tool_dev_template.prototype.build = async function(autoload=false) {

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

		// ! enclose custom tool code inside try catch to allow Dédalo to recover from exceptions or non login scenarios

		// when the tool_common load the component you could assign to the tool instance with specific actions.
		// Like fix main_element for convenience
		// main_element could be any component that you need to use inside the tool.
		// use the 'role' property in ddo_map to define and locate the ddo
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_COMPONENT_SAMPLE
* Sample method to be used to load components calling to API directly
* this method is not called by this tool, but it could show the way to load_components by you own.
* The first case, if you don't have the component loaded and you don't have the context
* The second one, using the context of the main_element when it wad loaded previously manually or by tool_common in the build process
*/
tool_dev_template.prototype.load_component_sample = async function(options) {

	const self = this

	const ddo	= options.ddo
	const lang	= options.langs

	// first load the context of the component
		// rqo. Create the basic rqo to load
			const rqo = {
				action	: 'get_element_context',
				// tool source for component JSON that stores full tool config
				source : {
					model			: ddo.model,
					section_tipo	: ddo.section_tipo,
					section_id		: ddo.section_id, // it could be null or any section_id
					mode			: ddo.mode, // edit || list
					lang			: ddo.lang
				},
				prevent_lock : true
			}

		// load data. Load section data from db of the current tool.
		// Tool data configuration is inside the tool_registered section 'dd1324' and parsed into component_json 'dd1353',
		// The tool info was generated when it was imported / registered by admin
			const api_response = await data_manager.request({
				body : rqo
			})
			self.main_element.context = api_response.result.context

	// second when you have the context you could load full component with full datum (context and data)
		// use the main_elemetn context (clone and edit) and change the properties
		// it's possible use other needs doing this function generic
			const load_options = Object.assign(clone(self.main_element.context),{
				self 		: self, // added tool instance, it will be used to assign the instance built to ar_instaces of the current tool
				lang		: lang,
				mode		: 'edit',
				section_id	: self.main_element.section_id
			})

		// call generic tool common load_component
			const component_instance = await load_component(load_options);

	// optional: It's possible to create the instance by your own instead use the tool_common.load_component()
	// in this way
			const instance_options = {
				model			: main_element.model,
				mode			: main_element.mode,
				tipo			: main_element.tipo,
				section_tipo	: main_element.section_tipo,
				section_id		: main_element.section_id,
				lang			: main_element.lang,
				section_lang	: main_element.section_lang,
				type			: main_element.type,
				id_variant		: 'tool_dev_template_'+main_element.model, // id_variant prevents id conflicts
			}
		// get instance and init
			const own_component_instance = await get_instance(instance_options)

	// at this point component_instance and own_component_instance should be the same, the component initialized and ready to be build and render
	// in this example we use only one of this: component_instance
	return component_instance
}//end load_component_sample



// @license-end
