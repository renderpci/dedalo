// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {
		common_render
	} from './render_service_time_machine_list.js'



/**
* VIEW_MINI_TIME_MACHINE_LIST
* Entry-point namespace for the 'mini' view of the time-machine list, used
* by the inspector panel.
*
* This is one of four sibling view modules dispatched by
* render_service_time_machine_list.prototype.list() based on self.view:
*   - 'default'  → view_default_time_machine_list  (all columns, full paginator + header)
*   - 'mini'     → this module  (hides matrix_id + bulk_process_id for a compact inspector view)
*   - 'history'  → view_history_time_machine_list  (hides matrix_id, where, bulk_process_id; no header row)
*   - 'tool'     → view_tool_time_machine_list      (extends default with a restore button column)
*
* The constructor is a no-op placeholder that always returns true.
* All behaviour lives on the static render() method below.
* No prototype chain is used — callers invoke render() as a plain static function.
*/
export const view_mini_time_machine_list = function() {

	return true
}//end view_mini_time_machine_list



/**
* RENDER
* Produces the main HTMLElement wrapper for the 'mini' time-machine list view.
*
* Before delegating to common_render(), this function narrows the column set by
* injecting two ontology tipo IDs into self.config.ignore_columns:
*   - 'matrix_id'      — internal matrix row identifier, not meaningful to editors
*   - 'bulk_process_id' — bulk-operation batch reference, irrelevant in inspector context
*
* This mutation is intentional: common_render() reads self.config.ignore_columns
* inside rebuild_columns_map() to filter the columns_map before building the grid.
*
* The options object is forwarded unmodified; in particular render_level and
* no_header are honoured by common_render with their default values ('full' and
* false respectively), so the mini view still shows a column-header row.
*
* (!) Mutates self.config.ignore_columns directly; the calling service instance
*     is modified in place. This is consistent with sibling views (history, tool).
*
* (!) The inline comment "fix f.config.ignore_columns" contains a stale "f."
*     prefix — it refers to self.config.ignore_columns. This is a comment artefact
*     and does not affect runtime behaviour; do not rename the variable.
*
* @param {Object} self - service_time_machine instance; must carry config, rqo,
*   paginator, columns_map, section_tipo, tipo, mode, view, and type properties
* @param {Object} options - render options forwarded verbatim to common_render
*   @param {string} [options.render_level='full'] - 'full' returns the complete
*     wrapper div; 'content' returns only the inner content_data element
*   @param {boolean} [options.no_header=false] - when true, suppresses the
*     column-header row inside list_body
* @returns {Promise<HTMLElement>} resolves to the wrapper div (or content_data
*   element when render_level === 'content')
*/
view_mini_time_machine_list.render = async function(self, options) {

	// fix f.config.ignore_columns
	// Restrict visible columns to those relevant in the inspector's compact view.
	// 'matrix_id' and 'bulk_process_id' are internal identifiers with no display value here.
	self.config.ignore_columns = ['matrix_id', 'bulk_process_id']

	return common_render(self, options)
}//end render



// @license-end
