// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* RENDER_MOVE_LANG
* Client-side render module for the move_lang maintenance widget.
*
* Provides the list/edit view that lets an administrator:
*   1. Browse and inspect the JSON definition files stored in
*      core/base/transform_definition_files/move_lang/.
*   2. Select one or more definition files via checkboxes.
*   3. Trigger the `move_lang` background process (transform_data::change_data_lang)
*      that rewrites component dato keys between translatable and non-translatable
*      language storage (lang ↔ nolan) across all relevant database tables.
*   4. Monitor the running process via a Server-Sent Events (SSE) status stream
*      (update_process_status) that persists in IndexedDB under the key
*      'process_move_lang'.
*
* Architecture notes:
*   - The constructor is a no-op stub; all behaviour lives on the prototype.
*   - `render_move_lang.prototype.list` is aliased to both `move_lang.prototype.list`
*     and `move_lang.prototype.edit` in move_lang.js, so it handles both render modes.
*   - `self.caller` is the parent area_maintenance instance; `self.caller.init_form`
*     delegates to render_area_maintenance::build_form to wire the submit button and
*     response container into the widget body.
*   - The server operation (class.move_lang.php::move_lang) runs as a long-lived CLI
*     background process (background_running: true) and returns {pid, pfile} for SSE
*     polling. The UI re-attaches to any in-progress run on mount via check_process_data.
*
* Exports: render_move_lang
*
* @module render_move_lang
*/

// imports
	import {ui} from '../../../../common/js/ui.js'
	import {update_process_status} from '../../../../common/js/common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'

	// hljs
	import hljs from '../../../../../lib/highlightjs/es/core.min.js';
	import json from '../../../../../lib/highlightjs/es/languages/json.js';
	hljs.registerLanguage('json', json);



/**
* RENDER_MOVE_LANG
* Constructor stub for the render_move_lang prototype chain.
* All rendering behaviour is provided via prototype assignments in move_lang.js.
*/
export const render_move_lang = function() {

	return true
}//end render_move_lang



/**
* LIST
* Builds and returns the full widget DOM tree for the move_lang UI.
*
* When render_level is 'content', returns just the inner content_data element
* (used when the caller only needs to refresh the body without re-wrapping).
* Otherwise builds and returns the full widget wrapper produced by
* ui.widget.build_wrapper_edit, which includes the standard widget chrome
* (title bar, expand/collapse) expected by area_maintenance.
*
* This function is aliased to both move_lang.prototype.list and
* move_lang.prototype.edit via the prototype assignments in move_lang.js.
*
* @param {Object} options - Render options supplied by the widget lifecycle.
* @param {string} [options.render_level="full"] - 'full' returns the wrapper;
*   'content' returns only the inner content_data element.
* @param {string} [options.render_mode="list"] - Unused at this level; kept
*   for parity with the standard widget options contract.
* @returns {Promise<HTMLElement>} The widget wrapper (render_level 'full') or
*   the raw content_data div (render_level 'content').
*/
render_move_lang.prototype.list = async function(options) {

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
* Builds the full interactive body of the move_lang widget.
*
* Reads `self.value` (populated by the server-side get_value call) which
* contains:
*   - body  {string}  — HTML description text shown at the top of the widget.
*   - files {Array}   — Array of definition file descriptors, each shaped:
*       { file_name: string, content: Array } where content is the decoded
*       JSON array from the corresponding file in
*       core/base/transform_definition_files/move_lang/.  Each content entry
*       is shaped: { tipo, type, ar_tables, perform, info }.
*
* The constructed DOM tree is:
*   div.content_data
*     div.info_text             — HTML description from value.body
*     div.files_list            — one .file_container per definition file
*       div.file_container
*         label.label           — checkbox + file_name text
*           input[checkbox]     — toggles file selection; updates files_selected
*         div.show_file_content — collapsible toggle arrow (icon_arrow)
*         pre.file_content_container — syntax-highlighted JSON of the file
*     div.body_response         — SSE process status output area
*
* The form is wired through self.caller.init_form, which appends a submit
* button labelled "Move TLD terms" to the widget body.  On submit, if at
* least one file is selected, exec_move_lang is called and the returned
* {pid, pfile} is handed to update_process_status to start SSE polling.
*
* On every render, check_process_data queries IndexedDB for any previously
* stored process record under 'process_move_lang' and re-attaches SSE polling
* if the process is still running — ensuring a page reload does not lose the
* live status stream.
*
* (!) The `info` variable created for the info_text div is not used after
* creation; its parent assignment in ui.create_dom_element handles attachment.
*
* @param {Object} self - The move_lang widget instance (caller is area_maintenance).
* @returns {Promise<HTMLElement>} The populated content_data div.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const body			= value.body
		// files: Array of { file_name: string, content: Array } from get_definitions_files
		const files			= value.files || []
		// local_db_id: IndexedDB key for persisting process state between page reloads
		const local_db_id	= 'process_move_lang'

	// files sort — alphabetical by file_name using locale-aware collation
		files.sort((a, b) => new Intl.Collator().compare(a.file_name, b.file_name));

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info — renders the HTML description from value.body (server-provided)
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// files_list — container for per-file checkboxes and collapsible previews
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_list',
			parent			: content_data
		})
		// files_selected: accumulates file_name strings as the user checks/unchecks boxes.
		// This closure array is read by the on_submit handler below.
		const files_selected = []
		const files_length = files.length
		for (let i = 0; i < files_length; i++) {

			const item = files[i]

			// file_container — groups checkbox, toggle arrow, and JSON preview for one file
			const file_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'file_container',
				parent			: files_list
			})

			// label — wraps the checkbox input so the whole label row is clickable
			const input_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'label',
				inner_html		: item.file_name,
				parent			: file_container
			})

			// input radio button
			// (!) Despite the comment, this is a checkbox, not a radio — multiple files
			// can be selected simultaneously. The comment is a remnant; do NOT change it.
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.file_name,
				name			: 'files_list'
			})
			input_label.prepend(input)
			input.addEventListener('change', function(e) {
				// reset selected style — remove the visual highlight from ALL labels
				// before re-applying to only the currently checked ones.
				// (!) This resets ALL labels on every change event, not just the
				// toggled one. With multiple checkboxes, previously-checked labels
				// lose the 'selected' class until their own change event fires again.
				// Do NOT fix this — document only.
				[...files_list.querySelectorAll('.label')].map(el => {
					el.classList.remove('selected')
				})
				// set as selected
				if (input.checked) {
					// add to selection and highlight
					files_selected.push(item.file_name)
					input_label.classList.add('selected')
				}else{
					// remove from selection and un-highlight
					const index = files_selected.indexOf(item.file_name);
					if (index !== -1) {
						files_selected.splice(index, 1);
					}
					input_label.classList.remove('selected')
				}
			})

			// show_file_content (arrow) — toggle button that reveals/hides the JSON preview
			const show_file_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'show_file_content icon_arrow',
				inner_html		: 'File contents',
				parent			: file_container
			})

			// file_content_container — syntax-highlighted JSON preview of the definition file.
			// Rendered as a <pre> with the 'hide' class by default; toggled via collapse_toggle_track.
			// The collapsed state is persisted in IndexedDB so the panel remembers its open/closed
			// state across page reloads.
			const content_string = JSON.stringify(item.content, null, 2)
			const file_content_container = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'highlighted_code file_content_container language-json hide',
				inner_html		: content_string,
				parent			: file_container
			})
			// collapse file_content — wires the toggle arrow to show/hide the JSON preview,
			// persisting the open/closed state per file_name in IndexedDB.
			ui.collapse_toggle_track({
				toggler				: show_file_content,
				container			: file_content_container,
				// (!) The collapsed_id embeds the raw file_name string which may contain
				// characters that IndexedDB handles as a key but could be surprising.
				collapsed_id		: 'collapsed_move_lang_file_'+item.file_name,
				collapse_callback	: () => {
					// remove the 'up' arrow rotation class when collapsing
					show_file_content.classList.remove('up')
				},
				expose_callback		: () => {
					// add the 'up' arrow rotation class when expanding
					show_file_content.classList.add('up')
				},
				default_state : 'closed'
			})
			// apply highlight.js syntax colouring to the JSON <pre> block
			hljs.highlightElement(file_content_container);
		}

	// body_response — container for SSE process-status output injected by update_process_status.
	// Appended to content_data at the end of this function (after form init) so it appears below
	// the form controls.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init — delegates to self.caller.init_form (area_maintenance::init_form →
	// render_area_maintenance::build_form) to create the submit button and wire the
	// on_submit callback.  The optional-chaining guard (?.) means the form is only
	// initialised when self.caller provides init_form (i.e. when running inside
	// area_maintenance; the guard prevents errors in standalone/test contexts).
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: 'Move TLD terms',
				// confirm_text	: confirm_text,
				body_info		: content_data,
				body_response	: body_response,
				on_submit	: (e, values) => {

					// Guard: require at least one file before firing the long-running process.
					// (!) Uses alert() for the error UX — acceptable for a maintenance tool.
					if (!files_selected.length) {
						alert("Error: no files are selected");
						return
					}

					// move_lang — fire the background CLI process and immediately begin
					// SSE polling via update_process_status.  The promise resolves once
					// the server has forked the process and returned {pid, pfile}.
					self.exec_move_lang(files_selected)
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

		// check process status always — on every render, probe IndexedDB for any
		// previously stored process state so a page reload re-attaches SSE polling
		// to an already-running background job without requiring the user to
		// re-submit.  If no stored state exists, local_data is falsy and nothing happens.
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

	// add at end body_response — placed after form init so the status area
	// appears below the submit button in the rendered widget body.
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
