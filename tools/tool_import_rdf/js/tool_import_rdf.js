/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_rdf} from './render_tool_import_rdf.js'
	// import {event_manager} from '../../../core/common/js/event_manager.js'



/**
* TOOL_IMPORT_RDF
* Tool to translate contents from one language to other in any text component
*/
export const tool_import_rdf = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.source_lang		= null
	this.target_lang		= null
	this.langs				= null
	this.caller				= null
	this.key_dir			= null
	this.active_dropzone	= null
	this.tool_contanier		= null
	this.files_data			= []

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_rdf.prototype.render	= common.prototype.render
	tool_import_rdf.prototype.destroy	= common.prototype.destroy
	tool_import_rdf.prototype.refresh	= common.prototype.refresh
	tool_import_rdf.prototype.edit		= render_tool_import_rdf.prototype.edit



/**
* INIT
*/
tool_import_rdf.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
};//end init




/**
* BUILD_CUSTOM
*/
tool_import_rdf.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = await tool_common.prototype.build.call(this, true);

	// main_element. fix main_element for convenience
		const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
		self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)


	return common_build
};//end build_custom



/**
* LOAD_COMPONENT
*/
tool_import_rdf.prototype.load_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to main_element
		const to_delete_instances = self.ar_instances.filter(el => el.lang!==self.main_element.lang)

	// context (clone and edit)
		const context = Object.assign(clone(self.main_element.context),{
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_element.section_id
		})

	// options
		const options = {
			context				: context,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		}

	// call generic common tool build
		const component_instance = tool_common.prototype.load_component.call(self, options);

			console.log("component_instance:",component_instance);

	return component_instance
};//end load_component





/**
* GET_RDF_DATA
* Call the API to get process the source component_iri and transform to Dédalo model
* the correspondence is in external ontology.
*
* @param tipo ontology_tipo (the tipo of the external ontology to be used )
* @param data ar_values (like '["http://numismatics.org/ocre/id/ric.1(2).aug.1A"]', selected by the user)
*
* @return promise response
*/
tool_import_rdf.prototype.get_rdf_data = async function( ontology_tipo, ar_values) {

	const self = this
	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_rdf_data')
		// add the necessary arguments used in the given function
		source.arguments = {
			ontology_tipo	: ontology_tipo,
			ar_values		: ar_values,
			locator	: {
				section_tipo	: self.caller.section_tipo,
				section_id		: self.caller.section_id,
			}
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
				dd_console("-> get_rdf_data API response:",'DEBUG',response);

				// user messages
					const msg_type = (response.result===false) ? 'error' : 'ok'

				resolve(response)
			})
		})
};//end get_rdf_data


