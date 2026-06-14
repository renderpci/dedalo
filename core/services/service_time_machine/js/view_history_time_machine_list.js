// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {
		common_render
	} from './render_service_time_machine_list.js'



/**
* VIEW_HISTORY_TIME_MACHINE_LIST
* View variant for the 'history' rendering mode of service_time_machine.
*
* This view is selected when service_time_machine.view === 'history', which is
* used by the inspector panel to display a compact changelog-style list of past
* activity records for a single component or section.
*
* Compared with the 'mini' view it additionally hides the 'where' column
* (component dd577, the origin URL/context), and always suppresses the list
* header row so the output blends seamlessly into the inspector UI.
*
* The constructor is a no-op placeholder; all logic lives on the static
* render() method assigned below.
*/
export const view_history_time_machine_list = function() {

	return true
}//end view_history_time_machine_list



/**
* RENDER
* Entry point for the 'history' view: configures the columns that should be
* hidden and delegates all DOM construction to common_render().
*
* Before calling common_render() this method mutates self.config.ignore_columns
* to suppress internal/technical columns that are irrelevant in a history
* context:
*   - 'matrix_id'       — internal row identifier in the TM matrix table
*   - 'where'           — dd577, origin URL/context of the activity record
*   - 'bulk_process_id' — dd1371, batch operation identifier
*
* The {no_header: true} option passed to common_render() prevents the column
* header row from being rendered, since the inspector already provides context.
*
* (!) This call overwrites any previously set self.config.ignore_columns value.
* Callers that need custom column suppression must set their own ignore_columns
* AFTER render() has been called, or use a different view.
*
* @param {Object} self - service_time_machine instance being rendered
* @param {Object} options - caller-supplied render options (not forwarded; replaced internally)
* @returns {Promise<HTMLElement>} wrapper element produced by common_render()
*/
view_history_time_machine_list.render = async function(self, options) {

	// fix f.config.ignore_columns
	// Suppress columns that are too technical or redundant in the history/inspector context.
	// 'where' is excluded here (unlike 'mini' view) to keep the list focused on who/when only.
	self.config.ignore_columns = ['matrix_id', 'where', 'bulk_process_id']

	// Delegate to the shared renderer with no_header so the inspector panel
	// is not cluttered by a repeated column header row.
	return common_render(self, {
		no_header : true
	})
}//end render



// @license-end
