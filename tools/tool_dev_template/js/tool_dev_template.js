// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
 * TOOL_DEV_TEMPLATE
 *
 * Production-shaped sample tool, the reference for creating new tools.
 * Copy and rename, or scaffold with:
 *   php tools/tool_common/cli/create_tool.php --name=tool_myorg_mytool --label="My tool"
 * Full documentation: docs/development/tools/ (js_lifecycle.md for the client contract)
 */



// import needed modules
// by default you will need the tool_common to init, build and render,
// wire_tool for the standard prototype wiring, and your render module.
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
// import data_manager only if you need raw API access; tool->server calls
// use this.tool_request() from tool_common instead
	import {data_manager} from '../../../core/common/js/data_manager.js'
// import get_instance to create and init sections or components
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
// tool_common: base lifecycle (init/build/render), tool_request, wire_tool
	import {tool_common, load_component, wire_tool} from '../../tool_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_dev_template} from './render_tool_dev_template.js'



/**
* TOOL_DEV_TEMPLATE
* Tool constructor. Declare here every instance property your tool uses.
*/
export const tool_dev_template = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.caller			= null
	this.langs			= null
}//end tool_dev_template



/**
* COMMON FUNCTIONS
* wire_tool performs the standard prototype assignments in one call:
*   render  <- tool_common.prototype.render
*   destroy <- common.prototype.destroy
*   refresh <- common.prototype.refresh
*   edit    <- render_tool_dev_template.prototype.edit
* Add any extra prototype methods after this call as usual.
*/
wire_tool(tool_dev_template, render_tool_dev_template)



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_dev_template.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init.
	// It assigns the common vars (model, section_tipo, section_id, lang, mode...),
	// resolves the caller and the tool_config (with its ddo_map) or creates a
	// fallback ddo_map from the caller when none is defined.
		const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// ! enclose custom tool code inside try catch to allow Dédalo to recover
		// from exceptions or non login scenarios (self.error renders the error view)

		// set the self specific vars not defined by the generic init
			self.lang	= options.lang
			self.langs	= page_globals.dedalo_projects_default_langs

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool common_build
*/
tool_dev_template.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build.
	// It loads the tool CSS and resolves every ddo_map element into a live
	// instance (self.ar_instances). Pass {load_ddo_map: fn} as third argument
	// to replace the default loader.
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// locate the main element by its ddo_map role
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* GET_SOME_DATA_FROM_SERVER
* Sample tool->server call using the tool_request helper from tool_common.
* Routes to the static PHP method tool_dev_template::get_component_data(object $options).
* The method is declared in the PHP class API_ACTIONS map with a read gate
* ('tipo', level 1) that the framework enforces before dispatch.
*
* @return promise response {result, msg, errors}
*/
tool_dev_template.prototype.get_some_data_from_server = async function() {

	const self = this

	const response = await self.tool_request({
		action	: 'get_component_data',
		options	: {
			component_tipo	: self.main_element.tipo,
			section_id		: self.main_element.section_id,
			section_tipo	: self.main_element.section_tipo,
			config			: self.context.config
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> get_some_data_from_server API response:",'DEBUG',response);
	}

	return response
}//end get_some_data_from_server



/**
* FILE_UPLOAD_HANDLER
* Sample service_upload integration. Called when the 'upload_file_done' event
* fires (see render_tool_dev_template). Routes to
* tool_dev_template::handle_upload_file (write gate: 'tipo', level 2).
*
* @param object options {file_data}
* @return promise response {result, msg, errors}
*/
tool_dev_template.prototype.file_upload_handler = async function(options) {

	const self = this

	const response = await self.tool_request({
		action	: 'handle_upload_file',
		options	: {
			component_tipo	: self.main_element.tipo,
			section_id		: self.main_element.section_id,
			section_tipo	: self.main_element.section_tipo,
			config			: self.context.config,
			file_data		: options.file_data
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> file_upload_handler API response:",'DEBUG',response);
	}

	return response
}//end file_upload_handler



/**
* RUN_BACKGROUND_DEMO
* Sample background execution: the server detaches a CLI process and the
* HTTP response returns immediately with the pid. The PHP method must be
* listed in BOTH the API_ACTIONS map and the BACKGROUND_RUNNABLE allowlist.
*
* @return promise response
*/
tool_dev_template.prototype.run_background_demo = async function() {

	const self = this

	const response = await self.tool_request({
		action		: 'long_process_demo',
		background	: true,
		options		: {
			iterations : 3
		}
	})

	if(SHOW_DEVELOPER===true) {
		dd_console("-> run_background_demo API response (pid):",'DEBUG',response);
	}

	return response
}//end run_background_demo



/**
* LOAD_COMPONENT_SAMPLE
* Sample method showing how to load components calling the API directly.
* Not called by this tool by default; kept as reference.
* @param object options {ddo, langs}
* @return promise component_instance
*/
tool_dev_template.prototype.load_component_sample = async function(options) {

	const self = this

	const ddo	= options.ddo
	const lang	= options.langs

	// first load the context of the component
		const rqo = {
			action	: 'get_element_context',
			source : {
				model			: ddo.model,
				section_tipo	: ddo.section_tipo,
				section_id		: ddo.section_id,
				mode			: ddo.mode, // edit || list
				lang			: ddo.lang
			},
			prevent_lock : true
		}
		const api_response = await data_manager.request({
			body : rqo
		})
		self.main_element.context = api_response.result.context

	// second, with the context, load the full component (context and data)
		const load_options = Object.assign(clone(self.main_element.context),{
			self 		: self, // tool instance; the built component joins self.ar_instances
			lang		: lang,
			mode		: 'edit',
			section_id	: self.main_element.section_id
		})
		const component_instance = await load_component(load_options);


	return component_instance
}//end load_component_sample



// @license-end
