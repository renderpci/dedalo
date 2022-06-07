/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_dummy} from './render_tool_dummy.js' // self tool rendered (called from render common)



/**
* TOOL_DUMMY
* Tool to make interesting things
*/
export const tool_dummy = function () {

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


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_dummy.prototype.render		= tool_common.prototype.render
	// destroy: using common destroy method
	tool_dummy.prototype.destroy	= common.prototype.destroy
	// refresh: using common refresh method
	tool_dummy.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_dummy.prototype.edit		= render_tool_dummy.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_dummy.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang	= options.lang // page_globals.dedalo_data_lang
		self.langs	= page_globals.dedalo_projects_default_langs
		self.etc	= options.etc


	return common_init
};//end init



/**
* BUILD
* Custom tool build
*/
tool_dummy.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
};//end build_custom



/**
* LOAD_COMPONENT_SAMPLE
*/
tool_dummy.prototype.load_component_sample = async function(lang) {

	const self = this

	// context (clone and edit)
		const context = Object.assign(clone(self.main_element.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_element.section_id
		})

	// options
		const options = {
			context : context
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);


	return component_instance
};//end load_component_sample
