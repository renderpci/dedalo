/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_files} from './render_tool_import_files.js'
	import {upload_manager_init} from './upload_manager.js'



/**
* tool_import_files
* Tool to translate contents from one language to other in any text component
*/
export const tool_import_files = function () {
	
	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_files.prototype.render 		= common.prototype.render
	tool_import_files.prototype.destroy 	= common.prototype.destroy
	tool_import_files.prototype.edit 		= render_tool_import_files.prototype.edit



/**
* INIT
*/
tool_import_files.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang = options.lang // page_globals.dedalo_data_lang


	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	console.log("self-----:",self);
	// upload_manager_init
		const key_dir = self.caller.tipo + '_' + self.caller.section_tipo
		upload_manager_init({key_dir : key_dir})


	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_import_files.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// // main_component. fix main_component for convenience
	// 	const main_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_component")
	// 	self.main_component			= self.ar_instances.find(el => el.tipo===main_component_ddo.tipo)
	// 	dd_console(`main_component_ddo`, 'DEBUG', main_component_ddo, self.main_component)


	// specific actions..


	return common_build
};//end build_custom




