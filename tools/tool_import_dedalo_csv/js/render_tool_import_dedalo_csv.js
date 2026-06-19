// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_tool_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_import_dedalo_csv */
/*eslint no-undef: "error"*/



// imports
	import {validate_tipo} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {render_stream} from '../../../core/common/js/render_common.js'



/**
* RENDER_TOOL_IMPORT_DEDALO_CSV
* Client-side render controller for the CSV import tool.
*
* This module provides the DOM-building layer for tool_import_dedalo_csv. Its
* prototype methods are mixed into the tool class in tool_import_dedalo_csv.js
* via direct prototype assignment, following the Dédalo render-file pattern.
*
* Exported functions:
* - render_tool_import_dedalo_csv  (constructor, mixed into the tool class)
* - render_tool_import_dedalo_csv.prototype.edit        – builds the full edit wrapper
* - render_tool_import_dedalo_csv.prototype.upload_done – called when a file upload finishes
*
* Private helpers (module-scoped, not exported):
* - render_service_upload    – (re-)renders the drag-and-drop upload zone
* - get_content_data         – builds the main tool body (file list + submit controls)
* - render_file_info         – renders one CSV file card with column mapper
* - render_columns_mapper    – async; fetches component list and renders column-mapping UI
* - render_final_report      – renders per-file import outcome (created / updated / failed rows)
* - update_process_status    – polls the background process via SSE and streams progress
* - check_process_data       – resumes an in-progress import on page reload via IndexedDB
*
* Data shapes consumed by this module:
*
* csv_files_list item (one entry per uploaded CSV file, returned by load_csv_files_list):
* {
*   name              : string   – filename, e.g. 'exported_oral-history_-1-oh1.csv'
*   dir               : string   – server-side directory path
*   n_records         : number   – number of data rows (excluding header)
*   n_columns         : number   – number of columns
*   file_info         : string[] – column names (first row of the CSV)
*   sample_data       : Array[]  – a few parsed rows for preview (each an array of cell values)
*   sample_data_errors: Object[] – JSON parse errors found in sample rows (empty if OK)
*   ar_columns_map    : Object[] – per-column map: { tipo, model, label, checked, map_to, decimal? }
*   section_tipo      : string   – auto-detected or user-supplied target section tipo (e.g. 'oh1')
*   section_label     : string   – resolved section label (set by render_columns_mapper)
*   bulk_process_label: string   – editable title for the bulk-process tracking record
*   checked           : boolean  – whether the file checkbox is selected for import
*   result_container  : HTMLElement – injected by render_file_info; render_final_report writes here
* }
*
* import_files API response (api_response inside fn_import .then):
* {
*   result : boolean | Array  – true when the background job was queued successfully;
*                               Array of per-file results when the job is complete
*   pid    : string           – process ID used to poll status via dd_utils_api::get_process_status
*   pfile  : string           – path to the process status file
* }
*/
export const render_tool_import_dedalo_csv = function() {

	return true
}//end render_tool_import_dedalo_csv



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_import_dedalo_csv.js'
* @param {Object} options
* @param {string} [options.render_level='full'] - 'full' builds the entire wrapper;
*   'content' rebuilds only the body (content_data) and re-attaches service_upload.
* @returns {HTMLElement} wrapper (full render) or content_data node (content render)
*/
render_tool_import_dedalo_csv.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			// Content-level refresh: edit() returns before the service_upload block below,
			// but refresh() already destroyed and rebuilt the service_upload dependency.
			// Re-attach the fresh instance to its persistent container so the drop/select
			// file zone keeps working after import or remove (otherwise it stays visible
			// but dead, as its drag & drop listeners were torn down on destroy).
			if (self.service_upload_container) {
				render_service_upload(self)
			}
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	// service_upload
		// Use the service_upload to get and render the button to upload the file,
		// get functionality defined (drag, drop, create folder, etc..)
		// service_upload_container
		const service_upload_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'service_upload_container'
		})
		wrapper.tool_header.after(service_upload_container)
		// store pointer to the persistent container so content-level refreshes can
		// re-attach the rebuilt service_upload instance (see render_service_upload)
		self.service_upload_container = service_upload_container
		// service_upload. Build and render into its container
		render_service_upload(self)


	return wrapper
}//end edit



/**
* RENDER_SERVICE_UPLOAD
* Builds and renders the service_upload (drop/select file) component into the
* persistent service_upload_container, replacing any previous node.
* Used both on the initial full render and on content-level refresh: refresh()
* destroys and rebuilds the service_upload dependency but edit() returns early
* for 'content' renders, so without re-rendering here the drop zone would stay
* visible yet dead (its drag & drop listeners removed on destroy).
* @param {Object} self - tool_import_dedalo_csv instance
* @returns {void}
*/
const render_service_upload = function(self) {

	const service_upload_container = self.service_upload_container
	if (!service_upload_container) {
		return
	}

	// clean previous node (refresh case)
		while (service_upload_container.firstChild) {
			service_upload_container.removeChild(service_upload_container.firstChild)
		}

	// spinner
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner',
			parent			: service_upload_container
		})

	// service_upload. Build and render
		self.service_upload.build()
		.then(function(){
			self.service_upload.render()
			.then(function(tool_upload_node){
				service_upload_container.appendChild(tool_upload_node)
				spinner.remove()
			})
		})
}//end render_service_upload



/**
* GET_CONTENT_DATA
* Builds and returns the main tool body as a content_data wrapper element.
*
* The content_data node contains:
*   - process_file    – transient upload-progress indicator (spinner + status text)
*   - user_msg_container – reserved for user-facing messages
*   - files_list      – one render_file_info card per uploaded CSV file
*   - submit_container – import button + time-machine checkbox
*   - process_info_container – SSE progress display (hidden until import starts)
*
* Also triggers check_process_data so that a previously-started import that was
* interrupted (e.g. page reload) is automatically resumed.
*
* @param {Object} self - tool_import_dedalo_csv instance
* @returns {Promise<HTMLElement>} content_data wrapper element
*/
const get_content_data = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// process_file
		const process_file = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_file',
			parent			: fragment
		})
		self.process_file = process_file

	// user_msg_container
		const user_msg_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'user_msg_container',
			parent			: fragment
		})
		self.user_msg_container = user_msg_container

	// files_list
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_list',
			parent			: fragment
		})
		const csv_files_list_length = self.csv_files_list.length
		for (let i = 0; i < csv_files_list_length; i++) {
			const item		= self.csv_files_list[i]
			const file_info	= render_file_info(self, item)
			files_list.appendChild(file_info)
		}

	// submit_container
		const submit_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'submit_container',
			parent			: fragment
		})

	// fn_import
		// Arrow function (not a method) capturing submit_container DOM references.
		// Validates that at least one file is checked, builds the files payload, and
		// calls self.import_files(). On success it starts the SSE progress poll.
		const fn_import = (e) => {
			e.stopPropagation()

			// selected files
				const selected_files = self.csv_files_list.filter(el => el.checked===true)
				if (selected_files.length<1) {
					// (!) alert() is intentional UI feedback here; not an error dialog.
					alert( self.get_tool_label('select_a_file') || 'Select a file');
					return
				}

			// loading
				// const loading_items = (SHOW_DEBUG === true)
				// 	? [content_data, process_info_container]
				// 	: [content_data]
				// loading_items.map((el)=>{
				// 	// el.classList.add('loading')
				// 	if (el.classList.contains('hide')) {
				// 		el.classList.remove('hide')
				// 	}
				// })

			// blur button
				document.activeElement.blur()

			// array of file names
				// Build the stripped-down file descriptor that the server expects.
				// ar_columns_map objects follow the shape: { tipo, model, label, checked, map_to, decimal? }
				const files = selected_files.map(el => {
					return {
						file				: el.name, // string like 'exported_oral-history_-1-oh1.csv'
						section_tipo		: el.section_tipo, // string like 'oh1'
						ar_columns_map		: el.ar_columns_map, // array of objects like [{checked: false, label: "", mapped_to: "", model: "", tipo: "section_id"}]
						bulk_process_label	: el.bulk_process_label // name of the process fired, it could be changed by user.
					}
				})

			// time_machine_save. Get current checked status
				const time_machine_save = checkbox_time_machine_save.checked

			// import_files
				self.import_files(files, time_machine_save)
				.then(function(api_response){
					if(SHOW_DEBUG===true) {
						console.log(')) import_files api_response:', api_response)
					}
					if(api_response.result===true){
						// fire update_process_status
						update_process_status({
							self					: self,
							pid						: api_response.pid,
							pfile					: api_response.pfile,
							button_submit			: import_button,
							process_info_container	: process_info_container
						})
					}
				})//end .then(function(api_response)
		}//end fn_import

	// import_button
		const import_button = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning import_button csv',
			inner_html		: self.get_tool_label('import') || 'Import',
			parent			: submit_container
		})
		import_button.addEventListener('click', fn_import)

	// checkbox_time_machine_save
		// Wrapping label + prepended checkbox — toggling saves a TM snapshot per imported row.
		// Defaults to checked so the import is always reversible unless the user opts out.
		const checkbox_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'checkbox_label',
			inner_html		: 'Save time machine history on import',
			parent			: submit_container
		})
		const checkbox_time_machine_save = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'checkbox_time_machine_save'
		})
		checkbox_time_machine_save.checked = 'checked' // default is checked
		checkbox_label.prepend(checkbox_time_machine_save)

	// process_info_container
		// Hidden until import_files returns a running pid; shown by update_process_status.
		const process_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'process_info_container hide',
			parent			: fragment
		})

	// check if the process is active
		check_process_data({
			self					: self,
			button_submit			: import_button,
			process_info_container	: process_info_container

		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_FILE_INFO
* Renders a single file card for one uploaded CSV file.
*
* Each card contains:
*   - A checkbox to select the file for import (toggles item.checked)
*   - An editable section_tipo input with live validation via update_section_warn()
*   - A delete button (calls self.remove_file + self.refresh)
*   - Record/column summary info text
*   - An editable bulk_process_label field
*   - A preview toggle showing raw sample_data or parse errors as <pre>
*   - A columns_mapper div populated asynchronously by render_columns_mapper()
*   - A result_container div written into later by render_final_report()
*
* The nested update_section_warn() is called immediately on construction and on
* every keyup in the section_tipo input. It validates the tipo, clears and
* rebuilds the columns_mapper, and updates section_label. On invalid input it
* shows a warning and focuses the input after a short delay.
*
* @param {Object} self - tool_import_dedalo_csv instance
* @param {Object} item - one entry from self.csv_files_list (shape documented in module header)
* @returns {HTMLElement} item_wrapper – the assembled card node
*/
const render_file_info = function(self, item) {

	const fragment = new DocumentFragment()

	// file_line
		const file_line = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_line',
			parent			: fragment
		})

		// icon file
			const button_csv = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button csv',
				parent			: file_line
			})

		// checkbox
			const checkbox_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'checkbox_label',
				inner_html		: item.name,
				parent			: file_line
			})
			const checkbox_file_selection = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.dir + '/' + item.name,
				class_name		: ''
			})
			checkbox_file_selection.addEventListener("change", function(){
				item.checked = checkbox_file_selection.checked ? true : false
				button_csv.classList.toggle('active')
				arrow_right.classList.toggle('active')
			})
			checkbox_label.prepend(checkbox_file_selection)

		// icon arrow_right >
			const arrow_right = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'icon arrow_right',
				parent			: file_line
			})

		// section_tipo
			// Auto-detect the section tipo from the filename suffix pattern:
			//   exported_<description>_<section_id>-<section_tipo>.csv
			// e.g. 'exported_oral-history_-1-oh1.csv' → section_tipo 'oh1'
			// Falls back to the caller's own tipo when the regex yields nothing.
			const regex			= /.*-([a-z0-9]{3,}) ?.*\.csv/g;
			const res			= regex.exec(item.name)
			let section_tipo	= (res && res[1]) ? res[1] : null
			// empty case. Fallback to current section caller tipo
			if (!section_tipo || !section_tipo.length) {
				section_tipo = self.caller.tipo
			}

			const section_tipo_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'section_tipo_label',
				inner_html		: 'section tipo',
				parent			: file_line
			})
			const input_section_tipo = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				value			: section_tipo,
				class_name		: 'input_section_tipo',
				parent			: section_tipo_label
			})
			item.section_tipo = section_tipo // assign to item
			input_section_tipo.addEventListener('keyup', function(){
				item.section_tipo = input_section_tipo.value // update item value
				update_section_warn()
			})
			function update_section_warn() {

				// clean columns_maper
				while (columns_maper.firstChild) {
					columns_maper.removeChild(columns_maper.firstChild);
				}

				// section_label reset
				section_label.textContent = ''

				// validate
				const valid_section_tipo = validate_tipo(item.section_tipo)
				if (!valid_section_tipo) {
					section_warn.classList.remove('hide')
					if (!item.section_tipo || !item.section_tipo.length) {
						// SEC-031: textContent prevents HTML injection from filename-derived section_tipo.
						section_warn.textContent = `The section tipo seems to be empty. Please, fill in the target section_tipo`
					}else{
						section_warn.textContent = `Auto-detected file name section tipo "${item.section_tipo}" seems to be invalid.`
					}
					setTimeout(function(){
						input_section_tipo.focus()
					}, 500)
				}else{
					section_warn.classList.add('hide')
					columns_maper.classList.add('loading')

					// render again columns_maper
					render_columns_mapper(self, item)
					.then(function(columns_list){
						while (columns_maper.firstChild) {
							columns_maper.removeChild(columns_maper.firstChild);
						}
						columns_maper.appendChild(columns_list)

						// section_label (SEC-031: textContent)
						section_label.textContent = item.section_label || ''

						bulk_process_label.value = self.context.label
						bulk_process_label.dispatchEvent(new Event('input'));

						columns_maper.classList.remove('loading')
					})
				}
			}//end update_section_warn

			// section_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'section_name',
					inner_html		: 'section name:',
					parent			: section_tipo_label
				})
				const section_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'section_label',
					inner_html		: item.section_label || 'XX',
					parent			: section_tipo_label
				})

		// icon delete
			const icon_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button delete',
				parent			: file_line
			})
			icon_delete.addEventListener('click', function(e){
				e.stopPropagation()

				if(confirm(self.get_tool_label('sure') || 'Sure?')) {
					// remove file
					self.remove_file(item)
					.then(function(){
						self.refresh()
					})
				}
			})

	// section_tipo input
		const section_warn = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'warning error hide',
			parent			: fragment
		})
		// update_section_warn()

	// info
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_container',
			parent			: fragment
		})
		// const info_text = `Records: ${item.n_records} - Columns: ${item.n_columns} - Header:<br><span class="columns">` + item.file_info.join(', ') + '</span>'
		const info_text = `${self.get_tool_label('records') || 'Records'}: ${item.n_records} - ${self.get_tool_label('Columns') || 'Columns'}: ${item.n_columns}`
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info_text',
			inner_html		: info_text,
			parent			: info_container
		})

		// updated by the render_columns_mapper
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'bulk_process_name_label',
			inner_html		: self.get_tool_label('bulk_process_title') || 'Process title: ',
			parent			: info_container
		})
		item.bulk_process_label = `${self.context.label} | ${item.section_tipo} | ${item.section_label}`
		const bulk_process_label = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'bulk_process_label input_section_tipo',
			value			: item.bulk_process_label,
			parent			: info_container
		})
		bulk_process_label.addEventListener('input', function(e){
			item.bulk_process_label = bulk_process_label.value
		})

	// preview
		const button_preview = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_preview info',
			inner_html		: self.get_tool_label('preview') || 'Preview',
			parent			: fragment
		})
		button_preview.addEventListener('click', function(e){
			e.stopPropagation()

			preview.classList.toggle('hide')
		})
		// preview text
		let preview
		if (item.sample_data_errors.length>0) {

			// errors found
			const text = JSON.stringify(item.sample_data_errors, null, 2)
			preview = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'preview error hide',
				inner_html		: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('error')
			// SEC-031: appendChild text node to avoid re-parsing existing button content as HTML.
			button_preview.appendChild(document.createTextNode('. ERROR: BAD JSON FORMAT'))

		}else{

			const text = JSON.stringify(item.sample_data, null, 2)
			preview = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'preview hide',
				inner_html		: text.replaceAll('<br>','\n'),
				parent			: fragment
			})
			button_preview.classList.add('ok')
		}

	// columns_mapper
		const columns_maper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_mapper',
			parent			: fragment
		})

	// result_container
		const result_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'result_container',
			parent			: fragment
		})
		item.result_container = result_container

	// item_wrapper
		const item_wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'file_item'
		})
		item_wrapper.appendChild(fragment)

	// update_section_warn first time
		update_section_warn()


	return item_wrapper
}//end render_file_info



/**
* RENDER_COLUMNS_MAPPER
* Async; fetches the importable component list for the given section tipo from
* the server and renders a column-mapping table row for every column in the CSV.
*
* Each row shows:
*   - The original column name from the CSV header
*   - Server-detected model (e.g. 'component_text_area') and label
*   - A checked checkbox (auto-ticked when column name matches a component tipo)
*   - A <select> of available target components — auto-selects the matching entry
*   - (optional) A decimal-separator selector when the mapped component is component_number
*   - A sample data cell with the first non-empty value from item.sample_data
*
* The function writes back into item.ar_columns_map[i] and item.section_label.
*
* Special column names that bypass the tipo-split heuristic and are matched directly:
*   'section_id', 'created_date', 'modified_date', 'created_by_user', 'modified_by_user'
*
* For all other columns the column name is split on '_' and the first token is used
* as the candidate component tipo.
*
* A collapsible toggle is attached to the header via ui.collapse_toggle_track so
* the mapper body can be expanded/collapsed by the user.
*
* @param {Object} self - tool_import_dedalo_csv instance
* @param {Object} item - one entry from self.csv_files_list (shape documented in module header)
* @returns {Promise<DocumentFragment>} fragment containing the full columns-mapper UI
*/
const render_columns_mapper = async function(self, item) {

	// short vars
		const file_info					= item.file_info // array of columns name (first row of csv file)
		const section_tipo				= item.section_tipo
		const section_components_list	= await self.get_section_components_list(section_tipo)
		const section_label				= section_components_list.label
		const ar_components				= section_components_list.list
		const ar_columns_map			= item.ar_columns_map

	const fragment = new DocumentFragment()

	// update item section_label
		item.section_label = section_label

	// no results case
		if (!ar_components) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'warning error',
				inner_html		: section_components_list.msg,
				parent			: fragment
			})

			return fragment
		}

	// check section_id column exists
		// TOOLS-07: the listing response no longer ships the full parsed 'data';
		// the first row (header / column names) is file_info (server: (array)$ar_data[0]).
		const first_row				= file_info
		const columns_section_id	= first_row
			? first_row.find(el => el==='section_id')
			: null
		if (!columns_section_id) {
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'container error',
				inner_html		: 'Error. Column section_id is mandatory in the first row of csv file!',
				parent			: fragment
			})
		}

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_header icon_arrow',
			inner_html		: 'Columns mapper: <b>' + section_label + '</b>',
			parent			: fragment
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'columns_body',
			parent			: fragment
		})

	// columns names
		// line
			const line = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'columns_mapper_line names',
				parent			: body
			})
			// ui.create_dom_element({
			// 	element_type	: 'div',
			// 	inner_html		: 'Position',
			// 	parent			: line
			// })
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Name',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Model',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Label',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Selected',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Mapped to',
				parent			: line
			})
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: 'Sample data',
				parent			: line
			})

	// columns value
		const file_info_length = file_info.length
		for (let i = 0; i < file_info_length; i++) {

			const column_name = file_info[i]

			// line
				const line = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'columns_mapper_line',
					parent			: body
				})

			// original position
				// 	const position = ui.create_dom_element({
				// 		element_type	: 'div',
				// 		class_name		: 'position',
				// 		// text_content	: i,
				// 		parent			: line
				// 	})
				// 	position.textContent = i

			// column_name (original in csv document)
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_name',
					inner_html		: column_name,
					parent			: line
				})

			// column_info detected model
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_info',
					inner_html		: item.ar_columns_map[i].model,
					parent			: line
				})

			// column_info detected label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'column_info',
					inner_html		: item.ar_columns_map[i].label,
					parent			: line
				})

			// selected checkbox
				const checkbox_file_selection = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					value			: i,
					parent			: line
				})
				checkbox_file_selection.addEventListener('change', function(){
					ar_columns_map[i].checked = checkbox_file_selection.checked
				})

			// target component list selector

				// container
				const target_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'target_container',
					parent			: line
				})
				// components list selector
				const target_select = ui.create_dom_element({
					element_type	: 'select',
					class_name		: 'column_select',
					inner_html		: column_name,
					parent			: target_container
				})
				// empty option
				ui.create_dom_element({
					element_type	: 'option',
					value			: '',
					parent			: target_select
				})
				// check if the column_name has specific name
				// else split the column name to get the identifier (oh25_oh1)
				const ar_identifier = (
						(column_name==='section_id')
						|| (column_name==='created_date')
						|| (column_name==='modified_date')
						|| (column_name==='created_by_user')
						|| (column_name==='modified_by_user')
					)
					? [column_name]
					: column_name.split('_')
				// in any case use the first element in the array, it could be specific name or the component_tipo
				const column_component_tipo	= ar_identifier[0]
				const ar_components_lenght	= ar_components.length
				for (let k = 0; k < ar_components_lenght; k++) {

					const option = ui.create_dom_element({
						element_type	: 'option',
						value			: ar_components[k].value,
						inner_html		: ar_components[k].label + ' [' + ar_components[k].value + ' - '+ ar_components[k].model +']',
						parent			: target_select
					})
					// assign the model to the option to be obtained by the the event
					option.model = ar_components[k].model

					// selected options set on match
					if ( ar_components[k].value===column_component_tipo ||
						(column_component_tipo==='section_id' && ar_components[k].model==='component_section_id')) {
						option.selected = true
						// checkbox_file_selection update
						checkbox_file_selection.checked = true

						// update ar_columns_map object
						ar_columns_map[i].checked	= true
						ar_columns_map[i].map_to	= ar_components[k].value
					}

					// in any case the column_name will be the csv column name as user has specify
					ar_columns_map[i].column_name	= column_name
				}
				target_select.addEventListener('change', function(e){
					// checkbox_file_selection update
					if (e.target.value && e.target.value.length>0) {
						checkbox_file_selection.checked = true
					}else{
						checkbox_file_selection.checked = false
					}

					// update ar_columns_map object
					const model = e.target.options[e.target.selectedIndex].model
					ar_columns_map[i].checked	= checkbox_file_selection.checked
					ar_columns_map[i].map_to	= e.target.value
					ar_columns_map[i].model		= model

					// empty container
						while (mapped_to_options_container.firstChild) {
							mapped_to_options_container.removeChild(mapped_to_options_container.firstChild);
						}
					// delete decimal property
						delete ar_columns_map[i].decimal

					// if the component selected is a component_number, add the decimal selector
						if(model === 'component_number'){
							render_decimal_selector({
								i			: i,
								container	: mapped_to_options_container
							})
						}
				})

				const mapped_to_options_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'mapped_to_options_container',
					parent			: target_container
				})

				// if the component selected is a component_number, add the decimal selector
				if(ar_columns_map[i].model === 'component_number'){
					render_decimal_selector({
						i			: i,
						container	: mapped_to_options_container
					})
				}

			// sample_data (search non empty values)
				// Walk sample rows to find the first non-empty value for this column position,
				// giving the user a concrete example of what the CSV contains.
				let sample_data = ''
				const item_sample_data_length = item.sample_data.length
				for (let j = 0; j < item_sample_data_length; j++) {
					const sd = item.sample_data[j][i]
					if (sd && sd.length>0) {
						sample_data = sd
						break;
					}
				}
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'sample_data',
					inner_html		: sample_data,
					parent			: line
				})
		}//end for (let i = 0; i < file_info_length; i++)

	// collapse_toggle_track
		// Attaches expand/collapse behaviour to the mapper header; state is persisted
		// under the key 'collapsed_<section_tipo>' so the user's preference survives refreshes.
		ui.collapse_toggle_track({
			toggler				: header,
			container			: body,
			collapsed_id		: 'collapsed_' + item.section_tipo,
			collapse_callback	: collapse,
			expose_callback		: expose
		})
		function collapse() {
			header.classList.remove('up')
		}
		function expose() {
			header.classList.add('up')
		}

	// render the decimal node selector
		// Inline helper: builds a point/comma decimal-separator select inside `container`
		// and keeps ar_columns_map[i].decimal in sync.
		function render_decimal_selector(options){

			const i			= options.i
			const container	= options.container

			const column_name	= self.get_tool_label('decimal') || 'Decimal'
			const point_name	= self.get_tool_label('point_name') || 'Point'
			const comma_name	= self.get_tool_label('comma_name') || 'Comma'

			const decimal_label = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'decimal_label',
				inner_html 		: column_name,
				parent			: container
			})

			const decimal_select = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'decimal_select',
				parent			: container
			})
			// empty option
			const point_option = ui.create_dom_element({
				element_type	: 'option',
				value			: '.',
				inner_html 		: point_name + ': .',
				parent			: decimal_select
			})
			point_option.checked = true

			ui.create_dom_element({
				element_type	: 'option',
				value			: ',',
				inner_html 		: comma_name + ': ,',
				parent			: decimal_select
			})
			ar_columns_map[i].decimal	= decimal_select.value

			decimal_select.addEventListener('change', function(e) {
				ar_columns_map[i].decimal	= decimal_select.value
			})
		}


	return fragment
}//end render_columns_mapper



/**
* UPLOAD_DONE
* Called on service_upload has finished of upload file using a event
* @see event subscription at 'init' function
*
* Triggered by the 'upload_file_done_<id>' event that service_upload fires after
* the file has been sent to the server. This method:
*   1. Clears the process_file area and shows a spinner.
*   2. Calls self.process_uploaded_file() to move the temp file to its permanent path.
*   3. On success calls self.refresh() to reload the file list; on failure shows the error.
*
* @param {Object} options
* @param {Object} options.file_data - upload metadata from service_upload:
*   { error, extension, name, size, tmp_name, type }
* @returns {Promise<boolean>} resolves true once the processing request is sent
*/
render_tool_import_dedalo_csv.prototype.upload_done = async function (options) {

	const self = this

	// options
		const file_data = options.file_data

	// process_file loading
		while (self.process_file.firstChild) {
			self.process_file.removeChild(self.process_file.firstChild);
		}
		const spinner = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'spinner',
			parent			: self.process_file
		})
		const process_file_info = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: 'Processing file..',
			class_name		: 'info',
			parent			: self.process_file
		})
		self.process_file.appendChild(spinner)

	// process uploaded file (move temp uploaded file to definitive location and name)
		self.process_uploaded_file(file_data)
		.then(function(response) {

			spinner.remove()

			// process_file remove info loading
			if (!response.result) {
				// error case (SEC-031)
				process_file_info.textContent = response.msg || 'Error on processing file!'

			}else{
				// OK case (SEC-031)
				process_file_info.textContent = response.msg || 'Processing file done successfully.'

				// self update (forces update list of files)
					self.refresh()
			}
		})


	return true
}//end upload_done



/**
* RENDER_FINAL_REPORT
* Called on import process has finished to render the final report
*
* Iterates api_response.result in reverse order (newest file first) and, for
* each result entry, locates the matching result_container set on the item by
* render_file_info. Inside it renders:
*   - An OK/Error alert badge
*   - A human-readable message from the server
*   - (debug only) dedalo_last_error if the server logged PHP errors
*   - Sections for failed_rows, warning_rows, created_rows, and updated_rows,
*     each with "Copy as comma separated" and "Copy as column" clipboard buttons.
*
* Failed rows contain: { section_id, component_tipo, msg, data }
* Warning rows contain: { section_id, component_tipo, msg, data }
* Created rows: section_id[] (plain integers)
* Updated rows: section_id[] (plain integers)
*
* (!) navigator.clipboard is only available in secure contexts (HTTPS); the
* updated_rows copy buttons guard for this via !navigator.clipboard. Earlier
* copy buttons in failed/created row blocks do NOT guard for this, which may
* cause silent failures on HTTP deployments.
*
* @param {Object} options
* @param {Object} options.self - tool_import_dedalo_csv instance
* @param {Object} options.api_response - final process data:
*   {
*     result              : Array of per-file result objects,
*     dedalo_last_error   : string|null
*   }
*   Each per-file result object:
*   {
*     result        : boolean,
*     file          : string,
*     section_tipo  : string,
*     msg           : string,
*     failed_rows   : { section_id, component_tipo, msg, data }[],
*     warning_rows  : { section_id, component_tipo, msg, data }[],
*     created_rows  : number[],
*     updated_rows  : number[]
*   }
* @param {HTMLElement} options.process_info_container - the SSE progress container
* @returns {void}
*/
const render_final_report = function(options){

	const self						= options.self
	const api_response				= options.api_response
	const process_info_container	= options.process_info_container

	if (!api_response || !api_response.result) {
		console.error('Invalid API response result:', api_response);
		return
	}

	const selected_files = self.csv_files_list //.filter(el => el.checked===true)
	const result_len = api_response.result.length
	for (let i = result_len - 1; i >= 0; i--) {

		const current_rensponse	= api_response.result[i]
		const current_file		= selected_files.find(el =>
			el.name === current_rensponse.file && el.section_tipo === current_rensponse.section_tipo
		)

		const result_container = current_file?.result_container || null
		if(result_container) {

			// clean container
				while (result_container.firstChild) {
					result_container.removeChild(result_container.firstChild)
				}

			// response_msg. OK/Error message
				const message_class	= current_rensponse.result ? 'success' : 'danger'
				const message_label	= current_rensponse.result
					? self.get_tool_label('ok') || 'OK'
					: self.get_tool_label('error') || 'Error'
				const response_msg = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'response_msg alert ' + message_class,
					inner_html		: message_label,
					parent			: result_container
				})

			// msg_container
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'user_msg_container',
					inner_html		: current_rensponse.msg,
					parent			: result_container
				})

			// dedalo_last_error. server errors (debug only)
				if (api_response.dedalo_last_error) {
					const dedalo_last_error_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'dedalo_last_error_container',
						inner_html		: 'Imported with errors:',
						parent			: result_container
					})
					ui.create_dom_element({
						element_type	: 'pre',
						class_name		: 'error_pre',
						inner_html		: api_response.dedalo_last_error,
						parent			: dedalo_last_error_container
					})
					if (response_msg.classList.contains('success')) {
						response_msg.classList.add('warning_text')
						response_msg.insertAdjacentHTML('beforeend', ' - Warning ')
					}
				}

			// result_info_container
				const result_info_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'result_info_container',
					parent			: result_container
				})


			if(current_rensponse.result) {

				// failed_rows info
					if(current_rensponse.failed_rows.length>0) {

						const failed_rows = current_rensponse.failed_rows

						const header = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'header',
							parent			: result_info_container
						})

						const created_label = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'label',
							inner_html		: self.get_tool_label('failed') || 'Failed' + ':',
							parent			: header
						})

						// copy_to_find_button
							const copy_to_find_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_to_find') || 'Copy as comma separated',
								parent			: header
							})
							copy_to_find_button.addEventListener( 'click', (e) => {
								e.stopPropagation()

								const failed_section_id = current_rensponse.failed_rows.map(el => el.section_id)

								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{
									navigator.clipboard.writeText(failed_section_id.join(','))
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						// copy_as_column_button
							const copy_as_column_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_as_column') || 'Copy as column',
								parent			: header
							})
							copy_as_column_button.addEventListener( 'click', (e) => {
								e.stopPropagation()

								const failed_section_id = current_rensponse.failed_rows.map(el => el.section_id)
								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{
									navigator.clipboard.writeText(failed_section_id.join('\n'))
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						const failed_rows_len = failed_rows.length
						for (let g = 0; g < failed_rows_len; g++) {

							const failed = failed_rows[g]

							const failed_id = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'failed_container error',
								inner_html		: failed.section_id +' | '+failed.component_tipo + ' | ' +failed.msg,
								parent			: result_info_container
							})

							const failed_data = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'failed_data_container error',
								inner_html		: JSON.stringify( failed.data ),
								parent			: result_info_container
							})
						}
					}//end if(current_rensponse.failed_rows.length>0)

				// warning_rows info. Non fatal: data was imported but needs user attention
					const warning_rows = current_rensponse.warning_rows || []
					if(warning_rows.length>0) {

						const header = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'header',
							parent			: result_info_container
						})

						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'label',
							inner_html		: self.get_tool_label('warnings') || 'Warnings' + ':',
							parent			: header
						})

						const warning_rows_len = warning_rows.length
						for (let g = 0; g < warning_rows_len; g++) {

							const warning = warning_rows[g]

							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'failed_container warning',
								inner_html		: warning.section_id +' | '+warning.component_tipo + ' | ' +warning.msg,
								parent			: result_info_container
							})

							ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'failed_data_container warning',
								inner_html		: JSON.stringify( warning.data ),
								parent			: result_info_container
							})
						}
					}//end if(warning_rows.length>0)

				// created_rows info
					if(current_rensponse.created_rows.length>0) {

						// header
							const header = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'header',
								parent			: result_info_container
							})

						// created_label
							const created_label = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'label',
								inner_html		: self.get_tool_label('created') || 'Created' + ':',
								parent			: header
							})

						// copy_to_find_button
							const copy_to_find_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_to_find') || 'Copy as comma separated',
								parent			: header
							})
							copy_to_find_button.addEventListener('click', (e) => {
								e.stopPropagation()

								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{
									navigator.clipboard.writeText(current_rensponse.created_rows.join(','))
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						// copy_as_column_button
							const copy_as_column_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_as_column') || 'Copy as column',
								parent			: header
							})
							copy_as_column_button.addEventListener( 'click', (e) => {
								e.stopPropagation()

								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{
									navigator.clipboard.writeText(current_rensponse.created_rows.join('\n'))
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						// created_rows
							const created_rows = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'section_id_container',
								inner_html		: current_rensponse.created_rows.join('<br>'),
								parent			: result_info_container
							})
					}//end if(current_rensponse.created_rows.length>0)

				// updated_rows info
					if(current_rensponse.updated_rows.length>0) {

						// header
							const header = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'header',
								parent			: result_info_container
							})

						// updated_label
							const updated_label = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'label',
								inner_html		: self.get_tool_label('updated') || 'Updated' + ':',
								parent			: header
							})

						// copy_to_find_button
							const copy_to_find_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_to_find') || 'Copy as comma separated',
								parent			: header
							})
							copy_to_find_button.addEventListener('click', (e) => {
								e.stopPropagation()

								const clipboard_data = current_rensponse.updated_rows.join(',')
								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{

									navigator.clipboard.writeText(clipboard_data)
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						// copy_as_column_button
							const copy_as_column_button = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning copy_button copy',
								inner_html		: self.get_tool_label('copy_as_column') || 'Copy as column',
								parent			: header
							})
							copy_as_column_button.addEventListener('click', (e) => {
								e.stopPropagation()

								if(!navigator.clipboard){
									const insecure_label = self.get_tool_label('insecure_context') || 'Insecure context, used only in https'
									alert(insecure_label);
								}else{
									const clipboard_data = current_rensponse.updated_rows.join('\n')
									navigator.clipboard.writeText(clipboard_data)
									.then(() => {
										const text_copied = self.get_tool_label('text_copied') || 'Text copied to clipboard'
										alert(text_copied);
									})
									.catch(err => {
										const error_coping_text = self.get_tool_label('error_coping_text') || 'Error in copying text: '
										alert(error_coping_text, err);
									});
								}
							})

						// updated_rows
							const updated_rows = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'section_id_container',
								inner_html		: current_rensponse.updated_rows.join('<br>'),
								parent			: result_info_container
							})
					}//end if(current_rensponse.updated_rows.length>0)
			}//end if(current_rensponse.result)
		}//end if(result_container)
	}//end for (let i = result_len - 1; i >= 0; i--)
}//end render_final_report



/**
* UPDATE_PROCESS_STATUS
* Opens an SSE stream to dd_utils_api::get_process_status and streams live
* progress into process_info_container until the background import finishes.
*
* Flow:
*   1. Locks the submit button (adds 'loading' class) and reveals process_info_container.
*   2. Calls data_manager.request_stream() with the pid/pfile pair from the
*      import_files API response to start the SSE feed.
*   3. For each SSE chunk (on_read): builds/updates a msg_node inside info_node
*      showing current file, section_id, component label, and elapsed time.
*      When is_running===false the final chunk carries the complete per-file
*      results, which are handed to render_final_report().
*   4. When the stream closes (on_done): unlocks the submit button.
*
* The PID and pfile are also persisted in IndexedDB (by render_stream /
* data_manager.set_local_db_data) so that check_process_data can resume
* polling after a page reload.
*
* (!) get_label is used directly (not self.get_tool_label) for 'proceso_completado'
* — this is the global page label map, not the tool label map. Ensure the key
* exists in the active locale.
*
* @param {Object} options
* @param {Object} options.self - tool_import_dedalo_csv instance
* @param {string} options.pid - process ID from the import_files API response
* @param {string} options.pfile - process file path from the import_files API response
* @param {HTMLElement} options.button_submit - the import button (locked during processing)
* @param {HTMLElement} options.process_info_container - SSE progress display node
* @returns {void}
*/
const update_process_status = (options) => {

	// options
		const self						= options.self
		const pid						= options.pid
		const pfile						= options.pfile
		const button_submit				= options.button_submit
		const process_info_container	= options.process_info_container

	// button_submit. locks the submit button
		button_submit.classList.add('loading')
		if (process_info_container.classList.contains('hide')) {
			process_info_container.classList.remove('hide')
		}

	// get_process_status from API and returns a SEE stream
	data_manager.request_stream({
		body : {
			dd_api		: 'dd_utils_api',
			action		: 'get_process_status',
			update_rate	: 1000, // int milliseconds
			options		: {
				pid		: pid,
				pfile	: pfile
			}
		}
	})
	.then(function(stream){

		// render base nodes and set functions to manage
		// the stream reader events
		const render_response = render_stream({
			container				: process_info_container,
			id						: 'process_import_dedalo_csv',
			pid						: pid,
			pfile					: pfile,
			delete_local_db_data	: false
		})

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {
			// fire update_info_node (in render response function in render_common) on every reader read chunk
			render_response.update_info_node(sse_response, (info_node) =>{

				const data = sse_response.data || {}

				// build msg_node once and attach it to the info_node container
					if(!info_node.msg_node) {
						info_node.msg_node = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'msg_node',
							parent			: info_node
						})
					}

				// finished process case
				if(sse_response.is_running===false){

					const msg_end = [(get_label.proceso_completado || 'Process completed') + ' ' + sse_response.total_time]

					// update text content only
					ui.update_node_content(info_node.msg_node, msg_end)

					// errors
					const errors = data.errors && data.errors.length
						? data.errors
						: null
					// errors found case
					if(errors){
						// add errors. Note that on running == false, the last message is not printed
						const msg_error = (get_label.error || 'Error') +': '+ errors.join(' | ') +'<br>'+ data.msg
						ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'error',
							inner_html		: msg_error,
							parent			: info_node.msg_node
						})
					}

					// print final_report into process_info_container
					render_final_report({
						self					: self,
						api_response			: data,
						process_info_container	: process_info_container
					})

					// activate button_submit
					button_submit.classList.remove('loading')

					// stop execution here
					return
				}

				// msg
					// Assemble a pipe-separated progress line from whatever the server included
					// in this chunk. Not all fields are present on every tick.
					const ar_msg = []

					if(data.current_file && data.current_file.length){
						ar_msg.push(`${data.msg}: ${data.current_file}`)
					}else{
						ar_msg.push(data.msg)
					}
					if(data.section_id)	ar_msg.push(`id: ${data.section_id}`)
					if(data.compomnent_label) ar_msg.push(data.compomnent_label)
					if(sse_response.time) ar_msg.push(sse_response.total_time)

					const msg = ar_msg.join(' | ')

					// update text content only
					ui.update_node_content(info_node.msg_node, msg)
			})
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {
			// is triggered at the reader's closing
			render_response.done()
			// unlocks the button submit
			button_submit.classList.remove('loading')
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)
	})
}//end update_process_status



/**
* CHECK_PROCESS_DATA
* Checks IndexedDB for a previously-started import process and resumes
* status polling if one is found.
*
* Called once during get_content_data() construction. If a 'status' record
* exists under 'process_import_dedalo_csv' in the local DB (written by
* render_stream when the previous import was started), update_process_status
* is called with the stored pid and pfile so the user sees live progress
* without having to manually re-trigger the import.
*
* This handles the common case of a page reload while an import is running
* in the background — the background process continues on the server, and
* the UI reconnects to its SSE feed transparently.
*
* @param {Object} options
* @param {Object} options.self - tool_import_dedalo_csv instance
* @param {HTMLElement} options.button_submit - import button (will be locked while polling)
* @param {HTMLElement} options.process_info_container - SSE progress display node
* @returns {void}
*/
const check_process_data = (options) => {

	// options
		const self						= options.self
		const process_info_container	= options.process_info_container
		const button_submit				= options.button_submit


	data_manager.get_local_db_data(
		'process_import_dedalo_csv',
		'status'
	)
	.then(function(local_data){
		if (local_data && local_data.value) {
			update_process_status({
				pid						: local_data.value.pid,
				pfile					: local_data.value.pfile,
				process_info_container	: process_info_container,
				button_submit			: button_submit,
				self 					: self

			})
		}
	})
}//end check_process_data



// @license-end
