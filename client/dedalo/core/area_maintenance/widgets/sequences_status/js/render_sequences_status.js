// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_SEQUENCES_STATUS
* Client-side render layer for the sequences_status area_maintenance widget.
*
* This module owns the visual representation of the PostgreSQL sequence-health
* audit produced by db_tasks::check_sequences() (PHP). The server walks every
* public-schema table, compares the sequence's last_value against the actual
* highest `id` in that table, auto-repairs any lagging sequence via setval(),
* and returns an HTML-formatted diagnostic report together with a structured
* per-table value array.
*
* Why sequences matter: PostgreSQL primary-key sequences must always be ahead
* of (or equal to) the highest existing id. A lagging sequence causes the next
* INSERT to attempt an id that is already in use, raising a unique-constraint
* violation. This widget surfaces that state — and the server's auto-repair
* outcome — so administrators can confirm correctness at a glance.
*
* Data shape consumed from self.value (populated by area_maintenance PHP via
* db_tasks::check_sequences() and stored in self.value by widget_common.build
* before the render call):
* {
*   result : boolean — true when all sequences were healthy or auto-repaired
*                      successfully; false when at least one problem persists
*   msg    : string  — HTML-formatted diagnostic output; one block per table,
*                      with <b>WARNING</b> spans and setval() SQL hints for any
*                      table whose sequence lagged behind its highest id
*   values : Array<{
*     table_name   : string — PostgreSQL table name
*     start_value  : number — sequence START WITH value (should always be 1)
*     last_value   : number — sequence's current last_value (next - 1)
*     last_id      : number — actual highest id found in the table
*   }>
* }
*
* Because area_maintenance inlines the value directly on the item descriptor
* passed to widget_factory (see class.area_maintenance.php), this widget has
* no get_value API call of its own — self.value is ready before render() fires.
*
* Exports:
*   render_sequences_status — constructor whose prototype methods are mixed into
*                             sequences_status by sequences_status.js
*/



/**
* RENDER_SEQUENCES_STATUS
* Constructor for the render prototype. sequences_status.js delegates render
* methods onto the sequences_status prototype via prototype assignment so every
* sequences_status instance inherits list() (aliased as both .edit and .list).
* The constructor itself is intentionally a no-op; all real work happens in
* list() and the private get_content_data_edit() helper.
* @returns {boolean} Always true
*/
export const render_sequences_status = function() {

	return true
}//end render_sequences_status



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
render_sequences_status.prototype.list = async function(options) {

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
* Builds the widget's content DOM node from the server-supplied diagnostic
* report returned by db_tasks::check_sequences().
*
* The rendering is intentionally minimal: the server already produces an
* HTML-formatted report string (self.value.msg) that contains per-table
* status lines, bold WARNING notices, and the setval() SQL commands needed
* to fix any remaining drift. This function creates a container div and
* injects that pre-formatted HTML directly via inner_html so that the
* diagnostic detail (colours, bold text, <hr> separators, SQL fragments)
* is preserved exactly as the server composed it.
*
* self.value shape expected:
* {
*   result : boolean  — overall health flag (not rendered directly here)
*   msg    : string   — HTML diagnostic report; injected as innerHTML
*   values : Array    — per-table structured data (not rendered here; present
*                       for callers that may inspect it programmatically)
* }
*
* @param {Object} self - The sequences_status instance. Must expose self.value
*   as set by widget_common.build() before render is called.
* @returns {HTMLElement} content_data - Container div holding the diagnostic
*   report node, ready to be appended to the widget wrapper.
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value			= self.value || {}
		const data_check	= value.data_check || {}
		const list			= value.msg

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: list,
			parent			: content_data
		})


	return content_data
}//end get_content_data_edit



// @license-end
