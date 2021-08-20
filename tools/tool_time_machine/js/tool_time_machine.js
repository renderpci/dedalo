/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source, get_ar_inverted_paths} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_time_machine, add_component} from './render_tool_time_machine.js'



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
	// this.section_tm
	this.section			= null// custom section generated in tm mode on build
	this.button_apply		= null
	this.selected_matrix_id	= null
	this.modal_container	= null

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


	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload);

	// main_component. fix main_component for convenience
		const main_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_component")
		self.main_component			= self.ar_instances.find(el => el.tipo===main_component_ddo.tipo)

	// section list
		self.section = self.load_section() // don't wait here


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

	// component
		const component = self.main_component
	
	// short vars
		const component_tipo	= component.tipo
		const section_tipo		= component.section_tipo
		const section_id		= component.section_id
		const lang				= component.lang
		const model				= component.model
		const label				= component.label

	// ddo_map. Note that this ddo_map overwrite the default section request_config show ddo_map (!)
	// It will be coherent with server generated subcontext (section->get_tm_context) to avoid lost columns on render the list
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
			id_variant		: self.model // 'time_machine' // avoid conflicts
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

	// to_delete_instances. Select instances with same tipo and property matrix_id not empty
		const to_delete_instances = self.ar_instances.filter(el => el.tipo===self.main_component.tipo && el.matrix_id)

	// context (clone and edit)
		const context = Object.assign(clone(self.main_component.context),{
			lang		: lang,
			mode		: mode,
			section_id	: self.main_component.section_id,
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
};//end load_component



/**
* APPLY_VALUE
* Set selected version value to active component and close the tool
* @return promise
*/
tool_time_machine.prototype.apply_value = function() {

	const self = this

	// vars 'section_id','section_tipo','tipo','lang','matrix_id'

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'apply_value')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_id		: self.main_component.section_id,
			section_tipo	: self.main_component.section_tipo,
			tipo			: self.main_component.tipo,
			lang			: self.main_component.lang,
			matrix_id		: self.selected_matrix_id
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> apply_value API response:",'DEBUG',response);

				// close tool modal
					self.modal_container.close()

				// reload source component on finish close
					if (self.caller) {
						self.caller.refresh()
					}

				resolve(response)
			})
		})
};//end apply_value


