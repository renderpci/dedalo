// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import { dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_propagate_component_data} from './render_tool_propagate_component_data.js'



/**
* TOOL_PROPAGATE_COMPONENT_DATA
* Tool to make interesting things
*/
export const tool_propagate_component_data = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	this.component_list = null
	this.component_to_propagate


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_propagate_component_data.prototype.render	= tool_common.prototype.render
	tool_propagate_component_data.prototype.destroy	= common.prototype.destroy
	tool_propagate_component_data.prototype.refresh	= common.prototype.refresh
	tool_propagate_component_data.prototype.edit	= render_tool_propagate_component_data.prototype.edit



/**
* INIT
* Custom tool init
* @return bool
*/
tool_propagate_component_data.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload
* @return promise bool
*/
tool_propagate_component_data.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// specific actions.. like fix main_element for convenience
		// main_element. Set and config
		const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
		self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)


	return common_build
}//end build_custom



/**
* GET_COMPONENT_TO_PROPAGATE
* Instance, build and save temporal data, self.main_element
* @return promise
*/
tool_propagate_component_data.prototype.get_component_to_propagate = function() {

	const self = this

	return new Promise(async function(resolve){

		const instance_options = {
			section_tipo	: self.main_element.section_tipo,
			section_id		: 'tmp',
			model			: self.main_element.model,
			mode			: self.main_element.mode,
			tipo			: self.main_element.tipo,
			lang			: self.main_element.lang,
			type			: self.main_element.type,
			context			: self.main_element.context,
			id_variant		: 'propagate_'+new Date().getUTCMilliseconds(),
			standalone		: true,
			caller			: self
		}
		// init
			self.component_to_propagate = await get_instance(instance_options)

		// build
			await self.component_to_propagate.build(true)

		// configure the component
			self.component_to_propagate.datum			= self.main_element.datum
			self.component_to_propagate.data			= self.main_element.data
			self.component_to_propagate.data.section_id	= 'tmp'

		// show_interface. Change to add link and add buttons and remove save animation
			self.component_to_propagate.show_interface.button_add		= true
			self.component_to_propagate.show_interface.button_link		= true
			self.component_to_propagate.show_interface.save_animation	= false
			self.component_to_propagate.show_interface.tools			= false

		// set value and save to tmp section (temporal session stored)
			const changed_data_item = Object.freeze({
				action	: 'set_data',
				value	: self.main_element.data.value || []
			})
			await self.component_to_propagate.save([changed_data_item])

		resolve(true)
	})
}//end get_component_to_propagate



/**
* PROPAGATE_COMPONENT_DATA
* Call API to propagate current value to all selected components
* @param string action
* 	values: replace|add|delete
* @return promise
* 	resolve object api_response
*/
tool_propagate_component_data.prototype.propagate_component_data = function(action) {

	const self = this

	// short vars
		const section_tipo			= self.main_element.section_tipo
		const section_id			= self.main_element.section_id
		const component_tipo		= self.main_element.tipo
		const lang					= self.main_element.lang
		const propagate_data_value	= self.component_to_propagate.data.value
		const bulk_process_text 	= self.get_tool_label('bulk_process_label') || 'Data propagation'
		const action_label 			= self.get_tool_label(action) || action
		const bulk_process_label 	= `${bulk_process_text} | ${action_label}`

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'propagate_component_data')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				background_running		: true, // set run in background CLI
				section_tipo			: section_tipo,
				section_id				: section_id,
				component_tipo			: component_tipo,
				action					: action,
				lang					: lang,
				propagate_data_value	: propagate_data_value,
				bulk_process_label 		: bulk_process_label
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				use_worker	: true,
				body		: rqo
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> propagate_component_data API api_response:",'DEBUG',api_response);
				}

				resolve(api_response)
			})
		})
}//end propagate_component_data



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal | window
* @return promise: bool
*/
tool_propagate_component_data.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



// @license-end
