/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import * as instances from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_export} from './render_tool_export.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'

	import {
		on_dragstart,
		on_dragover,
		on_dragleave,
		on_drop
	} from './tool_export_drag.js'


/**
* tool_export
* Tool to translate contents from one language to other in any text component
*/
export const tool_export = function () {
	
	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.caller						= null // section or component
	this.components_list 			= {}


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_export.prototype.render					= common.prototype.render
	tool_export.prototype.destroy					= common.prototype.destroy
	tool_export.prototype.edit						= render_tool_export.prototype.edit
	tool_export.prototype.build_export_component	= render_tool_export.prototype.build_export_component
	// get and render list of components from common
	tool_export.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
	tool_export.prototype.calculate_component_path		= common.prototype.calculate_component_path

	// drag
	tool_export.prototype.on_dragstart			= on_dragstart
	tool_export.prototype.on_dragover			= on_dragover
	tool_export.prototype.on_dragleave			= on_dragleave
	tool_export.prototype.on_drop				= on_drop


/**
* INIT
* 
* @param object options
* Sample:
* {
*	lang: "lg-eng"
*	mode: "edit"
*	model: "tool_export"
*	section_id: "1"
*	section_tipo: "rsc167"
*	tipo: "rsc36"
*	tool_config: {section_id: "2", section_tipo: "dd1324", name: "tool_export", label: "Tool Indexation", icon: "/v6/tools/tool_export/img/icon.svg", …}
* }
*/
tool_export.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang	= options.lang // from page_globals.dedalo_data_lang
		self.langs	= page_globals.dedalo_projects_default_langs

	// shor vars
		self.events_tokens			= []
		self.parent_node			= null
		self.components_list		= {}
		self.ar_instances			= []
		self.source					= self.caller.rqo.source
		self.sqo					= self.caller.rqo.sqo
		self.target_section_tipo	= self.sqo.section_tipo // can be different to section_tipo
		self.limit					= self.sqo.limit || 10
		self.ar_ddo_to_export  		= []

	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_export.prototype.build = async function(autoload=false) {

	const self = this

		console.log("self:",self);

	// status update
		self.status = 'building'

	// load self style
		const tool_css_url = DEDALO_TOOLS_URL + '/' + self.model + "/css/" + self.model + ".css"
		common.prototype.load_style(tool_css_url)



	// // get_section_elements_context
	// 	const section_elements = await self.get_section_elements_context({
	// 		section_tipo : self.caller.section_tipo
	// 	})


	// status update
		self.status = 'builded'


	return true
};//end build_custom



tool_export.prototype.get_section_id = function() {
	const self = this
	self.section_id = ++self.section_id
	return 'tmp_export_' + self.section_id
}


/**
* GET_EXPORT_grid : load the export grid data
*/
tool_export.prototype.get_export_grid = async function(options) {

	const self = this

	const sqo = JSON.parse(JSON.stringify(self.sqo))
		sqo.limit	= 0
		sqo.offset	= 0

	// source. Note that second argument is the name of the function to manage the tool request like 'get_export_grid'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_export_grid')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo		: self.caller.section_tipo, // section that call to the tool, it will be used to get the records from db
			model				: self.caller.model,
			export_format		: options.export_format, // format selected by the user to get data
			ar_ddo_to_export	: options.ar_ddo_to_export, // array with the ddo map and paths to get the info
			sqo 				: sqo,
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		const current_data_manager = new data_manager()
		const dd_grid_data = await current_data_manager.request({body : rqo})

		const dd_grid	= await instances.get_instance({
					model 			: 'dd_grid',
					section_tipo	: self.caller.section_tipo,
					// section_id		: section_id,
					tipo			: self.caller.section_tipo,
					mode 			: 'list',
					lang 			: page_globals.dedalo_data_lang,
					// rqo 			: rqo
				})

	dd_grid.data = dd_grid_data.result

	const node = await dd_grid.render()

	return node
}// end get_export_grid

