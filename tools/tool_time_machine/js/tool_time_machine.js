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
	this.section_tm
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
};//end init



/**
* BUILD_CUSTOM
*/
tool_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(self, autoload);


	return common_build
};//end build_custom



/**
* LOAD_SECTION
*/
tool_time_machine.prototype.load_section = async function() {

	const self = this	

	const component = self.caller
	
	// short vars
		const component_tipo	= component.tipo
		const section_tipo		= component.section_tipo
		const section_id		= component.section_id
		const lang				= component.lang

	// ddo_map
		const ddo_map = [
			//  matrix id
			{
				tipo			: 'section_id_tipo', // fake tipo only used to match ddo with data,
				section_tipo	: section_tipo,
				parent			: section_tipo,
				mode			: 'list'
			},
			// modification date DEDALO_SECTION_INFO_MODIFIED_DATE dd201
			{
				tipo			: 'dd201',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				mode			: 'list'
			},
			// modification user id DEDALO_SECTION_INFO_MODIFIED_BY_USER dd197
			{
				tipo			: 'dd197',
				section_tipo	: section_tipo,
				parent			: section_tipo,
				mode			: 'list'
			},
			// component itself
			{
				tipo			: component_tipo,
				section_tipo	: section_tipo,
				parent			: section_tipo,
				mode			: 'list'
			}
		]

	// sqo
		const sqo = {
			id					: 'tmp',
			mode				: 'tm',
			section_tipo		: [{tipo:section_tipo}],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id,
				tipo			: component_tipo,
				lang			: lang
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
			api_engine : 'dedalo',
			show : {
				ddo_map : ddo_map
			},
			sqo : sqo
		}]

	// context
		const context = {
			type			: 'section',
			typo			: 'ddo',
			tipo			: section_tipo,
			section_tipo	: section_tipo,
			lang			: lang,
			mode			: 'list',
			model			: 'section',
			parent			: section_tipo,
			// request_config	: request_config
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

	// inject custom rqo
		const source						= create_source(section, 'search');
		section.rqo_config					= JSON.parse( JSON.stringify(request_config[0]) )
		section.rqo_config.sqo.section_tipo	= section.rqo_config.sqo.section_tipo.map(el=>el.tipo)
		section.rqo_config.show.columns		= get_ar_inverted_paths(ddo_map)
		section.rqo		= {
			id			: section.id,
			action		: 'read',
			source		: source,
			show		: section.rqo_config.show,
			sqo			: section.rqo_config.sqo
		}

	// build section with autoload as true
		await section.build(true)

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[tool_time_machine.load_section] section:", section);
		}

	// add to self instances list
		self.ar_instances.push(section)


	return section
};//end load_section



/**
* LOAD_COMPONENT
* Loads component to place in respective containers: current and version preview
*/
tool_time_machine.prototype.load_component = async function(lang, mode='tm', matrix_id=null) {

	const self = this

	const component	= self.caller
	const source	= create_source(component, 'get_data')
	const context	= JSON.parse(JSON.stringify(component.context))
		  context.request_config = [source]

	// context lang switch if var lang is received
		if (typeof lang!=='undefined') {
			context.lang = lang
		}

	// component instance_options
		const instance_options = {
			model			: component.model,
			tipo			: component.tipo,
			section_tipo	: component.section_tipo,
			section_id		: component.section_id,
			mode			: mode, // component.mode==='edit_in_list' ? 'edit' : component.mode,
			lang			: context.lang,
			section_lang	: component.section_lang,
			//parent		: component.parent,
			type			: component.type,
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

	// add created component instance to current ar_instances
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


