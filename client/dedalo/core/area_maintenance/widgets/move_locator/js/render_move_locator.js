/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {init_move_transform_form} from '../../../js/move_transform.js'
	import {data_manager} from '../../../../common/js/data_manager.js'

	// hljs
	import hljs from '../../../../../lib/highlightjs/es/core.min.js';
	import json from '../../../../../lib/highlightjs/es/languages/json.min.js';
	hljs.registerLanguage('json', json);



/**
* RENDER_MOVE_LOCATOR
* Client-side render module for the move_locator maintenance widget.
*
* This widget lets a maintenance administrator apply a JSON-defined locator
* transformation map across every Dédalo matrix table (matrix, matrix_activities,
* matrix_dataframe, matrix_time_machine, …). The map replaces all occurrences of
* a source section_tipo (e.g. rsc194) with a target section_tipo (e.g. rsc197),
* re-keying section_ids relative to the highest existing section_id in the target.
*
* Responsibilities:
*   - Display a human-readable description of the operation (from server value.body).
*   - Scan /dedalo/core/base/transform_definition_files/move_locator/ for available
*     JSON definition files (supplied by class.area_maintenance::get_definitions_files).
*   - Render each definition file as a checkbox + collapsible syntax-highlighted
*     JSON preview using highlight.js.
*   - Wire the shared move_* run flow (init_move_transform_form, move_transform.js):
*     PREVIEW (dry run) job first, then Execute of exactly the previewed files.
*   - On widget mount, re-attach any in-progress process found in IndexedDB so the
*     user can re-open the widget and still see live progress.
*
* The module is a prototype-based class whose `list` method is assigned to both
* `move_locator.prototype.edit` and `move_locator.prototype.list` in move_locator.js.
*
* Widget value shape (provided by class.move_locator::get_value):
* ```json
* {
*   "body"  : "<string> HTML description of the operation",
*   "files" : [
*     { "file_name": "finds_numisdata279_to_tchi1.json", "content": { ... } },
*     ...
*   ]
* }
* ```
*
* Process response shape (from move_locator::exec_move_locator):
* ```json
* { "pid": "12345", "pfile": "/tmp/process_move_locator.status" }
* ```
* Both `pid` and `pfile` are passed directly to `update_process_status` which
* opens an SSE stream and renders live progress into `body_response`.
*
* Exports:
*   render_move_locator — constructor (prototype-based class)
*/
export const render_move_locator = function() {

	return true
}//end render_move_locator



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param {Object} options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @returns {Promise<HTMLElement>} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_move_locator.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* Assembles the full content area for the widget's edit/list view.
*
* Reads `self.value` (populated from class.move_locator::get_value) and builds:
*   1. An info panel (`div.info_text`) showing the HTML description in `value.body`.
*   2. A file list (`div.files_list`) with one row per available definition file.
*      Each row provides:
*        - A checkbox to include the file in the batch (`files_selected` array).
*        - An expand/collapse arrow to preview the file's parsed JSON content,
*          rendered with highlight.js syntax highlighting.
*      Collapsible state is persisted via `ui.collapse_toggle_track` (IndexedDB).
*   3. The shared move_* run flow (`init_move_transform_form`): the submit runs
*      the PREVIEW (dry run) job, a clean preview reveals the Execute control
*      (dry_run:false on the previewed files, after a confirm); each job's
*      `{ pid, pfile }` is streamed into `body_response`.
*   4. An on-mount check (`check_process_data`) that reads IndexedDB for a
*      previously stored PID under the key `'process_move_locator'` / `'status'`.
*      If found, re-attaches `update_process_status` so the user sees progress
*      after a page reload or widget re-open without having to resubmit.
*
* `files_selected` is a closure-scoped array that accumulates file_name strings
* as checkboxes are toggled. It is read on form submit — not re-derived from the
* DOM — so unchecking a box splices the entry out immediately.
*
* (!) The `files_selected` array is NOT reset between form submissions. If the
* user submits, then unchecks and re-checks files without reloading the widget,
* duplicate entries could accumulate in the array. This is pre-existing behaviour.
*
* (!) `self.caller?.init_form` is called with optional-chaining, so if the widget
* is rendered outside of area_maintenance (no caller), the form is silently omitted
* and no submission button is shown. This is pre-existing behaviour.
*
* (!) On submit validation uses `alert()` (native browser dialog) rather than an
* inline validation message. In iframe environments or strict CSPs this may be
* suppressed. This is pre-existing behaviour.
*
* @param {Object} self - Widget instance (move_locator). Must expose:
*   - self.value          {Object}   — widget value with `body` and `files` arrays
*   - self.caller         {Object}   — parent area_maintenance instance owning init_form
*   - self.exec_move_locator {Function} — async method that fires the API request
* @returns {Promise<HTMLElement>} The assembled `<div>` content node containing
*   the info panel, file list, submission form, and process-status response area
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const body			= value.body
		const files			= value.files || []
		const local_db_id	= 'process_move_locator'

	// files sort
		// Sort definition files alphabetically by file_name so the list is stable
		// regardless of filesystem ordering (which varies by OS and filesystem type).
		files.sort((a, b) => new Intl.Collator().compare(a.file_name, b.file_name));

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div',
			class_name	 : 'content_data'
		})

	// info
		// Renders the server-provided HTML description of what this operation does.
		// `body` is the multi-line string set in class.move_locator::get_value.
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// files_list
		// The files_list div holds one .file_container row per definition file.
		// files_selected accumulates file_name strings as checkboxes are checked/unchecked;
		// it is read by the on_submit callback to build the API request payload.
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_list',
			parent			: content_data
		})
		const files_selected = []
		const files_length = files.length
		for (let i = 0; i < files_length; i++) {

			const item = files[i]

			// file_container
			const file_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_container',
				parent			: files_list
			})

			// label
			// The <label> wraps both the checkbox and the file name text so clicking
			// anywhere on the label text also toggles the checkbox.
			const input_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label',
				text_content	: String(item.file_name ?? ''),
				parent			: file_container
			})

			// input radio button
			// Despite the variable name, this is a checkbox — radio would force a
			// single selection, but users may apply multiple definition files in one run.
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.file_name,
				name			: 'files_list'
			})
			input_label.prepend(input)
			input.addEventListener('change', function(e) {
				// Toggle only the affected label so every checked row keeps its
				// 'selected' highlight (do not clear the highlight on sibling rows).
				if (input.checked) {
					// Push the file name into the accumulator and highlight the label.
					files_selected.push(item.file_name)
					input_label.classList.add('selected')
				}else{
					// Remove from accumulator on uncheck. indexOf/splice are O(n)
					// but the number of definition files is tiny (typically < 20).
					const index = files_selected.indexOf(item.file_name);
					if (index !== -1) {
						files_selected.splice(index, 1);
					}
					input_label.classList.remove('selected')
				}
			})

			// show_file_content (arrow)
			// Toggle button that reveals/hides the JSON preview for this file.
			// 'icon_arrow' provides the CSS chevron indicator; the 'up' class
			// rotates the chevron when the panel is expanded.
			const show_file_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'show_file_content icon_arrow',
				inner_html		: 'File contents',
				parent			: file_container
			})

			// file_content_container
			// The raw JSON is pretty-printed with JSON.stringify then highlighted
			// in-place by hljs.highlightElement. The 'hide' class keeps it
			// collapsed until the user clicks show_file_content.
			const content_string = JSON.stringify(item.content, null, 2)
			const file_content_container = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'highlighted_code file_content_container language-json hide',
				text_content	: content_string,
				parent			: file_container
			})
			// collapse file_content
			// Persist the open/closed state per file in IndexedDB so the panel
			// position survives a widget re-render or page reload.
			ui.collapse_toggle_track({
				toggler				: show_file_content,
				container			: file_content_container,
				collapsed_id		: 'collapsed_move_locator_file_'+item.file_name,
				collapse_callback	: () => {
					show_file_content.classList.remove('up')
				},
				expose_callback		: () => {
					show_file_content.classList.add('up')
				},
				default_state : 'closed'
			})
			// highlight element
			// Apply highlight.js JSON syntax colouring to the pre element.
			// Called after the element is in the DOM so hljs can inspect its text.
			hljs.highlightElement(file_content_container);
		}

	// body_response
		// Container where update_process_status renders the SSE progress stream.
		// Appended at the end of content_data so it appears below the form.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// PREVIEW (dry run) first, then EXECUTE exactly the previewed selection —
		// the one run flow of the five move_* widgets (move_transform.js). Both runs
		// are server jobs answering {pid, pfile}; their streams render in body_response.
		init_move_transform_form(self, {
			model			: 'move_locator',
			submit_label	: 'Move locators',
			files_selected	: files_selected,
			content_data	: content_data,
			body_response	: body_response,
			local_db_id		: local_db_id
		})

	// check process status always
		// On widget mount, check IndexedDB for a PID stored by a previous submission.
		// If one is found, re-attach the SSE stream so the user sees live progress
		// without having to press the button again (e.g. after a page reload).
		const check_process_data = () => {
			data_manager.get_local_db_data(
				local_db_id,
				'status'
			)
			.then(function(local_data){
				if (local_data && local_data.value) {
					update_process_status(
						local_db_id,
						local_data.value.pid,
						local_data.value.pfile,
						body_response
					)
				}
			})
		}
		check_process_data()


	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
