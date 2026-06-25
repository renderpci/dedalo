// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TIME_MACHINE
*
* Client-side rendering layer for tool_time_machine. This module is responsible
* solely for building and returning DOM nodes; all data fetching and API calls
* live in tool_time_machine.js.
*
* The tool opens against the virtual section dd15 (matrix_time_machine table)
* and presents two side-by-side panels to the user:
*   - current_component_container  — the live "Now" version of the component,
*     rendered in read-only mode so it cannot be accidentally edited.
*   - preview_component_container  — an empty slot that is populated dynamically
*     when the user clicks a row in the TM history list; it shows the historical
*     snapshot in read-only TM mode (permissions=1, show_interface.read_only=true).
*
* A toolbar below the panels provides:
*   - A language selector (hidden when the component is language-neutral,
*     i.e. lang === 'lg-nolan').
*   - An "Apply and save" button that calls tool_time_machine.apply_value()
*     via dd_tools_api to overwrite the live row with the selected snapshot.
*     The button starts hidden/locked and is revealed only after a row is chosen.
*   - A "Revert bulk process" button (visible only to global admins) that calls
*     tool_time_machine.bulk_revert_process() to undo an entire batch operation
*     across all affected records.
*
* When the caller (i.e. the tool's main_element) is a section rather than a
* single component, the current_component_container and the toolbar are both
* suppressed; only the history list is shown.
*
* Exports:
*   render_tool_time_machine — constructor (prototype assigned in tool_time_machine.js)
*   add_component            — standalone helper used by tool_time_machine.init's
*                              tm_edit_record event subscriber to populate the
*                              preview panel at run-time
*
* @module render_tool_time_machine
*/
export const render_tool_time_machine = function() {

	return true
}//end render_tool_time_machine



/**
* EDIT
* Render node for use like button
* @param {Object} options - Render options passed from tool_common.prototype.render.
*   @param {string} [options.render_level='full'] - 'full' builds wrapper+content;
*     'content' returns only the content_data node (used during refresh so the
*     wrapper DOM element is reused without being recreated).
* @returns {HTMLElement} wrapper - The outermost DOM node for this tool, or the
*   content_data node when render_level === 'content'.
*/
render_tool_time_machine.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointer
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Builds the complete interior DOM tree for the TM tool and returns it wrapped
* in the standard content_data container produced by ui.tool.build_content_data.
*
* Layout (DocumentFragment → content_data):
*   1. current_component_container  — holds the live component ("Now") rendered
*      in forced read-only mode. Skipped entirely when main_element is a section.
*   2. preview_component_container  — empty placeholder appended to self so that
*      the tm_edit_record event subscriber (tool_time_machine.init) can target it
*      later via self.preview_component_container.
*   3. tool_bar (when caller is not a section):
*        - language <select> (omitted for lg-nolan components)
*        - "Revert bulk process" button (global admin only, starts hidden)
*        - revert_label <span> (shows either admin process info or a non-admin
*          advisory message when a bulk-process row is selected)
*        - "Apply and save" button (starts hidden; revealed on row selection)
*   4. service_time_machine node — the rendered history list returned by
*      self.service_time_machine.render(). This is the scrollable list of past
*      snapshots with their timestamps, user info, and preview eye-icon actions.
*
* Side effects:
*   - Assigns self.preview_component_container (used externally by event handler).
*   - Assigns self.button_apply, self.button_bulk_revert_process,
*     self.label_bulk_revert_process (used externally by tool_time_machine.init
*     to toggle visibility when the user selects a TM row).
*   - Calls self.refresh() on lang change, destroying and recreating content.
*
* @param {Object} self - The tool_time_machine instance.
* @returns {HTMLElement} content_data - The populated content wrapper node.
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// const tm_date = new Date();

	// current_component_container
		const current_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'current_component_container',
			parent			: fragment
		})
		if(self.main_element.model!=='section') {
			// add component
			await add_component(
				self, // tool instance
				current_component_container, // DOM node container
				self.main_element.lang, // string lang
				get_label.now || 'Now', // string label 'Now'
				'edit', // string mode = 'edit'
				null // int|null  matrix_id (time machine variant)
			)
		}

	// preview_component_container
		const preview_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'preview_component_container',
			parent			: fragment
		})
		// set
		self.preview_component_container = preview_component_container

	// tool_bar
		if (self.caller.model!=='section') {
			// tool_bar
				const tool_bar = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_bar',
					parent			: fragment
				})

			// lang selector
				if (self.main_element.lang!=='lg-nolan') {

					// label
					ui.create_dom_element({
						element_type	: 'label',
						inner_html		: get_label.language,
						parent			: tool_bar
					})
					// selector
					const on_change_select = function(e) {
						const lang = e.target.value
						if (lang!==self.lang) {

							content_data.classList.add('loading')

							self.lang				= lang
							self.main_element.lang	= lang
							// refresh
							self.refresh({
								build_autoload	: false, // default true
								render_level	: 'content', // default content
								destroy			: true // default true
							})
							.then(function(response){
								content_data.classList.remove('loading')
							})
						}
					}
					const select_lang = ui.build_select_lang({
						langs		: self.langs,
						selected	: self.lang,
						class_name	: '',
						action		: on_change_select
					})
					tool_bar.appendChild(select_lang)
				}

			// button revert process
				// this activate the bulk process button.
				// only global admin can manage a revert of bulk processes
				// users will see a message saying that
				// they need to talk with the global admin to inform about the bulk process
				// and why need to be reverted
				if ( page_globals.is_global_admin === true ){
					self.button_bulk_revert_process = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'danger button_bulk_revert_process hide lock history',
						inner_html		: self.get_tool_label('revert_bulk_process') || 'Revert the bulk process',
						parent			: tool_bar
					})
					self.button_bulk_revert_process.addEventListener('click', function(){
						//get the confirm message
						const confirm_msg = self.get_tool_label('bulk_revert_confirm_msg', self.selected_bulk_process_id)
							|| `Are you sure to revert the bulk process: ${self.selected_bulk_process_id}?\n\nAll changed done in this process will be reverted in all records`

						if (confirm(confirm_msg)) {
							// process the bulk revert
							const bulk_revert_process_label = self.get_tool_label('bulk_revert_process_label') || 'Reversed the process with id'
							const bulk_revert_process_name = `${bulk_revert_process_label} ${self.selected_bulk_process_id} > ${self.label_bulk_revert_process.innerHTML}`
							self.bulk_revert_process({
								section_id					: self.main_element.section_id,
								section_tipo				: self.main_element.section_tipo,
								tipo						: self.main_element.tipo,
								lang						: self.main_element.lang,
								selected_bulk_process_id	: self.selected_bulk_process_id,
								bulk_revert_process_label	: bulk_revert_process_name
							})
							.then(function(response){
								if (response.result===true) {
									// success case
									if (window.opener) {
										// close this window when was opened from another
										window.close()
									}
								}else{
									// error case
									console.warn('response:',response);
									alert(response.msg || 'Error. Unknown error on apply tm value');
								}
							})
						}
					})
				}

			// revert_label
				self.label_bulk_revert_process = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'revert_label hide',
					// inner_html		: self.get_tool_label('info_revert_bulk_process') || 'To revert this bulk process contact an administrator.',
					parent			: tool_bar
				})

			// button apply
				self.button_apply = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'warning button_apply lock history',
					inner_html		: self.get_tool_label('apply_and_save') || 'Apply and save',
					parent			: tool_bar
				})
				self.button_apply.addEventListener('click', function(){

					self.apply_value({
						section_id		: self.main_element.section_id,
						section_tipo	: self.main_element.section_tipo,
						tipo			: self.main_element.tipo,
						lang			: self.main_element.lang,
						matrix_id		: self.selected_matrix_id
					})
					.then(function(response){
						if (response.result===true) {
							// success case
							if (window.opener) {
								// close this window when was opened from another
								window.close()
							}
						}else{
							// error case
							console.warn('response:',response);
							alert(response.msg || 'Error. Unknown error on apply tm value');
						}
					})
				})
		}//end if (self.caller!=='section')

	// service_time_machine. Render instance
		const time_machine_list_node = await self.service_time_machine.render()
		fragment.appendChild(time_machine_list_node)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* ADD_COMPONENT
* Loads a component into a given container, rendering it in forced read-only
* mode and decorating it with a time-label.
*
* This function is used in two places:
*   1. get_content_data — to populate current_component_container with the live
*      ("Now") version of the component. In this case matrix_id is null and
*      self.main_element is used directly (no API round-trip).
*   2. tool_time_machine.init's tm_edit_record event subscriber — to populate
*      preview_component_container with a historical snapshot. In this case
*      matrix_id is the row id from matrix_time_machine and mode is 'tm'.
*
* Loading pattern:
*   ui.load_item_with_spinner shows a spinner placeholder inside container,
*   then executes the async callback. The callback:
*     a. Resolves the component: either reuses self.main_element (matrix_id null)
*        or calls self.get_component() to build a fresh instance bound to the
*        TM row (matrix_id not null). get_component clones main_element's context
*        and sets data_source:'tm' so the component reads from matrix_time_machine
*        instead of the live table.
*     b. Forces read-only rendering: sets context.permissions=1,
*        show_interface.tools=false, show_interface.read_only=true. This prevents
*        the user from accidentally editing the displayed value.
*     c. Renders the component with render_mode:'edit' (the component's edit
*        template is reused in read-only form; a dedicated 'tm' render template
*        does not exist).
*     d. Appends a time_label div below the rendered node showing the label
*        string (e.g. "Now" or the formatted timestamp from the selected row).
*
* The container is cleared before loading (preserve_content:false), so calling
* this function again on the same container replaces the previous content.
*
* (!) When matrix_id is not null, callers MUST pass mode='tm' so that
*     self.get_component() sets data_source:'tm'. Passing 'edit' would cause
*     the component to load from the live table and show the current value again.
*
* @param {Object} self - The tool_time_machine instance.
* @param {HTMLElement} component_container - Target DOM node. Its children are
*   replaced by the spinner and then by the rendered component node.
* @param {string} lang_value - BCP-47-style Dédalo language code, e.g. 'lg-spa'.
*   Passing a falsy value clears the container and returns false immediately.
* @param {string} label - Human-readable label shown in the time_label div,
*   e.g. 'Now' or '2024-03-15 10:42:00'.
* @param {string} mode - Component rendering mode. Use 'edit' for the live panel
*   and 'tm' for the historical preview panel.
* @param {number|null} [matrix_id=null] - Primary key of the matrix_time_machine
*   row to display. null means "display the current live value".
* @returns {HTMLElement|boolean} The spinner/placeholder node returned by
*   ui.load_item_with_spinner (which is replaced asynchronously by the rendered
*   component), or false if lang_value is falsy.
*/
export const add_component = async (self, component_container, lang_value, label, mode, matrix_id=null) => {

	// user select blank lang_value case
		if (!lang_value) {
			while (component_container.firstChild) {
				// remove node from DOM (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// load component gracefully
		const node = ui.load_item_with_spinner({
			container			: component_container,
			preserve_content	: false,
			label				: label,
			callback			: async () => {

				// component load
					const component = matrix_id===null
						? self.main_element
						: await self.get_component(lang_value, mode, matrix_id)

				// set permissions as read
					component.context.permissions = 1

				// show_interface
					component.show_interface.tools = false
					component.show_interface.read_only = true

				// render node
					const node = await component.render({
						render_mode : 'edit'//mode // 'edit'
					})
					if (node) {
						node.classList.add('disabled_component')
					}

				// time_label_node
					const time_label_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'time_label',
						inner_html		: label,
						parent			: component_container
					})

				return node
			}
		})


	return node
}//end add_component



// @license-end
