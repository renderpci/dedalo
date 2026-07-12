/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'

	// hljs
	import hljs from '../../../../../lib/highlightjs/es/core.min.js';
	import json from '../../../../../lib/highlightjs/es/languages/json.min.js';
	hljs.registerLanguage('json', json);



/**
* RENDER_MOVE_TLD
* Client-side render module for the move_tld maintenance widget.
*
* Builds the UI that lets a maintenance operator select one or more
* JSON definition files (located in
* /dedalo/core/base/transform_definition_files/move_tld/) and launch the
* background "Move TLD" process, which walks every matrix_* table and
* replaces old tipo identifiers with their new counterparts according to
* the mapping declared in each file.
*
* The constructor is an intentional no-op; all rendering is done through
* prototype methods that are wired into the move_tld widget lifecycle by
* move_tld.js (`move_tld.prototype.list = render_move_tld.prototype.list`).
*
* Main export: {render_move_tld} — prototype constructor, extended by list().
*/
export const render_move_tld = function() {

	return true
}//end render_move_tld



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
* @returns {HTMLElement} wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_move_tld.prototype.list = async function(options) {

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
* Builds the full interactive content area for the move_tld widget.
*
* Responsibilities:
* - Renders an info paragraph (from `self.value.body`) describing the operation.
* - Renders a checkbox list of available JSON definition files. Each file row
*   includes a collapsible syntax-highlighted preview of its JSON content.
* - Maintains the `files_selected` array in closure scope; checkboxes push to
*   or splice from it on change.
* - Wires the submit form (via `self.caller.init_form`) so that clicking
*   "Move TLD terms" fires `self.exec_move_tld(files_selected)` and then
*   subscribes the `body_response` node to the returned background-process
*   SSE stream via `update_process_status`.
* - On every render, also checks IndexedDB for a previously running process
*   (key `'process_move_tld'`) so that a page reload re-attaches to an
*   in-flight operation.
*
* The `self.value` shape is populated by `move_tld::get_value()` on the PHP
* side and has the following structure:
* ```json
* {
*   "body":  "<string> HTML description shown above the file list",
*   "files": [
*     { "file_name": "finds_numisdata279_to_tchi1.json", "content": { … } },
*     …
*   ]
* }
* ```
*
* @param {Object} self - The move_tld widget instance (provides `self.value`,
*   `self.caller`, and `self.exec_move_tld`).
* @returns {Promise<HTMLElement>} content_data - Root `<div>` containing all
*   widget UI; caller appends it to the wrapper.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const body			= value.body
		const files			= value.files || []
		const local_db_id	= 'process_move_tld'

	// files sort
		// Sort alphabetically using the browser's locale-aware collator so
		// definition file names appear in a predictable, user-friendly order.
		files.sort((a, b) => new Intl.Collator().compare(a.file_name, b.file_name));

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		// Descriptive text explaining what Move TLD does and where definition
		// files must be placed. Content comes verbatim from PHP get_value().
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// files_list
		// Closure-scoped accumulator updated by the individual checkbox handlers
		// below. Passed directly to exec_move_tld on form submit.
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
			const input_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label',
				inner_html		: item.file_name,
				parent			: file_container
			})

			// input checkbox — allows multiple files to be selected at once.
			//     The visual 'selected' highlight is reset on every change event
			//     and re-applied only to checked labels, which means unchecking
			//     a file removes its highlight while keeping other selections intact.
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.file_name,
				name			: 'files_list'
			})
			input_label.prepend(input)
			input.addEventListener('change', function(e) {
				// reset selected style
				// Remove 'selected' class from all labels before re-evaluating,
				// so unchecked items lose their highlight immediately.
				[...files_list.querySelectorAll('.label')].map(el => {
					el.classList.remove('selected')
				})
				// set as selected
				if (input.checked) {
					files_selected.push(item.file_name)
					input_label.classList.add('selected')
				}else{
					// Remove file name from accumulator when unchecked.
					const index = files_selected.indexOf(item.file_name);
					if (index !== -1) {
						files_selected.splice(index, 1);
					}
					input_label.classList.remove('selected')
				}
			})

			// show_file_content (arrow)
			// Toggle button that reveals or hides the JSON preview below.
			// The 'up' class rotates the arrow icon to indicate expanded state.
			const show_file_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'show_file_content icon_arrow',
				inner_html		: 'File contents',
				parent			: file_container
			})

			// file_content_container
			// Pretty-printed JSON serialised here; hljs.highlightElement adds
			// syntax-coloring classes in-place after the node is created.
			const content_string = JSON.stringify(item.content, null, 2)
			const file_content_container = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'highlighted_code file_content_container language-json hide',
				inner_html		: content_string,
				parent			: file_container
			})
			// collapse file_content
			// Persist the open/closed state per-file in IndexedDB so the panel
			// survives a page reload. The collapsed_id is unique per file name.
			ui.collapse_toggle_track({
				toggler				: show_file_content,
				container			: file_content_container,
				collapsed_id		: 'collapsed_move_tld_file_'+item.file_name,
				collapse_callback	: () => {
					show_file_content.classList.remove('up')
				},
				expose_callback		: () => {
					show_file_content.classList.add('up')
				},
				default_state : 'closed'
			})
			// highlight element
			hljs.highlightElement(file_content_container);
		}

	// body_response
		// Container for the SSE process-status stream rendered by
		// update_process_status(). Appended after the file list so the
		// operator can see progress without scrolling past the controls.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// Wire the submit form provided by the parent caller (area_maintenance
		// widget chrome). `init_form` is optional — it may not exist when
		// render_level === 'content' or when the caller is not a full widget.
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Move TLD terms',
				// confirm_text	: confirm_text,
				body_info		: content_data,
				body_response	: body_response,
				on_submit	: (e, values) => {

					// Guard: at least one file must be checked before submitting.
					// (!) Uses alert() for validation feedback — a browser-native
					//     modal that blocks the thread. This is intentional for
					//     this maintenance tool context.
					if (!files_selected.length) {
						alert("Error: no files are selected");
						return
					}

					// move_tld
					// Fire the long-running background process and then attach
					// body_response to its SSE stream for live progress display.
					self.exec_move_tld(files_selected)
					.then(function(response){
						update_process_status(
							local_db_id,
							response.pid,
							response.pfile,
							body_response
						)
					})
				}
			})
		}

		// check process status always
		// On every render (including page reloads) check IndexedDB for a
		// process that was launched in a previous session. If one is found,
		// re-attach body_response to its status stream automatically so
		// the operator does not lose visibility of an in-flight migration.
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
