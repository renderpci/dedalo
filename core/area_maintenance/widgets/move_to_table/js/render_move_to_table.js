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
* RENDER_MOVE_TO_TABLE
* Client-side render module for the move_to_table maintenance widget.
*
* This widget lets administrators move Dédalo data between matrix database
* tables using pre-defined JSON transformation files.  A typical use case is
* migrating records from a legacy flat table (e.g. utoponymy1) into the
* canonical hierarchy table (matrix_hierarchy).
*
* Architecture overview:
* - The transformation mapping is expressed as JSON files placed on the server
*   at /dedalo/core/base/transform_definition_files/move_to_table/.
* - `get_value` (PHP) reads the directory and returns the file list with their
*   parsed contents; this module renders those files as selectable checkboxes.
* - When the form is submitted, `exec_move_to_table` (move_to_table.js) fires
*   the `move_to_table` PHP action which runs
*   `transform_data::move_data_between_matrix_tables` in background mode.
* - Progress is tracked via `update_process_status`, polling an SSE stream
*   keyed by the `pid`/`pfile` pair returned in the initial response.
*
* Widget value shape (from PHP get_value):
* {
*   body  : string,  // HTML description injected as info text
*   files : Array<{
*     file_name : string,  // base filename e.g. 'utoponymy1_to_hierarchy.json'
*     content   : Object   // parsed JSON contents of the transformation file
*   }>
* }
*
* Rendering conventions:
* - `render_move_to_table.prototype.list` is aliased to both `.edit` and
*   `.list` on the `move_to_table` prototype (move_to_table.js) so this single
*   method handles every render mode area_maintenance may request.
* - `render_level === 'content'` returns only the inner content_data node;
*   `render_level === 'full'` (default) wraps it in the standard widget shell.
*
* Process tracking:
* - `local_db_id = 'process_move_to_table'` is the IndexedDB key used to
*   persist the last known process state.  On every render, `check_process_data`
*   reads this key so that a previously started migration can be re-attached
*   even after a page reload.
*
* @module render_move_to_table
*/
export const render_move_to_table = function() {

	return true
}//end render_move_to_table



/**
* LIST
* Builds and returns the full widget DOM tree for the move_to_table widget.
* Aliased as both `.edit` and `.list` on the `move_to_table` prototype so it
* handles all render modes that area_maintenance may request.
*
* When `options.render_level === 'content'`, returns only the inner
* content_data node (used by area_maintenance for partial DOM refreshes
* without re-creating the outer widget shell).  Otherwise, the content is
* placed inside the standard widget wrapper produced by
* `ui.widget.build_wrapper_edit` and a `content_data` pointer is attached to
* the wrapper for later use by the refresh path.
*
* @param {Object} options - Render options passed by area_maintenance.
* @param {string} [options.render_level='full'] - 'full' to return the wrapped
*   widget node; 'content' to return only the inner content_data node.
* @returns {Promise<HTMLElement>} Resolves with the wrapper node when
*   render_level==='full', or the bare content_data node when
*   render_level==='content'.
*/
render_move_to_table.prototype.list = async function(options) {

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
* Builds the inner content node for the move_to_table widget.
*
* Rendering sequence:
*   1. Extracts `body` (HTML info text) and `files` (transformation file list)
*      from `self.value`, which was populated by PHP `get_value`.
*   2. Sorts files alphabetically by file_name using locale-aware collation.
*   3. Creates a scrollable file list where each row contains:
*        - A checkbox to include that file in the migration batch.
*        - A collapsible panel showing the raw JSON content with syntax
*          highlighting (via highlight.js).  The collapsed/expanded state is
*          persisted in IndexedDB under the key
*          'collapsed_move_to_table_file_<file_name>'.
*   4. Wires up a form via `self.caller.init_form` with submit label
*      "Move data between matrix tables".  On submit, the currently checked
*      filenames are passed to `self.exec_move_to_table`, which fires the
*      background PHP process.
*   5. Immediately after form creation, `check_process_data` reads any
*      previously persisted process state from IndexedDB and re-attaches the
*      SSE progress stream if a migration was already running.
*
* Selection model:
*   `files_selected` is a module-local array maintained by the checkbox
*   `change` listeners.  On each toggle ALL label 'selected' classes are first
*   cleared and then re-applied only to the checked item, keeping styling in
*   sync even when the event fires out of order.
*
* (!) The `info` node assigned during the info block is currently unused after
*   construction; its parent pointer is sufficient to anchor it in the DOM.
*
* (!) If no files are selected and the form is submitted, `alert()` is called
*   to show an inline error.  This is intentional parity with sibling widgets
*   (move_to_portal, move_locator) and must not be changed.
*
* @param {Object} self - The move_to_table widget instance (populated by
*   `widget_common.prototype.init`).
* @param {Object} [self.value={}] - Widget value loaded from the server;
*   expected shape: { body: string, files: Array<{file_name, content}> }.
* @param {Object} self.caller - The parent area_maintenance instance; provides
*   `init_form(widget_object)` used to build and wire the submit form.
* @returns {Promise<HTMLElement>} Resolves with the fully-built content_data
*   container node, ready to be appended to the widget wrapper.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const body			= value.body
		const files			= value.files || []
		const local_db_id	= 'process_move_to_table'

	// files sort
		// Locale-aware ascending sort by file_name ensures stable display order
		// regardless of the server directory listing order.
		files.sort((a, b) => new Intl.Collator().compare(a.file_name, b.file_name));

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info
		// Renders the server-supplied HTML description at the top of the widget.
		const info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: body,
			parent			: content_data
		})

	// files_list
		// Container for all per-file checkbox rows.
		const files_list = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'files_list',
			parent			: content_data
		})
		// Mutable array tracking which file_names are currently checked.
		// Passed directly to exec_move_to_table on form submit.
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
			// Despite the comment saying 'radio button', this is a checkbox —
			// multiple files can be selected simultaneously for a batch migration.
			const input = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				value			: item.file_name,
				name			: 'files_list'
			})
			input_label.prepend(input)
			input.addEventListener('change', function(e) {
				// reset selected style
				// All labels are cleared first so that visual 'selected' state
				// always matches the actual checkbox state (avoids stale highlights
				// when a prior checked item is toggled indirectly).
				[...files_list.querySelectorAll('.label')].map(el => {
					el.classList.remove('selected')
				})
				// set as selected
				if (input.checked) {
					files_selected.push(item.file_name)
					input_label.classList.add('selected')
				}else{
					// Remove this file_name from files_selected when unchecked.
					const index = files_selected.indexOf(item.file_name);
					if (index !== -1) {
						files_selected.splice(index, 1);
					}
					input_label.classList.remove('selected')
				}
			})

			// show_file_content (arrow)
			// Clickable toggler that expands/collapses the JSON preview below.
			// The 'up' class flips the arrow icon direction via CSS.
			const show_file_content = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'show_file_content icon_arrow',
				inner_html		: 'File contents',
				parent			: file_container
			})

			// file_content_container
			// Pretty-printed JSON string of the transformation file content,
			// rendered inside a <pre> and syntax-highlighted via hljs.
			// Starts hidden ('hide' class); state is managed by collapse_toggle_track.
			const content_string = JSON.stringify(item.content, null, 2)
			const file_content_container = ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'highlighted_code file_content_container language-json hide',
				inner_html		: content_string,
				parent			: file_container
			})
			// collapse file_content
			// Persistent open/closed state is stored in IndexedDB under a
			// per-file key so each panel remembers its last state across page loads.
			ui.collapse_toggle_track({
				toggler				: show_file_content,
				container			: file_content_container,
				collapsed_id		: 'collapsed_move_to_table_file_'+item.file_name,
				collapse_callback	: () => {
					show_file_content.classList.remove('up')
				},
				expose_callback		: () => {
					show_file_content.classList.add('up')
				},
				default_state : 'closed'
			})
			// highlight element
			// Apply syntax highlighting to the <pre> block immediately after
			// construction.  hljs modifies the element in place and is safe to
			// call even when the element is not yet attached to the document.
			hljs.highlightElement(file_content_container);
		}

	// body_response
		// Dedicated container where update_process_status appends progress output
		// (SSE stream lines, final result message).  Appended to content_data at
		// the very end so it appears below the form controls.
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// Wires the submit form into the widget body via the parent
		// area_maintenance instance.  `on_submit` is invoked in place of the
		// default API trigger, giving this widget full control of the call flow.
		self.caller.init_form({
			submit_label	: 'Move data between matrix tables',
			// confirm_text	: confirm_text,
			body_info		: content_data,
			body_response	: body_response,
			on_submit	: (e, values) => {

				// Guard: at least one file must be selected before the migration
				// can proceed.  alert() is used here intentionally — this is a
				// maintenance-only admin tool, not a user-facing UI.
				if (!files_selected.length) {
					alert("Error: no files are selected");
					return
				}

				// move_to_table
				// Fire the background migration and hand off PID/pfile to the
				// progress tracker so the SSE stream can be attached.
				self.exec_move_to_table(files_selected)
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
		// Re-attach progress tracking for any migration that may already be
		// running (e.g. the user navigated away and came back).  Reads the last
		// known pid/pfile from IndexedDB; if present, calls update_process_status
		// to resume the SSE stream.  This is a fire-and-forget call.
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
