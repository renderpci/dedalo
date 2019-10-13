// import
	import {common} from '../../../common/js/common.js'
	import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {render_tool_lang} from './render_tool_lang.js'

	import {config} from '../info.js'



/**
* TOOL_LANG
*/
export const tool_lang = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type

	this.source_lang
	this.target_lang
	this.langs
	this.caller


	return true
}//end page


/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
tool_lang.prototype.render 		= common.prototype.render
tool_lang.prototype.edit 		= render_tool_lang.prototype.edit



/**
* INIT
*/
tool_lang.prototype.init = async function(options) {

	const self = this

	self.mode 			= options.mode
	self.caller 		= options.caller
	self.node			= []
	self.type			= 'tool'
	self.ar_instances	= []

	self.langs 			= page_globals.dedalo_projects_default_langs
	self.source_lang 	= self.caller.lang
	self.target_lang 	= null
	self.translatior_engine = config.translatior_engine

	const application_lang 	= page_globals.dedalo_application_lang

	self.label 	= config.ontology.find(item => item.type ==='main').term[application_lang]

		console.log("self.label:",self.label);

}//end init



tool_lang.prototype.build = async function() {

		console.log("build:");

}


/**
* LOAD_COMPONENT
*/
tool_lang.prototype.load_component = async function(lang) {

	const self = this

	const component = self.caller

	const current_instance = await get_instance({
					model 			: component.model,
					tipo 			: component.tipo,
					section_tipo 	: component.section_tipo,
					section_id 		: component.section_id,
					mode 			: component.mode,
					lang 			: lang,
					section_lang 	: component.lang,
					//parent 			: component.parent,
					type 			: component.type,
					context 		: component.context,
					data 			: {value:[]},
					datum 			: component.datum,
					//sqo_context 	: component.sqo_context
				})

			// add
				self.ar_instances.push(current_instance)

	current_instance.build(true)

	return current_instance

}//end load_component










