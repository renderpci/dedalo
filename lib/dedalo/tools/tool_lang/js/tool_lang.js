// import
	//import {config} from '../info.js'
	//import * as config from '../info.json'
	import {common} from '../../../common/js/common.js'
	//import {event_manager} from '../../../common/js/event_manager.js'
	//import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {render_tool_lang} from './render_tool_lang.js'



/**
* TOOL_LANG
* Tool to translate contents from one language to other in any text component.
*
*
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
	tool_lang.prototype.edit_in_list= render_tool_lang.prototype.edit
	tool_lang.prototype.destroy 	= common.prototype.destroy



/**
* INIT
*/
tool_lang.prototype.init = async function(options) {

	const self = this

	// set status
		self.status = 'init'

	const model = 'tool_lang'

	// set vars
		self.mode 			= options.mode
		self.caller 		= options.caller
		self.node			= []
		self.type			= 'tool'
		self.model			= model
		self.ar_instances	= []
		self.events_tokens 	= []

		self.langs 			= page_globals.dedalo_projects_default_langs
		self.source_lang 	= self.caller.lang
		self.target_lang 	= null

	// load config info json file
		const response = await fetch(DEDALO_LIB_BASE_URL + "/tools/" + model +'/info.json');
		const config   = await response.json();

	// cofig vars
		self.translator_engine 	= JSON.parse(config.components.dd1335.dato['lg-nolan']).translator_engine
		self.label 				= config.components.dd799.dato[self.caller.lang][0] || model
		self.description 		= config.components.dd612.dato[self.caller.lang]

	// load self style
		const url = DEDALO_LIB_BASE_URL + "/tools/" + self.model + "/css/" + model + ".css"
		await common.prototype.load_style(url)


	return true
}//end init



/**
* BUILD
*/
tool_lang.prototype.build = async function() {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'loading'

	// load data if is not already received as option
		if (autoload===true) {

			// sqo_context
				// create the sqo_context
				self.sqo_context = {show: []}
				// create the own show ddo element
				const source = create_source(self, 'get_data')
				self.sqo_context.show.push(source)

			// load data
				const current_data_manager 	= new data_manager()
				const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)

			// debug
				if(SHOW_DEBUG===true) {
					console.log("[component_common.build] api_response:",api_response);
				}

			// Update the self.data into the datum and self instance
				self.update_datum(api_response)
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to build",self.model, ":", performance.now()-t0);
		}

	// status update
		self.status = 'builded'


	return true
}//end build



/**
* LOAD_COMPONENT
*/
tool_lang.prototype.load_component = async function(lang) {

	const self = this

	const component = self.caller

	const context = JSON.parse(JSON.stringify(component.context))
		  context.lang = lang

	const component_instance = await get_instance({
		model 			: component.model,
		tipo 			: component.tipo,
		section_tipo 	: component.section_tipo,
		section_id 		: component.section_id,
		mode 			: component.mode,
		lang 			: lang,
		section_lang 	: component.lang,
		//parent 			: component.parent,
		type 			: component.type,
		context 		: context,
		data 			: {value:[]},
		datum 			: component.datum,
		//sqo_context 	: component.sqo_context
	})

	await component_instance.build(true)

	// add
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (component_instance!==self.caller && typeof instance_found==="undefined") {
			self.ar_instances.push(component_instance)
		}


	return component_instance
}//end load_component


