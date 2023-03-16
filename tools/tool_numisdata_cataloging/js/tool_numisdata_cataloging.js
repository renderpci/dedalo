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

	this.section_to_cataloging		= null // main section to be cataloging
	this.area_thesaurus 			= null

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

	try {

		// load section to cataloging
		// do not use the tool_common because the section to be load could be the caller and it's avoided in tool_common
			const section_to_cataloging	= self.tool_config.ddo_map.find(el => el.role==='section_to_cataloging')
			await self.load_section( section_to_cataloging )
			await self.section_to_cataloging.build(true)


		// area_thesaurus. fix area_thesaurus for convenience
			const area_thesaurus_ddo	= self.tool_config.ddo_map.find(el => el.role==='area_thesaurus')
			self.area_thesaurus			= self.ar_instances.find(el => el.tipo===area_thesaurus_ddo.tipo)
			// set instance in thesaurus mode 'relation'
			// self.area_thesaurus.context.thesaurus_mode	= 'relation'
			self.area_thesaurus.caller					= self
			self.area_thesaurus.linker					= self.indexing_component


	} catch (error) {
		self.error = error
		console.error(error)
	}

	return common_build
}//end build_custom



/**
* ASSIGN_ELEMENT
* Set the original and copy properties to discard component
* @param locator object
* @param ar_copies array of nodes
* @return change object api_response
*/
tool_numisdata_cataloging.prototype.load_section = async function(section_to_cataloging){

	const self = this

	const request_config = section_to_cataloging.properties.source.request_config

	const section_options = {
		model			: 'section',
		mode			: section_to_cataloging.mode || 'list',
		tipo			: section_to_cataloging.tipo || self.caller.tipo,
		section_tipo	: section_to_cataloging.section_tipo || self.caller.section_tipo,
		section_id		: section_to_cataloging.section_id || null,
		lang			: section_to_cataloging.lang || self.caller.lang,
		section_lang	: section_to_cataloging.section_lang || self.caller.section_lang,
		type			: 'section'
	}
	self.section_to_cataloging = await get_instance(section_options)

	self.section_to_cataloging.properties	= section_to_cataloging.properties
	// self.section_to_cataloging.buttons		= false


	self.ar_instances.push(self.section_to_cataloging)

	return true
}//end assign_element

