// import
	import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {tool_common} from '../../../tool_common/js/tool_common.js'
	import {render_tool_time_machine, add_component} from './render_tool_time_machine.js'



/**
* TOOL_TIME_MACHINE
* Tool to translate contents from one language to other in any text component
*/
export const tool_time_machine = function () {

	this.id
	this.model
	this.mode
	this.lang
	this.node
	this.ar_instances
	this.status
	this.events_tokens = []
	this.type

	this.caller
	this.section_tm
	this.button_apply
	this.selected_matrix_id

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_time_machine.prototype.refresh 	= common.prototype.refresh
	tool_time_machine.prototype.render 		= common.prototype.render
	tool_time_machine.prototype.destroy 	= common.prototype.destroy
	tool_time_machine.prototype.edit 		= render_tool_time_machine.prototype.edit



/**
* INIT
*/
tool_time_machine.prototype.init = async function(options) {

	const self = this

	// dedalo_projects_langs
		self.langs = page_globals.dedalo_projects_default_langs

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_CORE_URL + "/tools/tool_time_machine/trigger.tool_time_machine.php"

	// events subscribe
		self.events_tokens.push(
			// user click over list record
			event_manager.subscribe('tm_edit_record', async (e)=>{
				// render. Create and add new component to preview container
				add_component(self, self.preview_component_container, self.lang, e.date, 'tm', e.matrix_id)
				// show Appy button
				self.button_apply.classList.remove('hide')
				// fix selected matrix_id
				self.selected_matrix_id = e.matrix_id
			})
		)

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD_CUSTOM
*/
tool_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(self, autoload);

	// specific actions..
		// const base_context 			= get_base_context(self)
		// const current_data_manager 	= new data_manager()
		// const api_response 			= await current_data_manager.section_load_data(base_context)

	// section_tm context
		// const base_context 			= get_base_context(self)
		// const current_data_manager 	= new data_manager()
		// const api_response 			= await current_data_manager.section_load_data(base_context)
		// self.section_tm_context 	= api_response.result.context
		// 	console.log("+++++ api_response.result:",api_response.result);

	// section_tm. get section full context
		const current_data_manager 	= new data_manager()
		const source = {
			typo 		 : 'source',
			tipo 		 : self.caller.tipo,
			section_tipo : self.caller.section_tipo,
			section_id 	 : self.caller.section_id,
			model 		 : 'section_tm',
			lang 		 : self.caller.lang,
			pagination 	 : {
				total  : {},
				offset : 0
			}
		}
		const element_context = await current_data_manager.get_element_context(source)
		self.section_tm_context = element_context.result


	return common_build
}//end build_custom



/**
* GET_BASE_CONTEXT
* Create a base context for section_tm
*/
const get_base_context = (self) => {

	const mode = "tm"

	// sqo
		const sqo = {
			typo 	: "sqo",
			id 		: "tmp",
			mode 	: mode,
			section_tipo: [
				self.caller.section_tipo
			],
			filter_by_locators: [{
				section_tipo : self.caller.section_tipo,
				section_id 	 : self.caller.section_id,
				tipo 		 : self.caller.tipo,
				lang 		 : self.caller.lang
			}],
			full_count: true,
			limit: 10,
			offset: 0,
			order: [{
				direction : "DESC",
				path	  : [{
					component_tipo: "id"
				}]
			}]
		}

	// component
		const component = {
			typo 			: "ddo",
			type 			: "component",
			model 			: self.caller.model,
			tipo 			: self.caller.tipo,
			section_tipo 	: self.caller.section_tipo,
			mode 			: "list",
			parent 			: self.caller.section_tipo,
			label 			: self.caller.label
		}

	// section
		const section = {
			typo 			: "ddo",
			type 			: "section",
			model 			: "section_tm",
			tipo 			: self.caller.section_tipo,
			section_tipo 	: self.caller.section_tipo,
			mode 			: "tm",
			parent 			: null,
			label 			: null
		}

	// source
		const source = {
			typo 			: "source",
			action 			: "search",
			model 			: "section_tm",
			tipo 			: self.caller.section_tipo,
			section_tipo 	: self.caller.section_tipo,
			section_id 		: null,
			mode 			: mode,
			lang 			: self.caller.lang,
			pagination 		: {
			  total  : {},
			  offset : 0
			}
		}

	const base_context = [
		sqo,
		component,
		section,
		source
	]


	return base_context
}//end get_base_context



/**
* LOAD_SECTION
*/
tool_time_machine.prototype.load_section = async function() {

	const self = this

	// base_context. Creates a special time_machine section context to get correct data
	// and set to section instance
		// const base_context 			= get_base_context(self);
		// const current_data_manager 	= new data_manager()
		// const api_response 			= await current_data_manager.section_load_data(base_context)
		// if(SHOW_DEBUG===true) {
		// 	console.log("[tool_time_machine load_section] api_response:",api_response);
		// }

		// // context resolved (all ddo elements)
		// const full_context = api_response.result.context
		// 	console.log("full_context:",full_context);

		const full_context = self.section_tm_context

	// section instance
		const section_instance = await get_instance({
			model 			: "section",
			tipo 			: self.caller.section_tipo,
			section_tipo 	: self.caller.section_tipo,
			section_id 		: self.caller.section_id,
			mode 			: "list",
			lang 			: self.caller.lang,
			section_lang 	: self.caller.lang,
			type 			: "section",
			// context 		: api_response.result.context,
			// data 			: api_response.result.data,
			// datum 			: api_response.result,
			sqo_context 	: {
				// show : [ base_context.find(element => element.typo==='sqo') ]
				show : full_context
			}
		})

	// save instance (necessary to destroy later)
		self.ar_instances.push(section_instance)

	// build with autoload as false (avoid auto )
		await section_instance.build(true)

	if(SHOW_DEBUG===true) {
		console.log("[tool_time_machine.load_section] section_instance:", section_instance);
	}

	// // set current tool as component caller (to check if component is inside tool or not)
	// 	component_instance.caller = this

	// // add
	// 	const instance_found = self.ar_instances.find( el => el===component_instance )
	// 	if (component_instance!==self.caller && typeof instance_found==="undefined") {
	// 		self.ar_instances.push(component_instance)
	// 	}


	return section_instance
}//end load_section



/**
* LOAD_COMPONENT
* Loads component to place in respective containers: current and version preview
*/
tool_time_machine.prototype.load_component = async function(lang, mode='tm', matrix_id=null) {

	const self = this

	const component = self.caller
	const context   = JSON.parse(JSON.stringify(component.context))

	// context lang switch if var lang is received
		if (typeof lang!=="undefined") {
			context.lang = lang
		}

	// component instance
		const instance_options = {
			model 			: component.model,
			tipo 			: component.tipo,
			section_tipo 	: component.section_tipo,
			section_id 		: component.section_id,
			mode 			: mode, // component.mode==='edit_in_list' ? 'edit' : component.mode,
			lang 			: context.lang,
			section_lang 	: component.section_lang,
			//parent 		: component.parent,
			type 			: component.type,
			context 		: context,
			data 			: {value:[]},
			datum 			: component.datum
			//sqo_context 	: component.sqo_context
		}

		if (matrix_id) {
			instance_options.matrix_id = matrix_id
		}

	// get instance and build
		const component_instance = await get_instance(instance_options)
		await component_instance.build(true)

	// set current tool as component caller (to check if component is inside tool or not)
		component_instance.caller = self

	// add created component instance to current ar_instances
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (component_instance!==self.caller && typeof instance_found==="undefined") {
			self.ar_instances.push(component_instance)
		}


	return component_instance
}//end load_component




