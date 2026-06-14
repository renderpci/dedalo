// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {
		common_render
	} from './render_service_time_machine_list.js'



/**
* VIEW_DEFAULT_TIME_MACHINE_LIST
* Entry-point namespace for the 'default' view of the time-machine list.
*
* This is one of four sibling view modules dispatched by
* render_service_time_machine_list.prototype.list() based on self.view:
*   - 'default'  → this module  (full list with paginator, header row, all columns)
*   - 'mini'     → view_mini_time_machine_list  (hides matrix_id + bulk_process_id)
*   - 'history'  → view_history_time_machine_list (hides matrix_id, where, bulk_process_id; no header)
*   - 'tool'     → view_tool_time_machine_list (extends view_default_list_section with restore button)
*
* The constructor is a no-op placeholder; all behaviour lives on the static render() method.
* No prototype methods are defined — callers access render() as a plain static function.
*/
export const view_default_time_machine_list = function() {

	return true
}//end view_default_time_machine_list



/**
* RENDER
* Produces the main HTMLElement wrapper for the 'default' time-machine list view.
*
* Delegates entirely to common_render(), which handles:
*   - rebuilding the columns_map (honouring config.ignore_columns)
*   - fetching and rendering section_record instances in 'tm' mode
*   - building the paginator container
*   - constructing list_body with a header row and content_data div
*
* The 'default' view applies no column filtering and passes options through
* unmodified — contrast with 'mini' / 'history' views that override
* self.config.ignore_columns before calling common_render.
*
* @param {Object} self - service_time_machine instance carrying config, rqo, paginator, etc.
* @param {Object} options - render options forwarded to common_render
*   @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*     'content' returns only the inner content_data element
*   @param {boolean} [options.no_header=false] - when true, suppresses the column-header row
* @returns {Promise<HTMLElement>} resolves to the wrapper div (or content_data div when
*   render_level === 'content')
*/
view_default_time_machine_list.render = async function(self, options) {

	return common_render(self, options)
}//end render



// @license-end
