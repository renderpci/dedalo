/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// import
	import {clone} from '../../../core/common/js/utils/index.js'
	// import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import * as instances from '../../../core/common/js/instances.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_export} from './render_tool_export.js'
	import {
		on_dragstart,
		on_dragover,
		on_dragleave,
		on_drop
	} from './tool_export_drag.js'



/**
* TOOL_EXPORT
* Tool to export data from sections
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
	this.data_format		= null

	return true
}//end tool_export



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_export.prototype.render						= tool_common.prototype.render
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


		// const load_promise = import('../../../lib/sheetjs/dist/xlsx.full.min.js')
		// await common.prototype.load_script(DEDALO_ROOT_WEB + '/lib/sheetjs/dist/xlsx.full.min.js')

	return common_init
}//end init



/**
* BUILD
*/
tool_export.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = await tool_common.prototype.build.call(this, true);

	try {

		// // get_section_elements_context
		// 	const section_elements = await self.get_section_elements_context({
		// 		section_tipo : self.caller.section_tipo
		// 	})

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



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
		const data_format		= options.data_format
		const ar_ddo_to_export	= options.ar_ddo_to_export

	// sqo
		const sqo = clone(self.sqo)
		sqo.limit	= 0
		sqo.offset	= 0

	// source. Note that second argument is the name of the function to manage the tool request like 'get_export_grid'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_export_grid')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo		: self.caller.section_tipo, // section that call to the tool, it will be used to get the records from db
			model				: self.caller.model,
			data_format			: data_format, // format selected by the user to get data
			ar_ddo_to_export	: ar_ddo_to_export, // array with the ddo map and paths to get the info
			sqo					: sqo
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// delete previous instances
		const previous_dd_grid = self.ar_instances.find(el => el.model === 'dd_grid')
		if(previous_dd_grid){
			await previous_dd_grid.destroy()
		}

	// dd_grid
		const dd_grid = await instances.get_instance({
			model			: 'dd_grid',
			section_tipo	: self.caller.section_tipo,
			// section_id	: section_id,
			tipo			: self.caller.section_tipo,
			mode			: 'table',
			lang			: page_globals.dedalo_data_lang,
			data_format 	: data_format,
			rqo				: rqo
		})

	// render dd_grid
		await dd_grid.build()
		const dd_grid_node = await dd_grid.render()

		self.ar_instances.push(dd_grid)

	return dd_grid_node
}//end get_export_grid



/**
* GET_EXPORT_CSV
* Load the export grid data
*/
tool_export.prototype.get_export_csv = async function (options) {

	const self = this

	// dd_grid
	const dd_grid = await instances.get_instance({
		model			: 'dd_grid',
		section_tipo	: self.caller.section_tipo,
		// section_id	: section_id,
		tipo			: self.caller.section_tipo,
		mode			: 'csv',
		lang			: page_globals.dedalo_data_lang,
		data_format		: data_format,
		rqo				: rqo
	})

	return dd_grid
}//end get_export_csv



/**
* GET_EXPORT_XSL : load the export grid data and convert to XLS format
*/
tool_export.prototype.get_export_xsl = async function (options) {

	const self = this



	// const workbook = XLSX.utils.book_new();
	// const ws1 = XLSX.utils.table_to_book(table);
	// console.log("ws1:",ws1);
	// XLSX.utils.book_append_sheet(workbook, ws1, "Sheet1");
 	// 	// const workbook = XLSX.read(table, {type:'string'});
	// XLSX.writeFile(workbook, 'out.csv' );



	const table		= options.export_data.firstChild //.outerHTML
	const name		= self.caller.section_tipo
	const filename	= self.caller.section_tipo

	// function tableToExcel(table, name, filename) {
	const uri = 'data:application/vnd.ms-excel;base64,',
	template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><meta charset="utf-8"/><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>{table}</table></body></html>',
	base64 = function(head_nodes) {
		return window.btoa(decodeURIComponent(encodeURIComponent(head_nodes)))
	},
	format = function(template, ctx) {
		return template.replace(/{(\w+)}/g,
			function(m, p) {
				return ctx[p];
			})
	}

	// if (!table.nodeType) table = document.getElementById(table)
	const ctx = {
		worksheet	: name || 'Worksheet',
		table		: table.innerHTML
	}

	const link = document.createElement('a');
	link.download = filename;
	link.href = uri + base64(format(template, ctx));
	link.click();
}//end get_export_xsl



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal | window
* @return promise: bool
*/
tool_export.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions
