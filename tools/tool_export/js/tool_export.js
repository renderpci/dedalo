// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals*/
/*eslint no-undef: "error"*/



/**
* TOOL_EXPORT
*
* Top-level controller for the Dédalo v7 data-export tool.
*
* Responsibilities:
* - Owns the instance state: the user's selected columns (`ar_ddo_to_export`),
*   the active SQO (filter), streaming progress UI, and the accumulated
*   `flat_table` result.
* - Delegates rendering to `render_tool_export` (edit/build_export_component/
*   sync_ar_ddo_to_export), drag-and-drop column reordering to `drag_tool_export`,
*   and generic lifecycle (render/destroy/refresh) to `common`/`tool_common`.
* - Exposes `get_export_grid()`, the streaming fetch entry point that posts an
*   NDJSON export request to `dd_tools_api` and feeds the `flat_table`
*   accumulator; also `get_export_xsl()` and `export_table_with_xlsx_lib()` for
*   client-side format conversion.
* - Persists the user's column selection per `target_section_tipo` to IndexedDB
*   (`update_local_db_data`) so it survives page reloads.
*
* Architecture (export pipeline):
*   1. User picks columns → DOM = source of truth → `sync_ar_ddo_to_export()`
*      rebuilds `ar_ddo_to_export` from DOM order.
*   2. `get_export_grid()` posts to `dd_tools_api::tool_request →
*      tool_export::get_export_grid()` (server forces sqo.limit='ALL').
*   3. Server streams NDJSON (meta / col / row / end lines); each line is
*      dispatched to `flat_table.process_line()`.
*   4. `flat_table` renders the live HTML preview and supplies the data for
*      CSV/TSV/ODS/XLSX/HTML/media downloads — single source of truth.
*
* Key state:
*   - `self.ar_ddo_to_export`   – ordered array of DDO objects for selected columns
*   - `self.sqo`                – the caller section's search query object (cloned for export)
*   - `self.target_section_tipo`– the section being exported (may differ from caller)
*   - `self.flat_table`         – the live `flat_table` instance (set after streaming starts)
*   - `self.progress_ui`        – optional { container, bar, text_bg, text_fg } node refs
*   - `self.total_records`      – record count from the server `meta` line
*
* Main exports: `tool_export` (constructor).
* See: tools/tool_export/class.tool_export.php (server side),
*      tools/tool_export/js/render_tool_export.js,
*      tools/tool_export/js/flat_table.js.
*/

// import
	import {clone} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_export} from './render_tool_export.js'
	import {flat_table} from './flat_table.js'
	import {
		on_dragstart,
		// on_dragend,
		on_dragover,
		on_dragleave,
		on_drop
	} from './drag_tool_export.js'



/**
* TOOL_EXPORT
* Constructor: initialises all instance properties to their zero/sentinel values.
*
* Properties set here are the authoritative list; `init()` fills them with real
* data from `options` and the caller section. Keeping them here makes it easy
* to audit state at construction time.
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

	// section elements. Left list of available section components to export
	this.section_elements = []
	this.section_elements_components_exclude = ['component_password']
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
	tool_export.prototype.sync_ar_ddo_to_export			= render_tool_export.prototype.sync_ar_ddo_to_export
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
* Runs once after the tool is instantiated.  Delegates generic tool
* initialisation to `tool_common.prototype.init`, then seeds the
* tool-export-specific instance vars that are not covered by `tool_common`.
*
* Side effects:
* - Calls `self.caller.build(true)` to ensure the caller section's RQO/SQO
*   are populated before being read (`self.source`, `self.sqo`).
* - Sets `self.lang` from `options.lang` (the active data language, e.g.
*   "lg-eng"), and `self.langs` from `page_globals.dedalo_projects_default_langs`.
* - Resets transient state: `events_tokens`, `components_list`, `ar_instances`,
*   `ar_ddo_to_export`, and initial pagination sentinels.
*
* @param {Object} options - Options object from the tool launcher.
*   Sample:
*   {
*     lang: "lg-eng",
*     mode: "edit",
*     model: "tool_export",
*     section_id: "1",
*     section_tipo: "rsc167",
*     tipo: "rsc36",
*     tool_config: { section_id: "2", section_tipo: "dd1324", name: "tool_export",
*                    label: "Tool Indexation", icon: "/v6/tools/tool_export/img/icon.svg", … }
*   }
* @returns {Promise<boolean>} Resolves to the value returned by `tool_common.prototype.init`
*   (true on success, false if the generic init failed).
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
* Fetches the available section components that can be offered as export columns
* (the left-panel "components list" in the UI).
*
* Delegates to `tool_common.prototype.build` for generic scaffolding, then
* calls `get_section_elements_context` (from `common.prototype`) to fetch the
* ontology-driven component list for `target_section_tipo`, excluding
* `section_elements_components_exclude` (e.g. `component_password`).
*
* The result is stored in `self.section_elements` and consumed by
* `render_tool_export.prototype.edit` when building the left panel.
*
* @param {boolean} [autoload=false] - Passed through to `tool_common.prototype.build`;
*   when true the build was triggered automatically (e.g. on init) rather than
*   by explicit user action.
* @returns {Promise<boolean>} The value returned by `tool_common.prototype.build`.
*/
tool_export.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// components_list. Prepare section component list [left] for render
		self.section_elements = await self.get_section_elements_context({
			section_tipo			: self.target_section_tipo,
			ar_components_exclude	: self.section_elements_components_exclude
		})

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* GET_SECTION_ID
* Generates an incrementing unique ID string for temporary export section nodes.
*
* (!) Note: this mutates `self.section_id` in place by pre-incrementing it,
* which means `section_id` drifts from any numeric ID set by the server during
* the session. Only use this for transient DOM node IDs, never as a persistent
* record identifier.
*
* @returns {string} A unique string of the form 'tmp_export_N', where N starts
*   at the value of `self.section_id + 1` and increments on each call.
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
 * Consumes the flat-table export protocol (see flat_table.js and
 * tools/tool_export/class.export_tabulator.php): every line is a JSON
 * object discriminated by 't' (meta | col | row | end). Lines are
 * dispatched to a flat_table accumulator that also drives the live
 * HTML preview; CSV/TSV/XLSX downloads read the same flat data.
 *
 * Request shape:
 *   dd_api: 'dd_tools_api', action: 'tool_request', source: create_source(self, 'get_export_grid')
 *   options.section_tipo  – the caller's section_tipo (determines which records to fetch)
 *   options.sqo           – cloned from self.sqo with limit=0/offset=0 (server forces 'ALL')
 *   options.ar_ddo_to_export – the ordered column DDO array
 *   options.ndjson_stream = true
 *
 * Streaming flow:
 *   1. `data_manager.request_fetch_stream` opens the response body as a
 *      ReadableStream; chunks are decoded and split on '\n'.
 *   2. Each parsed line is dispatched via `flat_table.process_line()`.
 *   3. On 'meta': resolve the outer Promise with the flat_table instance
 *      so the caller can mount the preview while rows keep streaming.
 *   4. On 'row' with sub===0: advance the progress bar (one record per
 *      primary row; sub-rows share a record_id and are skipped for counting).
 *   5. On stream end: hide the progress bar (500 ms delay for 100 % visibility),
 *      remove 'loading' CSS class from action buttons.
 *
 * (!) The Promise is resolved on 'meta', NOT on stream end. Callers must NOT
 * await the returned promise as a "done" signal — attach follow-up work to
 * `flat_table.on_end` or poll/await `flat_table.end` instead.
 *
 * @param {Object} options - Export configuration.
 * @param {string} options.data_format - Export format: 'value' | 'grid_value' | 'dedalo_raw'.
 * @param {string} [options.breakdown='default'] - Breakdown mode: 'default' | 'rows' | 'columns'.
 * @param {Array}  options.ar_ddo_to_export - Ordered array of DDO objects defining export columns.
 * @param {boolean} [options.show_tipo_in_label] - Client-only: append ontology tipo to column headers.
 * @param {boolean} [options.fill_the_gaps] - Server-side: repeat spanning values on exploded rows.
 * @param {boolean} [options.value_with_parents=false] - Include ancestor chain for relation targets.
 * @returns {Promise<flat_table|null>} Resolves with the live `flat_table` instance once
 *   the 'meta' protocol line arrives; resolves null if the stream fails to start or if
 *   the stream ends before 'meta' is received.
 */
tool_export.prototype.get_export_grid = async function(options) {

	const self = this

	// options
		const data_format			= options.data_format
		const breakdown				= options.breakdown || 'default'
		const ar_ddo_to_export		= options.ar_ddo_to_export
		const show_tipo_in_label	= options.show_tipo_in_label
		const fill_the_gaps			= options.fill_the_gaps
		const value_with_parents	= options.value_with_parents || false

	// sqo
	// note: limit/offset values are informational only. The API client gate
	// clamps any client-sent limit, and tool_export::setup() forces the
	// internal 'ALL' sentinel server-side: the export always serialises the
	// whole filtered selection.
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
				breakdown			: breakdown, // relation explosion mode: default | rows | columns
				fill_the_gaps		: fill_the_gaps, // server-side fill of spanning values
				value_with_parents	: value_with_parents, // export relation target ancestor chains as 'parents' sub-columns
				ar_ddo_to_export	: ar_ddo_to_export, // array with the ddo map and paths to get the info
				sqo					: sqo,
				ndjson_stream		: true
			}
		}

	// STREAMING REQUEST (Fetch Stream / NDJSON)
	const stream = await data_manager.request_fetch_stream({ body: rqo });

	if (!stream) {
		console.error("Failed to start stream");
		return null;
	}

	// flat_table accumulator (also the live preview renderer)
		const table = new flat_table()
		table.config.show_tipo_in_label = show_tipo_in_label
		self.flat_table = table

	const reader	= stream.getReader();
	const decoder	= new TextDecoder();
	let buffer		= '';
	let resolved	= false;
	let records_processed = 0;
	if (self.progress_ui) {
		self.progress_ui.container.classList.remove('no_visible');
		self.progress_ui.bar.style.width = '0%';
		const initial_text = `0 / ${self.total_records || '?'}`;
		self.progress_ui.text_bg.innerText = initial_text;
		self.progress_ui.text_fg.innerText = initial_text;
		// clipPath 'inset(0 100% 0 0)' hides the foreground text entirely at 0 %
		self.progress_ui.text_fg.style.clipPath = 'inset(0 100% 0 0)';
	}

	// Use a promise to resolve with the flat_table as soon as the meta line arrives
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
					if (!resolved) {
						resolve(null);
					}
					break;
				}

				if (SHOW_DEBUG) console.log("Stream: Received chunk", { length: value.length, time: performance.now() });

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop(); // Keep partial line for next chunk

				for (const line of lines) {
					if (!line.trim()) continue; // skip padding / blank lines
					const line_data = JSON.parse(line);

					// dispatch to the accumulator (renders the preview too)
					table.process_line(line_data);

					switch (line_data.t) {
						case 'meta':
							// total from the server when available
							if (line_data.total) {
								self.total_records = line_data.total;
							}
							if (!resolved) {
								resolved = true;
								resolve(table);
							}
							break;

						case 'row':
							// progress per record (sub rows belong to the same record)
							if (line_data.sub===0) {
								records_processed++;
								if (self.progress_ui && self.total_records) {
									const percent = Math.min(100, Math.round((records_processed / self.total_records) * 100));
									self.progress_ui.bar.style.width = percent + '%';
									const current_text = `${records_processed} / ${self.total_records}`;
									self.progress_ui.text_bg.innerText = current_text;
									self.progress_ui.text_fg.innerText = current_text;
									// clipPath reveals the coloured fg text proportionally to percent
									self.progress_ui.text_fg.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
								}
							}
							break;

						default:
							break;
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
* GET_EXPORT_XSL
* Converts an HTML `<table>` node to a legacy Excel-compatible `.xls` file
* and triggers a browser download via a synthetic `<a>` click.
*
* Uses the old Microsoft Office XML Spreadsheet format (MIME
* `application/vnd.ms-excel`) encoded as a base-64 data URI; this avoids
* any server round-trip and works in all modern browsers.  The method is
* kept for backward compatibility — new export paths prefer `export_table_with_xlsx_lib`
* (SheetJS) which produces a genuine `.xlsx` binary.
*
* (!) The `table` parameter is `options.table.firstChild`, NOT the outer
* wrapper element; callers must ensure `options.table` has a `<table>` as
* its first child. If `options.table` is already the `<table>` element itself,
* `.firstChild` will resolve to the first `<thead>` or `<tbody>` and the output
* will be malformed.
*
* @param {Object} options - Conversion options.
* @param {HTMLElement} options.table - Container whose `firstChild` is the
*   `<table>` element to serialise.
* @param {string} options.filename - The suggested download filename (e.g. `"export.xls"`).
* @returns {Promise<boolean>} Resolves `true` after the synthetic link is clicked.
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
* Converts an HTML `<table>` node to a binary `.xlsx` file and triggers
* a browser download using the SheetJS (`xlsx.js`) library.
*
* The library is **dynamically imported** on first call (lazy-load), so it is
* only downloaded by the browser when the user actually requests an XLSX export.
* The import path resolves to a local copy at `DEDALO_ROOT_WEB/lib/xlsx/build/xlsx.js`
* (downloaded from https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs).
*
* The `{"raw":true}` option tells SheetJS to keep cell values as-is without
* attempting type inference; this preserves leading zeros and long numeric strings
* that would otherwise be coerced.
*
* See: https://docs.sheetjs.com/docs/getting-started/installation/standalone#ecmascript-module-imports
*
* @param {Object} options - Conversion options.
* @param {HTMLElement} options.table - The `<table>` DOM element to export.
*   Must be mounted in the document (SheetJS reads computed layout).
* @param {string} options.filename - Suggested download filename including
*   the `.xlsx` extension (e.g. `"records_rsc167.xlsx"`).
* @returns {Promise<void>} Resolves once `XLSX.writeFile` triggers the download.
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
* Hook called by the tool framework immediately before the tool panel closes.
*
* When `open_as` is `'modal'`, destroys the tool instance (removes its DOM
* node and frees event listeners) so that re-opening the modal creates a
* fresh instance rather than reusing stale state.
*
* (!) Refreshing the caller (`self.caller.refresh()`) is intentionally
* suppressed — the caller is `component_json`, which must not be rebuilt just
* because the export modal closed.
*
* @param {string} open_as - How the tool was opened: `'modal'` | `'window'`.
* @returns {Promise<boolean>} Always resolves `true`.
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
* Persists the current `ar_ddo_to_export` column selection to IndexedDB so
* it can be restored the next time the user opens the export tool for the
* same section.
*
* Storage key: `'tool_export_config'` in the `'data'` IndexedDB table.
* Value shape: `{ [target_section_tipo]: ar_ddo_to_export, … }` — a single
* object that holds configurations for ALL sections the user has ever exported,
* keyed by `target_section_tipo`.  Only the entry for the current section is
* updated; other sections' configs are preserved.
*
* When `target_section_tipo` is an Array (multiple-section export), only the
* first element is used as the key to avoid object-key collisions.
*
* The commented-out block at the bottom of this method is dead code from an
* earlier design that pushed individual DDO objects rather than replacing the
* whole array; it is intentionally left in place for reference.
*
* @returns {Promise<boolean>} Resolves `true` after the IndexedDB write completes.
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
* Builds the stable string ID used to identify a DDO column node in the
* drag-and-drop UI and to key duplicate detection.
*
* Format: `<section_tipo>_<component_tipo>_…_list_<lang>`
* Example: `rsc167_rsc10_list_lg-eng`
*
* The ID encodes the full traversal path (each path step contributes one
* `section_tipo_component_tipo` segment) followed by the `lang` qualifier of
* the DDO. This makes IDs unique across nested relation traversals that would
* otherwise share the same leaf component_tipo.
*
* @param {Object} ddo  - The DDO (data-description object) for the export column;
*   must have a `lang` property (e.g. `"lg-eng"`).
* @param {Array}  path - The ordered traversal path from the top section to
*   this component; each element must have `section_tipo` and `component_tipo`.
* @returns {string} The composed column ID string.
*/
tool_export.prototype.compose_id = function (ddo, path) {

	const id = path.map(el => el.section_tipo +'_'+ el.component_tipo).join('_') +'_list_'+ ddo.lang

	return id
}//end compose_id



// @license-end
