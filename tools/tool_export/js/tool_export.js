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
	
	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= []
	this.type				= null
	this.source_lang		= null
	this.caller				= null // section or component
	this.components_list	= {}


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_export.prototype.render						= common.prototype.render
	tool_export.prototype.destroy						= common.prototype.destroy
	tool_export.prototype.edit							= render_tool_export.prototype.edit
	tool_export.prototype.build_export_component		= render_tool_export.prototype.build_export_component
	// get and render list of components from common
	tool_export.prototype.get_section_elements_context	= common.prototype.get_section_elements_context
	tool_export.prototype.calculate_component_path		= common.prototype.calculate_component_path

	// drag
	tool_export.prototype.on_dragstart					= on_dragstart
	tool_export.prototype.on_dragover					= on_dragover
	tool_export.prototype.on_dragleave					= on_dragleave
	tool_export.prototype.on_drop						= on_drop



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
		self.ar_ddo_to_export		= []

	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_export.prototype.build = async function(autoload=false) {

	const self = this

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



/**
* GET_SECTION_ID
*/
tool_export.prototype.get_section_id = function() {
	const self		= this
	self.section_id	= ++self.section_id

	return 'tmp_export_' + self.section_id
}//end get_section_id



/**
* GET_EXPORT_GRID
* Load the export grid data and build a DOM node with the result
*/
tool_export.prototype.get_export_grid = async function(options) {

	const self = this

	// options
		const export_format		= options.export_format
		const ar_ddo_to_export	= options.ar_ddo_to_export

	// sqo
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
			export_format		: export_format, // format selected by the user to get data
			ar_ddo_to_export	: ar_ddo_to_export, // array with the ddo map and paths to get the info
			sqo					: sqo
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}


	// call to the API, fetch data and get response
		const current_data_manager	= new data_manager()
		const dd_grid_data_request	= await current_data_manager.request({body : rqo})
		const dd_grid_data			= dd_grid_data_request.result

			// console.log("dd_grid_data-----:",dd_grid_data);

		/* TEST
			console.log("get_export_grid dd_grid_data_request:",dd_grid_data);
			console.log("dd_grid_data 1:", JSON.stringify(dd_grid_data[1]));

			const parsed_data = []
			for (let i = 0; i < dd_grid_data.length; i++) {

				const item = dd_grid_data[i]

				if (i===0) {
					parsed_data.push(item) // skip process labels row
				}else{
					// parsed_value (return array of objects)
					const parsed_value	= parse_grid_data_value(item)
						// console.log("parsed_value:",parsed_value);

					parsed_value.map(el => {
						el.value = el._values
						// delete el._values
					})

					// // parsed_item
					// const parsed_item	= clone(dd_grid_data[0]) // clone menu item
					// parsed_item.value	= parsed_value

					// parsed_data.push(parsed_item)


					// iterate parsed_value columns
						for (let k = 0; k < parsed_value.length; k++) {

							const item = parsed_value[k]
							// console.log("item:", item, k);

							for (let j = 0; j < item.value.length; j++) {

								const column_values = item.value[j]
									// console.log("column_values:",column_values);

								const found = parsed_data.find(el => el.label===item.label)
								if (found) {
									// for (let h = 0; h < found.value.length; h++) {
									// 	found.value[h]
									// }
									found.value.push(column_values)

								}else{

									const parsed_item = clone(dd_grid_data[0]) // clone menu item
										parsed_item.label			= item.label
										parsed_item.type			= 'column'
										parsed_item.column_count	= 1
										parsed_item.row_count		= null
										parsed_item.value			= [column_values]

									parsed_data.push(parsed_item)
								}
							}
						}
				}
			}
			console.log("____ parsed_data:",parsed_data);
			*/


	// dd_grid
		const dd_grid = await instances.get_instance({
			model			: 'dd_grid',
			section_tipo	: self.caller.section_tipo,
			// section_id	: section_id,
			tipo			: self.caller.section_tipo,
			mode			: 'table',
			lang			: page_globals.dedalo_data_lang
			// rqo			: rqo
		})
		// set dd_grid data
		dd_grid.data = dd_grid_data
		// render dd_grid
		const dd_grid_node = await dd_grid.render()


	return dd_grid_node
}// end get_export_grid



/**
* PARSE_GRID_DATA_VALUE ------- TEST METHOD. REMOVE IF NOT IS USED (!) -------
* @return array value
*/
const parse_grid_data_value = function(grid_data_object) {
		// console.log("grid_data_object:",grid_data_object);

	const ar_values = []

	const value = grid_data_object.value

	// value NOT contains another value inside case. Add directly
	if (value && value.length>0 && typeof(value[0].value)!=='object') { // && typeof(value[0].value[0]==='undefined')

		// console.log("Added direct grid_data_object:", clone(grid_data_object));

		// normalize section_id value
		if (value[0].cell_type==='section_id') {
			grid_data_object.value = [value[0].value]
		}

		grid_data_object._values = grid_data_object._values || [grid_data_object.value]
		ar_values.push( grid_data_object )
		// console.log("Added direct grid_data_object:",grid_data_object);

	// value already contains values inside. Iterate recursively
	}else if(value && value[0]){

		for (let i = 0; i < value.length; i++) {
			const result = parse_grid_data_value(value[i])
				// console.log("result:", result, value);

			for (let j = 0; j < result.length; j++) {

				const current_grid_data_object = result[j]

				const found = ar_values.find(el => el.label===current_grid_data_object.label)
				if (found) {
					// console.log("found 1:", clone(found));
					// console.log("Added to already existing value:",current_grid_data_object.value);
					found._values = found._values || []
					found._values.push(current_grid_data_object.value)
					// console.log("found 2:", clone(found));
				}else{

					current_grid_data_object._values = current_grid_data_object._values || [current_grid_data_object.value]
					ar_values.push( current_grid_data_object )
					// console.log("Added new value:",current_grid_data_object);
				}
			}
		}
	}else{
		console.warn("++++ value:", value, grid_data_object);

		grid_data_object._values = grid_data_object._values || [grid_data_object.value]
		ar_values.push( grid_data_object )
	}


	return ar_values
}//end parse_grid_data_value



/**
* GET_EXPORT_CSV : load the export grid data
*/
tool_export.prototype.get_export_csv = async function (options) {

	// body...
}// end get_export_csv


