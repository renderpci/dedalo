/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_tr_print} from './render_tool_tr_print.js'

/**
* TOOL_transcription
* Tool to translate contents from one language to other in any text component
*/
export const tool_tr_print = function () {

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
	this.transcription_component	= null // component text area where we are working into the tool
	// this.relation_list				= null // datum of relation_list (to obtaim list of top_section_tipo/id)

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_tr_print.prototype.render	= tool_common.prototype.render
	tool_tr_print.prototype.destroy	= common.prototype.destroy
	tool_tr_print.prototype.refresh	= common.prototype.refresh
	tool_tr_print.prototype.edit	= render_tool_tr_print.prototype.edit



/**
* INIT
*/
tool_tr_print.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller && self.caller.lang
			? self.caller.lang
			: null
		self.target_lang	= null


	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_tr_print.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// transcription_component. fix transcription_component for convenience
			const transcription_component_tipo	= self.caller.tipo
			self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
};//end build_custom



/**
* GET_COMPONENT
* Load transcriptions component (text area) configured with the given lang
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object instance
*/
tool_tr_print.prototype.get_component = async function(lang) {

	const self = this


	// to_delete_instances. Select current self.transcription_component
		const to_delete_instances = self.ar_instances.filter(el => el===self.transcription_component)


	// context (clone and edit)
		const context = Object.assign(clone(self.transcription_component.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.transcription_component.section_id
		})

	// options
		const options = {
			context				: context, // reference context ...
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = await tool_common.prototype.load_component.call(self, options);

	// fix instance (overwrite)
		self.transcription_component = component_instance


	return component_instance
};//end get_component


/**
* BUILD_SUBTITLES
*/
tool_tr_print.prototype.build_subtitles = async function() {

	const component_text_area = self.transcription_component || await self.get_component(self.lang)

	// get instance and init
		self.service_subtitles = await get_instance({
			model				: 'service_subtitles',
			mode				: 'edit',
			caller				: self,
			component_text_area : component_text_area
		})

	self.ar_instances.push(self.service_subtitles)

	self.service_subtitles.build()
		.then(function(){

		})

}// end build_subtitles
