/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'

	// hljs
	import hljs from '../../../../../lib/highlightjs/es/core.min.js';
	import json from '../../../../../lib/highlightjs/es/languages/json.js';
	hljs.registerLanguage('json', json);



/**
* RENDER_MOVE_TO_PORTAL
* Client-side render module for the move_to_portal maintenance widget.
*
* This module builds the UI that lets an administrator select one or more
* JSON definition files and trigger the `portalize_data` migration process
* on the server. Each definition file describes a mapping of tipos from a
* source section to a target section that will be linked via a portal.
*
* The widget renders inside the area_maintenance panel and wires itself to:
*   - `self.caller.init_form`    — provided by the parent area_maintenance
*                                   instance; builds the <form>, submit
*                                   button, and API-call plumbing.
*   - `self.exec_move_to_portal` — defined in move_to_portal.js; fires the
*                                   background API action and returns a
*                                   response carrying { pid, pfile } so the
*                                   UI can poll the process status via SSE.
*   - `data_manager.get_local_db_data` — reads IndexedDB so that an already-
*                                   running process is surfaced immediately
*                                   when the widget is re-rendered mid-run.
*
* Value shape delivered by the server (class.move_to_portal::get_value):
* {
*   body  : {string}  — introductory HTML description shown in the info panel.
*   files : {Array}   — list of available definition files, each:
*                        { file_name: {string}, content: {Object} }
* }
*
* Exports: render_move_to_portal (constructor, prototype carries `list`)
*/



/**
* RENDER_MOVE_TO_PORTAL
* Constructor for the client-side render object of the move_to_portal widget.
* All render logic lives on the prototype; the constructor itself is a no-op
* placeholder (returns true) following the standard widget render convention.
*/
export const render_move_to_portal = function() {

	return true
}//end render_move_to_portal



/**
* LIST
* Creates the DOM tree for this widget and returns either the full wrapper
* element (ready to be appended to the area_maintenance panel body) or, when
* `render_level === 'content'`, only the inner content_data node.
*
* Called by move_to_portal.prototype.list (and .edit, which aliases it).
* `self` is the owning move_to_portal instance; `self.caller` is the parent
* area_maintenance instance that provides `init_form`.
*
* @param {Object} options
*   @param {string} [options.render_level="full"] - Granularity of the render.
*     "full"    → build and return the full widget wrapper (default).
*     "content" → return only the inner content_data HTMLElement (used when
*                 the wrapper already exists and only its contents need refresh).
* @returns {Promise<HTMLElement>} The widget wrapper (render_level "full") or
*   the inner content_data div (render_level "content").
*/
render_move_to_portal.prototype.list = async function(options) {

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
* Builds the full inner content DOM for the move_to_portal widget:
*   1. An info panel with the server-supplied description (value.body).
*   2. A scrollable list of collapsible definition-file cards, each with a
*      checkbox to select the file and a syntax-highlighted JSON preview.
*   3. A form (via self.caller.init_form) that submits the selection and
*      wires the server response to an SSE process-status tracker.
*   4. An immediate IndexedDB check so that a previously started process
*      (still running from a prior page load) is surfaced without resubmit.
*
* The returned element is appended to the widget wrapper by `list`.
*
* @param {Object} self - The owning move_to_portal instance.
*   self.value   {Object}  — server value: { body: string, files: Array }.
*   self.caller  {Object}  — parent area_maintenance instance (provides init_form).
*   self.exec_move_to_portal {Function} — fires the background API call.
* @returns {Promise<HTMLElement>} The assembled content_data div element.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const body			= value.body
		const files			= value.files || []
		// IndexedDB key used to persist and resume background process state
		const local_db_id	= 'process_move_to_portal'

	// files sort
		// Sort definition files alphabetically by file_name using locale-aware
		// collation so the list is stable across different browser environments.
		files.sort((a, b) => new Intl.Collator().compare(a.file_name, b.file_name));

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		// Introductory HTML paragraph served by the server describing what this
		// migration does and where the definition files live on disk.
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// files_list
		// Container for all definition-file cards. Each card shows the file
		// name (with a selection checkbox) and an expandable JSON preview.
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_list',
			parent			: content_data
		})
		// Accumulates file_name strings for all currently checked checkboxes.
		// Passed to exec_move_to_portal on form submit.
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

			// input radio button
			// (!) Despite the "radio button" label, the element type is
			// 'checkbox', allowing multiple files to be selected at once.
			// (flag) The change handler below resets ALL .selected classes on
			// every change event before re-applying them. With checkboxes this
			// causes already-checked siblings to lose their 'selected' highlight
			// unless their checkbox state is re-evaluated in the same pass.
			// This appears to be a visual-only bug (files_selected array stays
			// correct); do not fix here — it mirrors the sibling widget
			// render_move_locator.js exactly.
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.file_name,
				name			: 'files_list'
			})
			input_label.prepend(input)
			input.addEventListener('change', function(e) {
				// reset selected style
				[...files_list.querySelectorAll('.label')].map(el => {
					el.classList.remove('selected')
				})
				// set as selected
				if (input.checked) {
					files_selected.push(item.file_name)
					input_label.classList.add('selected')
				}else{
					const index = files_selected.indexOf(item.file_name);
					if (index !== -1) {
						files_selected.splice(index, 1);
					}
					input_label.classList.remove('selected')
				}
			})

			// show_file_content (arrow)
			// Clickable chevron that acts as the collapse/expand toggler for
			// the JSON preview panel below. The 'up' class rotates the arrow.
			const show_file_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'show_file_content icon_arrow',
				inner_html		: 'File contents',
				parent			: file_container
			})

			// file_content_container
			// Pretty-print the definition file's parsed JSON object so the
			// administrator can inspect its tipo mappings before running.
			const content_string = JSON.stringify(item.content, null, 2)
			const file_content_container = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'highlighted_code file_content_container language-json hide',
				inner_html		: content_string,
				parent			: file_container
			})
			// collapse file_content
			// Tie the chevron to the <pre> via ui.collapse_toggle_track so the
			// panel state (open/closed) is remembered in the DOM using the
			// file-name-scoped collapsed_id key.
			ui.collapse_toggle_track({
				toggler				: show_file_content,
				container			: file_content_container,
				collapsed_id		: 'collapsed_move_to_portal_file_'+item.file_name,
				collapse_callback	: () => {
					show_file_content.classList.remove('up')
				},
				expose_callback		: () => {
					show_file_content.classList.add('up')
				},
				default_state : 'closed'
			})
			// highlight element
			// Apply syntax highlighting to the <pre> element in-place via hljs.
			// Must be called after inner_html is set and the element exists in
			// the document fragment.
			hljs.highlightElement(file_content_container);
		}

	// body_response
		// Placeholder element where update_process_status renders the live
		// SSE progress output. Appended to content_data after form init so it
		// appears below the form controls.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// self.caller is the area_maintenance instance; init_form delegates to
		// render_area_maintenance::build_form which injects a <form> element with
		// a submit button into body_info (content_data).
		// on_submit overrides the default API trigger so we can validate the
		// selection and funnel the response into update_process_status.
		// (flag) self.caller is accessed without optional chaining here, unlike
		// the sibling render_move_locator.js which uses `self.caller?.init_form`.
		// If caller is undefined this will throw. Not fixed — mirrors original.
		self.caller.init_form({
			submit_label	: 'Move data to new section and portal it',
			// confirm_text	: confirm_text,
			body_info		: content_data,
			body_response	: body_response,
			on_submit	: (e, values) => {

				if (!files_selected.length) {
					alert("Error: no files are selected");
					return
				}

				// move_to_portal
				// Fire the background API call (defined in move_to_portal.js).
				// The server returns { pid, pfile } of the spawned background
				// process; pass those to update_process_status to begin SSE
				// polling and render live progress in body_response.
				self.exec_move_to_portal(files_selected)
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

		// check process status always
		// On every render, probe IndexedDB for a persisted status record from a
		// previous run. If one exists (e.g. the user navigated away mid-process),
		// resume SSE polling immediately without requiring a new form submit.
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
