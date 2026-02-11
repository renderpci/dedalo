// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



// import
	import {clone} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_export} from './render_tool_export.js'
	import {
		on_dragstart,
		// on_dragend,
		on_dragover,
		on_dragleave,
		on_drop
	} from './drag_tool_export.js'



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
	// media_components. Set of grid data existing media components (used to export media)
	// e.g. new Set(['component_image']);
	this.media_components	= new Set([
		'component_3d',
		'component_av',
		'component_image',
		'component_pdf',
		'component_svg'
	]);
	// media_components_in_data. Array of media components in data (used to export media)
	this.media_components_in_data = [];
}//end tool_export



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_export.prototype.render						= tool_common.prototype.render
	tool_export.prototype.destroy						= common.prototype.destroy
	tool_export.prototype.refresh						= common.prototype.refresh
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
* @return bool common_init
*/
tool_export.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
	const common_init = await tool_common.prototype.init.call(this, options);

	try {

		// build the section that call, it's necessary to build the rqo
			if (!self.caller || typeof self.caller.build!=='function') {
				throw new Error("Caller build is not available.");
			}
			await self.caller.build(true)

		// set the self specific vars not defined by the generic init (in tool_common)
			self.lang	= options.lang // from page_globals.dedalo_data_lang
			self.langs	= page_globals.dedalo_projects_default_langs

		// short vars
			self.events_tokens			= []
			self.parent_node			= null
			self.components_list		= {}
			self.ar_instances			= []
			self.source					= self.caller.rqo.source
			self.sqo					= self.caller.rqo.sqo
			self.target_section_tipo	= self.sqo.section_tipo // can be different to section_tipo
			self.limit					= self.sqo.limit ?? 10
			self.ar_ddo_to_export		= []

			// const load_promise = import('../../../lib/sheetjs/dist/xlsx.full.min.js')
			// await common.prototype.load_script(DEDALO_ROOT_WEB + '/lib/sheetjs/dist/xlsx.full.min.js')
	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = false
* @return bool common_build
*/
tool_export.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// nothing to do here

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* GET_SECTION_ID
* @return string
* 	as 'tmp_export_1'
*/
tool_export.prototype.get_section_id = function() {

	const self		= this
	self.section_id	= ++self.section_id

	return 'tmp_export_' + self.section_id
}//end get_section_id



/**
 * GET_EXPORT_GRID
 * High-performance data fetcher using Fetch ReadableStreams and NDJSON.
 *
 * Replaces the traditional monolithic JSON buffer with an incremental row-by-row
 * delivery system.
 *
 * Protocol: NDJSON (Newline Delimited JSON)
 * - First line: Header metadata (dd_grid configuration)
 * - Subsequent lines: Individual row data objects
 *
 * @param {Object} options - Request options including data_format and filters
 * @returns {Promise<Object>} The dd_grid instance, resolved once the header arrives
 */
tool_export.prototype.get_export_grid = async function(options) {

	const self = this

	// options
		const data_format			= options.data_format
		const ar_ddo_to_export		= options.ar_ddo_to_export
		const view					= options.view || 'table'
		const show_tipo_in_label	= options.show_tipo_in_label
		const fill_the_gaps			= options.fill_the_gaps

	// sqo
		const sqo = clone(self.sqo)
		sqo.limit	= 0
		sqo.offset	= 0

	// source. Note that second argument is the name of the function to manage the tool request like 'get_export_grid'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_export_grid')

	// API request options
		const rqo = {
			dd_api			: 'dd_tools_api',
			action			: 'tool_request',
			source			: source,
			prevent_lock	: true, // close session to unlock the browser and allow to abort
			options			: {
				section_tipo		: self.caller.section_tipo, // section that call to the tool, it will be used to get the records from db
				model				: self.caller.model,
				data_format			: data_format, // format selected by the user to get data
				ar_ddo_to_export	: ar_ddo_to_export, // array with the ddo map and paths to get the info
				sqo					: sqo,
				ndjson_stream       : true
			}
		}

	// STREAMING REQUEST (Fetch Stream / NDJSON)
	const stream = await data_manager.request_fetch_stream({ body: rqo });

	if (!stream) {
		console.error("Failed to start stream");
		return null;
	}

	const reader	= stream.getReader();
	const decoder	= new TextDecoder();
	let buffer		= '';
	let first_chunk = true;
	let rows_processed = 0;
	if (self.progress_ui) {
		self.progress_ui.container.classList.remove('no_visible');
		self.progress_ui.bar.style.width = '0%';
		const initial_text = `0 / ${self.total_records || '?'}`;
		self.progress_ui.text_bg.innerText = initial_text;
		self.progress_ui.text_fg.innerText = initial_text;
		self.progress_ui.text_fg.style.clipPath = 'inset(0 100% 0 0)';
	}

	// Use a promise to resolve with the grid instance as soon as the first chunk (header) arrives
	return new Promise(async (resolve, reject) => {
		try {
			while (true) {
				const { value, done } = await reader.read();

				if (done) {
					if (SHOW_DEBUG) console.log("Stream: Finished reading");
					if (self.progress_ui) {
						// Small delay before hiding to show 100%
						setTimeout(() => {
							self.progress_ui.container.classList.add('no_visible');
							self.progress_ui.bar.style.width = '0%';
							const initial_text = `0 / ${self.total_records || '?'}`;
							self.progress_ui.text_bg.innerText = initial_text;
							self.progress_ui.text_fg.innerText = initial_text;

							// Activates the download buttons
							if (self.export_buttons_options) {
								self.export_buttons_options.classList.remove('loading');
								self.export_buttons_options.scrollIntoView({ behavior: 'smooth', block: 'start' })
							}
						}, 500);
					}

					// Activates the button export
					if (self.button_export) {
						self.button_export.classList.remove('loading');
					}
					resolve(null);
					break;
				}

				if (SHOW_DEBUG) console.log("Stream: Received chunk", { length: value.length, time: performance.now() });

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop(); // Keep partial line for next chunk

				for (const line of lines) {
					if (!line.trim()) continue;
					const chunk_data = JSON.parse(line);

					if (first_chunk) {
						// The first chunk is the header row
						const dd_grid = await self._init_grid_with_data(chunk_data, view, show_tipo_in_label, fill_the_gaps, data_format);
						self.dd_grid = dd_grid;
						first_chunk = false;
						resolve(dd_grid);
					} else {
						// Subsequent chunks are rows
						if (self.dd_grid) {
							// Append row to data
							self.dd_grid.data.push(chunk_data);

							rows_processed++;
							if (self.progress_ui && self.total_records) {
								const percent = Math.min(100, Math.round((rows_processed / self.total_records) * 100));
								self.progress_ui.bar.style.width = percent + '%';
								const current_text = `${rows_processed} / ${self.total_records}`;
								self.progress_ui.text_bg.innerText = current_text;
								self.progress_ui.text_fg.innerText = current_text;
								self.progress_ui.text_fg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
							}

							// Trigger incremental render update if grid is already built
							// Note: This logic might need refinement depending on dd_grid/view_table_dd_grid capabilities
							self._append_row_to_grid_ui(chunk_data);
						}
					}
				}
			}
		} catch (error) {
			console.error("Error reading stream:", error);
			// Activates the download buttons even on error to allow retry
			if (self.export_buttons_options) {
				self.export_buttons_options.classList.remove('loading');
			}
			reject(error);
		}
	});
}//end get_export_grid



/**
* _INIT_GRID_WITH_DATA
* Helper to initialize dd_grid with initial data (header)
* @private
*/
tool_export.prototype._init_grid_with_data = async function(data, view, show_tipo_in_label, fill_the_gaps, data_format) {
	const self = this;

	const dd_grid = self.dd_grid || await get_instance({
		model				: 'dd_grid',
		section_tipo		: self.caller.section_tipo,
		tipo				: self.caller.section_tipo,
		mode				: 'list',
		view				: view,
		config				: {
			show_tipo_in_label	: show_tipo_in_label,
			fill_the_gaps		: fill_the_gaps,
			data_format			: data_format
		},
		lang				: page_globals.dedalo_data_lang,
		data				: [data] // Initial data is only the header
	});

	if (self.dd_grid) {
		self.dd_grid.data = [data];
		self.dd_grid.view = view;
		self.dd_grid.config = { ...self.dd_grid.config, show_tipo_in_label, fill_the_gaps, data_format };
	}

	await dd_grid.build(false);
	self.dd_grid = dd_grid;
	if (!self.ar_instances.includes(dd_grid)) {
		self.ar_instances.push(dd_grid);
	}

	return dd_grid;
}



/**
 * _APPEND_ROW_TO_GRID_UI
 * Progressive rendering engine for streamed data.
 *
 * Implements a queuing and batching mechanism to ensure smooth UI performance:
 * - Row Queue: Ensures rows are rendered in strict arrival order.
 * - Batch Processing: Renders rows in chunks (e.g. 20) via requestAnimationFrame
 *   to maintain 60fps even during high-throughput transmission.
 * - DOM Sync: Automatically schedules retries if the parent table isn't fully
 *   mounted in the DOM yet.
 *
 * @private
 * @param {Object} row_data - Data for a single grid row
 */
tool_export.prototype._append_row_to_grid_ui = function(row_data) {
	const self = this;

	// Always add to queue to maintain order
	self._row_queue = self._row_queue || [];
	self._row_queue.push(row_data);

	// Start processing loop if not already running
	if (self._is_processing_queue) return;
	self._is_processing_queue = true;

	if (SHOW_DEBUG) console.log("Stream: Started processing row queue", { queue_length: self._row_queue.length });

	const try_process = async () => {
		// Check if the grid node is actually in the document body
		// Note: dd_grid.node is set after dd_grid.render() completes
		if (self.dd_grid && self.dd_grid.node && document.body.contains(self.dd_grid.node)) {

			// Load the module once before processing the queue
			if (!self._view_table_dd_grid) {
				const module = await import('../../../core/dd_grid/js/view_table_dd_grid.js');
				self._view_table_dd_grid = module.view_table_dd_grid;
			}

			// Process rows in batches to avoid blocking the main thread while maintaining high throughput
			const BATCH_SIZE = 20;

			while (self._row_queue.length > 0) {
				// Take a batch of rows
				const batch = self._row_queue.splice(0, BATCH_SIZE);

				// Apply batch to DOM in a single animation frame
				await new Promise(resolve => {
					requestAnimationFrame(async () => {
						for (const row of batch) {
							await self._do_append_row(row);
						}
						resolve();
					});
				});

				// Brief yield to allow other async tasks (like stream reading) to run
				await new Promise(resolve => setTimeout(resolve, 0));
			}

			self._is_processing_queue = false;
			if (SHOW_DEBUG) console.log("Stream: Finished processing row queue");
		} else {
			// If not yet in DOM, wait and try again
			// In theory, render_tool_export.js should append it soon after header arrives
			setTimeout(try_process, 50);
		}
	};

	try_process();
}



/**
* _DO_APPEND_ROW
* Actual DOM insertion of a row
* @private
*/
tool_export.prototype._do_append_row = async function(row_data) {
	const self = this;
	if (!self.dd_grid || !self.dd_grid.node || !self._view_table_dd_grid) return;

	const table = self.dd_grid.node.querySelector('table') || self.dd_grid.node;
	if (!table || table.tagName !== 'TABLE') return;

	const header_row = self.dd_grid.data[0];
	const ar_columns_obj = Array.isArray(header_row.value)
		? header_row.value.map(item => item.ar_columns_obj)
		: [];

	const row_fragment = self._view_table_dd_grid.render_row(self.dd_grid, row_data, ar_columns_obj);
	table.appendChild(row_fragment);
}



/**
* GET_EXPORT_CSV
* Load the export grid data
*/
	// tool_export.prototype.get_export_csv = async function () {

	// 	const self = this

	// 	// dd_grid
	// 	const new_dd_grid = await get_instance({
	// 		model			: 'dd_grid',
	// 		section_tipo	: self.caller.section_tipo,
	// 		// section_id	: section_id,
	// 		tipo			: self.caller.section_tipo,
	// 		mode			: 'list',
	// 		view			: 'csv',
	// 		lang			: page_globals.dedalo_data_lang,
	// 		// data_format	: data_format,
	// 		rqo				: self.rqo,
	// 		id_variant 		: 'csv_'
	// 	})
	// console.log('self.data:---------------------------<>', self);

	// 	if (self.data) {
	// 		new_dd_grid.data = self.data
	// 		await new_dd_grid.build(false)
	// 	}else{

	// 		await new_dd_grid.build(true)
	// 	}

	// 	const csv_string = await new_dd_grid.render()

	// 	return csv_string
	// }//end get_export_csv



/**
* GET_EXPORT_XSL
* Load the export grid data and convert it to XLS format
* @param object options
* @return bool
*/
tool_export.prototype.get_export_xsl = async function (options) {

	const self = this

	// const workbook = XLSX.utils.book_new();
	// const ws1 = XLSX.utils.table_to_book(table);
	// console.log("ws1:",ws1);
	// XLSX.utils.book_append_sheet(workbook, ws1, "Sheet1");
 	// 	// const workbook = XLSX.read(table, {type:'string'});
	// XLSX.writeFile(workbook, 'out.csv' );

	const table		= options.table.firstChild //.outerHTML
	const name		= self.caller.section_tipo
	const filename	= options.filename

	// function tableToExcel(table, name, filename) {
	const uri = 'data:application/vnd.ms-excel;base64,',
	template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><meta charset="UTF-8"/><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>{table}</table></body></html>',
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

	return true
}//end get_export_xsl



/**
* EXPORT_TABLE_WITH_XLSX_LIB
* Convert and export table to xlsx using the library xlsx.js
* see: https://docs.sheetjs.com/docs/getting-started/installation/standalone#ecmascript-module-imports
* @param options options
* 	{
* 		table : node html table
* 		filename: string
* 	}
* @return promise: bool
*/
tool_export.prototype.export_table_with_xlsx_lib = async function( options ) {

	// dynamically import the library when is fired this function with the event listener
	// downloaded library from https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs
  	const XLSX = await import( DEDALO_ROOT_WEB+"/lib/xlsx/build/xlsx.js" );

	const table		= options.table
	const filename	= options.filename

	const workbook = XLSX.utils.table_to_book(table, {"raw":true})

	// Export the workbook to Excel file
	XLSX.writeFile(workbook, filename);
}// end export_table_with_xlsx_lib



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal|window
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



/**
* UPDATE_LOCAL_DB_DATA
* Read and replaces the tool_export_config data portion from current section
* Saves the updated value read from self.ar_ddo_to_export
* @return bool
*/
tool_export.prototype.update_local_db_data = async function() {

	const self = this

	// target_section_tipo. Used to create a object property key different for each section
	const target_section_tipo = Array.isArray(self.target_section_tipo)
		? self.target_section_tipo[0]
		: self.target_section_tipo

	// get_local_db_data
	const id		= 'tool_export_config'
	const response	= await data_manager.get_local_db_data(
		id,
		'data'
	)

	// tool_export_config. Current section tool_export_config (fallback to basic object)
	const tool_export_config = response && response.value
		? response.value
		: {
			[target_section_tipo] : []
		  }

	// update current key only and save whole object
		tool_export_config[target_section_tipo] = self.ar_ddo_to_export

	// save
		const cache_data = {
			id		: 'tool_export_config',
			value	: tool_export_config
		}
		await data_manager.set_local_db_data(
			cache_data,
			'data'
		)

	// check if already exists current target section_tipo config ddo
		// const found = tool_export_config[target_section_tipo]
		// 	? tool_export_config[target_section_tipo].find(el => el.id===ddo.id)
		// 	: undefined

	// if not exists current ddo (as expected), add it to local database using current target section_tipo as key
		// if (!found) {
		// 	tool_export_config[target_section_tipo] = tool_export_config[target_section_tipo] || []
		// 	tool_export_config[target_section_tipo].push(ddo)
		// 	// save
		// 	const cache_data = {
		// 		id		: 'tool_export_config',
		// 		value	: tool_export_config
		// 	}
		// 	data_manager.set_local_db_data(
		// 		cache_data,
		// 		'data'
		// 	)
		// }

	return true
}//end update_local_db_data



/**
* COMPOSE_ID
* Compose the ddo id used in drag and drop in a unified way
* @param object ddo
* @param array path
* @return string id
*/
tool_export.prototype.compose_id = function (ddo, path) {

	const id = path.map(el => el.section_tipo +'_'+ el.component_tipo).join('_') +'_list_'+ ddo.lang

	return id
}//end compose_id



// @license-end
