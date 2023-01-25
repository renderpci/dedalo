/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_numisdata_cataloging} from './render_tool_numisdata_cataloging.js'



/**
* tool_numisdata_cataloging
* Tool to translate contents from one language to other in any text component
*/
export const tool_numisdata_cataloging = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null
	this.media_component			= null // component av that will be transcribed (it could be the caller)
	this.epigraphy	= null // component text area where we are working into the tool
	this.relation_list				= null // datum of relation_list (to obtaim list of top_section_tipo/id)

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_numisdata_cataloging.prototype.render	= tool_common.prototype.render
	tool_numisdata_cataloging.prototype.destroy	= common.prototype.destroy
	tool_numisdata_cataloging.prototype.refresh	= common.prototype.refresh
	tool_numisdata_cataloging.prototype.edit	= render_tool_numisdata_cataloging.prototype.edit



/**
* INIT
*/
tool_numisdata_cataloging.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// set the self specific vars not defined by the generic init (in tool_common)
			self.langs			= page_globals.dedalo_projects_default_langs
			self.source_lang	= self.caller && self.caller.lang
				? self.caller.lang
				: null
			self.target_lang	= null

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
*/
tool_numisdata_cataloging.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

		await self.load_section()

		await self.main_element.build(true)

	return common_build
}//end build_custom



/**
* ASSIGN_ELEMENT
* Set the original and copy properties to discard component
* @param locator object
* @param ar_copies array of nodes
* @return change object api_response
*/
tool_numisdata_cataloging.prototype.load_section = async function(options){

	const self = this

	const request_config = self.context.properties.source.request_config

	const section_options = {
		model			: 'section',
		mode			: 'list',
		tipo			: self.caller.tipo,
		section_tipo	: self.caller.section_tipo,
		section_id		: null,
		lang			: self.caller.lang,
		section_lang	: self.caller.section_lang,
		type			: 'section'
	}
	self.main_element = await get_instance(section_options)

	self.main_element.properties	= self.context.properties
	self.main_element.buttons		= false

	return true
}//end assign_element

