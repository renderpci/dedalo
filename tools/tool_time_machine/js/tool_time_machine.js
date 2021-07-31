/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source, get_ar_inverted_paths} from '../../../core/common/js/common.js'
	import {tool_common, trigger_request} from '../../tool_common/js/tool_common.js'
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
	// this.section_tm
	this.section // custom section generated in tm mode on build
	this.button_apply
	this.selected_matrix_id
	this.trigger_url
	this.modal_container

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_time_machine.prototype.refresh	= common.prototype.refresh
	tool_time_machine.prototype.render	= common.prototype.render
	tool_time_machine.prototype.destroy	= common.prototype.destroy
	tool_time_machine.prototype.edit	= render_tool_time_machine.prototype.edit



/**
* INIT
*/
tool_time_machine.prototype.init = async function(options) {
	
	const self = this

	// fix dedalo_projects_langs
		self.langs = page_globals.dedalo_projects_default_langs

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_TOOLS_URL + "/tool_time_machine/trigger.tool_time_machine.php"

	// events subscribe. User click over list record eye icon
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
			// show Appy button
			self.button_apply.classList.remove('hide')
		}//end fn_tm_edit_record

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
};//end init



/**
* BUILD (CUSTOM)
*/
tool_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	self.section = self.load_section() // don't wait here

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(self, autoload);


	return common_build
};//end build_custom



/**
* LOAD_SECTION
* Build a new section custom request config based on current component requirements
* Note that columns 'matrix id', 'modification date' and 'modification user id' are used only for context, not for data
* Data for this elements is calculated always from section in tm mode using a custom method: 'get_tm_ar_subdata'
*/
tool_time_machine.prototype.load_section = async function() {

	const self = this	

	// caller component
		const component = self.caller
	
	// short vars
		const component_tipo	= component.tipo
		const section_tipo		= component.section_tipo
		const section_id		= component.section_id
		const lang				= component.lang
		const model				= component.model
		const label				= component.label

	// ddo_map
		const ddo_map = [
			//  matrix id
			{
				tipo			: 'dd784', // fake tipo from projects, only used to allow get tm column id data,
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_section_id',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Matrix id',
				mode			: 'list'
			},
			// modification date DEDALO_SECTION_INFO_MODIFIED_DATE dd201
			{
				tipo			: 'dd201',
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_date',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Modification date',
				mode			: 'list'
			},
			// modification user id DEDALO_SECTION_INFO_MODIFIED_BY_USER dd197
			{
				tipo			: 'dd197',
				type			: 'component',
				typo			: 'ddo',
				model			: 'component_select',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				label			: 'Modification user',
				mode			: 'list'
			},
			// component itself. Remember add component show y exists (portals) to ddo_map
			{
				tipo			: component_tipo,
				type			: 'component',
				typo			: 'ddo',
				section_tipo	: section_tipo,
				model			: model,
				parent			: section_tipo,
				label			: label,
				mode			: 'list'
			}
		]
		// component show . From rqo_config_show
			const component_show = component.rqo_config && component.rqo_config.show && component.rqo_config.show.ddo_map
				? JSON.parse( JSON.stringify(component.rqo_config.show.ddo_map) )
				: null
			if (component_show) {
				for (let i = 0; i < component_show.length; i++) {
					const item = component_show[i]
						  item.mode = 'list'
					ddo_map.push(item)
				}
			}

	// sqo
		const sqo = {
			id					: 'tmp',
			mode				: 'tm',
			section_tipo		: [{tipo:section_tipo}],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id,
				tipo			: component_tipo, // (!) used only in time machine to filter by column tipo
				lang			: lang // (!) used only in time machine to filter by column lang
			}],
			limit				: 10,
			offset				: 0,
			order				: [{
				direction	: 'DESC',
				path		: [{component_tipo : 'id'}]
			}]
		}

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			sqo			: sqo,
			show		: {
				ddo_map : ddo_map
			}
		}]

	// context
		const context = {
			type			: 'section',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			lang			: lang,
			mode			: 'tm',
			model			: 'section',
			parent			: section_tipo,
			request_config	: request_config
		}

	// instance options
		const instance_options = {
			model			: 'section',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'tm',
			lang			: lang,
			context			: context,
			caller			: self,
			id_variant		: 'time_machine' // avoid conflicts
		}

	// init section instance
		const section = await get_instance(instance_options)

	// build section with autoload as true
		await section.build(true)

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("[tool_time_machine.load_section] section:", section);
		}

	// add to self instances list
		self.ar_instances.push(section)


	return section
};//end load_section



/**
* LOAD_COMPONENT
* Loads component to place in respective containers: current preview and preview version
*/
tool_time_machine.prototype.load_component = async function(lang, mode, matrix_id=null) {
	// console.log("load_component:",lang, mode, matrix_id);

	const self = this

	// source component (is the caller)
		const component	= self.caller
		// const source	= create_source(component, 'get_data')
		// const context	= JSON.parse(JSON.stringify(component.context))
			  // context.request_config = [source]

	// short vars
		const model				= component.model
		const component_tipo	= component.tipo
		const section_tipo		= component.section_tipo
		const section_id		= component.section_id
		const section_lang		= component.section_lang
		const type				= component.type
	
	// console.log("-> tool_time_machine load_component component:", component);
	
	// request_config
		const request_config = component.context.request_config
			? JSON.parse( JSON.stringify(component.context.request_config) )
			: null
	
	// context
		const context = {
			type			: 'component',
			typo			: 'ddo',
			tipo			: component_tipo,
			section_tipo	: section_tipo,
			lang			: lang,
			mode			: mode,
			model			: model,
			parent			: section_tipo,
			request_config	: request_config
		}

	// console.log("-> tool_time_machine load_component context:",context);

	// component instance_options
		const instance_options = {
			model			: model,
			tipo			: component_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang,
			section_lang	: section_lang,
			//parent		: component.parent,
			type			: type,
			context			: context,
			// data			: {value:[]},
			// datum		: component.datum,
			id_variant		: 'time_machine' // avoid conflicts
		}

		if (matrix_id) {
			instance_options.matrix_id = matrix_id
		}

	// get instance and build
		const component_instance = await get_instance(instance_options)

	// set current tool as component caller (to check if component is inside tool or not)
		if (matrix_id) {
			component_instance.caller = self
		}

		await component_instance.build(true)

		// console.log("-> tool_time_machine load_component new component_instance:", component_instance);

	// add created component instance to current ar_instances if not already added
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (component_instance!==self.caller && typeof instance_found==="undefined") {
			self.ar_instances.push(component_instance)
		}


	return component_instance
};//end load_component



/**
* APPLY_VALUE
* Loads component to place in respective containers: current and version preview
*/
tool_time_machine.prototype.apply_value = async function() {

	const self = this

	// vars 'section_id','section_tipo','tipo','lang','matrix_id'

	const lang		= self.lang
	const matrix_id	= self.selected_matrix_id

	const body = {
		url				: self.trigger_url,
		mode			: 'apply_value',
		section_id		: self.caller.section_id,
		section_tipo	: self.caller.section_tipo,
		tipo			: self.caller.tipo,
		lang			: lang,
		matrix_id		: matrix_id
	}
	const trigger_response = await trigger_request(self.trigger_url, body);

	// // user messages
		// 	const msg_type = (trigger_response.result===false) ? 'error' : 'ok'
		// 	//if (trigger_response.result===false) {
		// 		ui.show_message(buttons_container, trigger_response.msg, msg_type)
		// 	//}

	// close tool modal
		const close_promise = self.modal_container.close()

	// reload source component on finish close
		close_promise.then(()=>{
			self.caller.refresh()
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[tool_time_machine.apply_value] trigger_response:",trigger_response);
		}


	return trigger_response
};//end apply_value


