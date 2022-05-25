/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_propagate_component_data} from './render_tool_propagate_component_data.js' // self tool rendered (called from render common)



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


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_propagate_component_data.prototype.render	= tool_common.prototype.render
	// destroy							: using common destroy method
	tool_propagate_component_data.prototype.destroy	= common.prototype.destroy
	// refresh							: using common refresh method
	tool_propagate_component_data.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_propagate_component_data.prototype.edit	= render_tool_propagate_component_data.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_propagate_component_data.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
};//end init



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
		const main_element_ddo		= self.tool_config.ddo_map.find(el => el.role==="main_element")
		self.main_element				= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)
		self.main_element.permissions	= 1 // set as read only


	return common_build
};//end build_custom



/**
* PROPAGATE_COMPONENT_DATA
* 	Get the llist of section components selectables to update cache
* @param string action
* 	'add' | 'remove'
* @return promise > bool
*/
tool_propagate_component_data.prototype.propagate_component_data = function(action) {

	const self = this

	// short vars
		const section_tipo		= self.main_element.section_tipo
		const section_id		= self.main_element.section_id
		const component_tipo	= self.main_element.tipo
		const lang				= self.main_element.lang

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'propagate_component_data')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo	: section_tipo,
			section_id		: section_id,
			component_tipo	: component_tipo,
			action			: action,
			lang			: lang
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
				dd_console("-> propagate_component_data API response:",'DEBUG',response);

				resolve(response)
			})
		})
};//end propagate_component_data



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
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions
