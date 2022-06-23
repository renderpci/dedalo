/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_time_machine, add_component} from './render_tool_time_machine.js'
	import {render_time_machine_view} from './render_time_machine_view.js'
	// import {paginator} from '../../../core/paginator/js/paginator.js'



/**
* TOOL_TIME_MACHINE
* Tool to translate contents from one language to other in any text component
*/
export const tool_time_machine = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.lang				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= []
	this.type				= null

	this.caller				= null
	this.time_machine 		= null
	// this.section			= null// custom section generated in tm mode on build
	this.button_apply		= null
	this.selected_matrix_id	= null
	this.modal_container	= null



	return true
}//end tool_time_machine



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_time_machine.prototype.render	= tool_common.prototype.render
	tool_time_machine.prototype.refresh	= common.prototype.refresh
	tool_time_machine.prototype.destroy	= common.prototype.destroy
	tool_time_machine.prototype.edit	= render_tool_time_machine.prototype.edit



/**
* INIT
*/
tool_time_machine.prototype.init = async function(options) {

	const self = this



	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// fix dedalo_projects_langs
		self.langs = page_globals.dedalo_projects_default_langs

	// fix lang from caller
		self.lang = self.caller && self.caller.lang
			? self.caller.lang
			: null

	// events subscribe. User click over list record eye icon (preview)
		self.events_tokens.push(
			event_manager.subscribe('tm_edit_record', fn_tm_edit_record)
		)
		async function fn_tm_edit_record(e) {
			const matrix_id = e.matrix_id
			// render. Create and add new component to preview container
			const load_mode = 'tm' // (!) Remember use tm mode to force component to load data from time machine table
			add_component(self, self.preview_component_container, self.lang, e.date, load_mode, matrix_id)
			// fix selected matrix_id
			self.selected_matrix_id = matrix_id
			// show Apply button
			self.button_apply.classList.remove('hide','lock')
		}//end fn_tm_edit_record


	return common_init
}//end init



/**
* BUILD (CUSTOM)
* @param bool autoload
* 	callback function 'load_ddo_map'
* @return promise bool
*/
tool_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload);

	try {

		// fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

		// time_machine
		// Create, build and assign the time machine service to the instance
			self.time_machine = await get_instance({
				// model		: 'time_machine',
				model			: 'service_time_machine',
				section_tipo	: self.caller.section_tipo,
				section_id		: self.caller.section_id,
				tipo			: self.main_element.tipo,
				mode			: 'tm',
				lang			: page_globals.dedalo_data_nolan,
				main_element	: self.main_element,
				caller			: self,
				id_variant		: self.model,
				direct_path		: '../../services/service_time_machine/js/service_time_machine.js'
			})

		// assign the render view function
			self.time_machine.view = render_time_machine_view

		// build
			await self.time_machine.build(true)

		// add to self instances list
			self.ar_instances.push(self.time_machine)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_COMPONENT
* Loads component to place in respective containers: current preview and preview version
*/
tool_time_machine.prototype.load_component = async function(lang, mode, matrix_id=null) {
	// console.log("load_component:",lang, mode, matrix_id);

	const self = this

	// to_delete_instances. Select instances with same tipo and property matrix_id not empty
		const to_delete_instances = self.ar_instances.filter(el => el.tipo===self.main_element.tipo && el.matrix_id)

	// context (clone and edit)
		const context = Object.assign(clone(self.main_element.context),{
			lang		: lang,
			mode		: mode,
			section_id	: self.main_element.section_id,
			matrix_id	: matrix_id
		})

	// options
		const options = {
			context				: context,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);


	return component_instance
}//end load_component



/**
* APPLY_VALUE
* Set selected version value to active component and close the tool
* @param object options
* @return promise
*/
tool_time_machine.prototype.apply_value = function(options) {

	const self = this

	// options
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const tipo			= options.tipo
		const lang			= options.lang
		const matrix_id		= options.matrix_id

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'apply_value')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_id		: section_id,
			section_tipo	: section_tipo,
			tipo			: tipo,
			lang			: lang,
			matrix_id		: matrix_id
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> apply_value API response:",'DEBUG',response);

				// // reload source component on finish close
				// 	if (self.caller) {
				// 		self.caller.refresh()
				// 	}

				// // close tool modal (implies destroy current tool instance)
				// 	self.modal_container.close()

				resolve(response)
			})
		})
}//end apply_value
