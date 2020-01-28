// import
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
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type

	this.caller

	this.section_tm


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_time_machine.prototype.render 		= common.prototype.render
	tool_time_machine.prototype.destroy 	= common.prototype.destroy
	tool_time_machine.prototype.edit 		= render_tool_time_machine.prototype.edit



/**
* INIT
*/
tool_time_machine.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url 	= DEDALO_CORE_URL + "/tools/tool_time_machine/trigger.tool_time_machine.php"

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
		const common_build = tool_common.prototype.build.call(this, autoload);


	// specific actions..
		// const base_context 			= get_base_context(self)
		// const current_data_manager 	= new data_manager()
		// const api_response 			= await current_data_manager.section_load_data(base_context)


		// console.log("**************************** get_element_context api_response:",api_response);
		// console.log("++++++++++++++++++++++++++++ get_element_context api_response.data:",api_response.result.data);

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

	// source
		const source = {
			typo 			: "source",
			action 			: "search",
			model 			: "section_tm",
			tipo 			: "test65",
			section_tipo 	: "test65",
			section_id 		: null,
			mode 			: mode,
			lang 			: "lg-eng",
			pagination 		: {
			  total  : {},
			  offset : 0
			}
		}

	const base_context = [sqo, component, source]

	return base_context
}//end get_base_context



/**
* LOAD_SECTION
*/
tool_time_machine.prototype.load_section = async function() {

	const self = this

	const base_context 			= get_base_context(self)
	const current_data_manager 	= new data_manager()
	const api_response 			= await current_data_manager.section_load_data(base_context)

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
		datum 			: api_response.result,
		sqo_context 	: {
			show : [
				base_context.find(element => element.typo==='sqo')
			]
		}
	})
		console.log("section_instance:",section_instance);

	await section_instance.build(false)

	// // set current tool as component caller (to check if component is inside tool or not)
	// 	component_instance.caller = this

	// // add
	// 	const instance_found = self.ar_instances.find( el => el===component_instance )
	// 	if (component_instance!==self.caller && typeof instance_found==="undefined") {
	// 		self.ar_instances.push(component_instance)
	// 	}


	return section_instance
}//end load_section




