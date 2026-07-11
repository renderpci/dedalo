// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../core/common/js/ui.js'
	import {event_manager} from '../../../../core/common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../../../core/common/js/events.js'
	import {view_default_list_section} from '../../../../core/section/js/view_default_list_section.js'



/**
* VIEW_TOOL_TIME_MACHINE_LIST
* List-view renderer for the 'tool' variant of the time-machine service.
*
* This module handles the 'tool' case dispatched by
* render_service_time_machine_list.prototype.list when self.view === 'tool'.
* It is used exclusively by tool_time_machine — the standalone restore tool
* opened from the section/component toolbar.
*
* Architecture
* ------------
* The constructor is a no-op placeholder; all behaviour lives on static-style
* properties assigned after the constructor:
*
*   .render             — delegated to view_default_list_section.render, which
*                         calls common_render (paginator + header + content rows).
*   .get_content_data   — delegated to view_default_list_section.get_content_data.
*   .rebuild_columns_map — delegated to view_default_list_section.rebuild_columns_map.
*   .render_column_id   — overridden HERE to produce the tool-specific restore/preview button.
*
* The key difference from the other views ('default', 'mini', 'history') is the
* custom render_column_id implementation: instead of a plain section-id label it
* renders an interactive button whose behaviour depends on the caller's model:
*
*   model === 'section'   — confirms with the user, then calls tool.apply_value()
*                           to restore the entire section record to the selected
*                           time-machine snapshot. On success both main_caller and
*                           the service are refreshed.
*
*   model !== 'section'   — publishes the 'tm_edit_record' event so that the
*                           tool_time_machine component panel can load the
*                           historical component value for preview/editing without
*                           a full page refresh.
*
* Call chain (tool view):
*   service_time_machine.list(options)
*     → render_service_time_machine_list.prototype.list  (view='tool' branch)
*       → view_tool_time_machine_list.render  (= view_default_list_section.render)
*         → common_render  (builds grid; per-row calls section_record.render)
*           → section_record calls render_column_id for the id column cell
*             → view_tool_time_machine_list.render_column_id (this file)
*
* Exports: view_tool_time_machine_list
*/
export const view_tool_time_machine_list = function() {

	return true
}//end view_tool_time_machine_list


// Delegate rendering to view_default_list_section — the tool view uses the same
// grid/paginator/header structure and only overrides the id-column cell content.
view_tool_time_machine_list.render = view_default_list_section.render
view_tool_time_machine_list.get_content_data = view_default_list_section.get_content_data
view_tool_time_machine_list.rebuild_columns_map = view_default_list_section.rebuild_columns_map


/**
* RENDER_COLUMN_ID
* Builds the DOM fragment for the id-column cell of a single time-machine list row,
* providing the primary restore/preview action for the tool_time_machine view.
*
* The returned fragment contains a <button class="button_view"> wrapping:
*   - a <span class="section_id">  showing the numeric section id.
*   - a <span class="button icon"> showing either a 'history' icon (section restore)
*     or an 'eye' icon (component preview), depending on main_caller.model.
*
* Interaction model
* -----------------
* A mousedown listener (click_handler) is attached to button_view. The same handler
* is also attached to every sibling cell in the same grid row (deferred via
* dd_request_idle_callback so sibling nodes exist in the DOM). This lets the user
* click anywhere on a row to trigger the preview, not just the button itself.
*
* click_handler branch logic:
*
*   main_caller.model === 'section':
*     - Shows a confirm() dialog with the tool label 'recover_section_alert'.
*     - On confirmation calls tool.apply_value() with the snapshot locator data.
*     - On success refreshes main_caller (the section) and then service_time_machine.
*     - On failure logs a console.warn and shows an alert with the error message.
*
*   main_caller.model !== 'section' (component case):
*     - Finds the dd559 component instance (modification date) from options.ar_instances.
*     - Publishes the 'tm_edit_record' event with the snapshot locator so the tool
*       panel can render the historical component value without a page reload.
*     - Resets the 'warning' CSS class on all .button_view buttons in the document,
*       then adds 'warning' to this button_view to indicate it is the active row.
*
* Known issues / flags
* --------------------
*   (!) The section-case error path uses alert() (line ~89) for user-facing errors.
*       This is a legacy pattern in Dédalo; do not convert to console.warn without
*       a coordinated UX decision across the codebase.
*   (!) document.querySelectorAll('.button_view') scans the entire document DOM.
*       In a multi-panel layout this resets buttons belonging to other time-machine
*       instances, not just the current one. Scoping to this.node would be safer,
*       but this is pre-existing behaviour — do not change here.
*   (!) The get_tool_label fallback string starts with '*' (e.g. '*Are you sure…'),
*       which is a Dédalo convention marking untranslated placeholder labels.
*
* @param {Object} options - The column-render options object provided by section_record.
*   @param {Object} options.caller - The service_time_machine instance rendering this row.
*   @param {Object} options.locator - Locator object for the snapshot record.
*     @param {string|number} options.locator.caller_section_id   - Section id of the original record.
*     @param {string}        options.locator.caller_section_tipo  - Section tipo of the original record.
*     @param {string|number} options.locator.matrix_id            - Time-machine matrix row id (dd1573).
*     @param {string|number} [options.locator.bulk_process_id]    - Batch operation id (dd1371), if any.
*   @param {Array}  options.ar_instances - Component instances built for this snapshot row;
*     used to locate the dd559 (modification date) instance for the component case.
* @returns {DocumentFragment} Fragment containing the button_view element with its
*   section_id span and icon span.
*/
view_tool_time_machine_list.render_column_id = function(options) {

	// options
		const service_time_machine	= options.caller
		const section_id			= options.locator.caller_section_id
		const section_tipo			= options.locator.caller_section_tipo
		const matrix_id				= options.locator.matrix_id
		const bulk_process_id		= options.locator.bulk_process_id

	// short vars
		// service_time_machine.caller is the tool_time_machine instance;
		// tool.caller is the section or component that opened the tool.
		const tool			= service_time_machine.caller
		const main_caller	= tool.caller
		const fragment		= new DocumentFragment()

	// button_view
		const button_view = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_view',
			parent			: fragment
		})
		const click_handler = (e) => {
			e.stopPropagation()

			// get modification_date and bulk_process_id from options
			// options.locator is the locator of the section record
			// dd559 is the 'when' component in the activity/time-machine section
				const modification_component_date = options.ar_instances.find(instance => instance.tipo === 'dd559');

			if (main_caller.model==='section') {

				// section case
				// user confirmation
					const msg = tool.get_tool_label('recover_section_alert') || '*Are you sure you want to restore this section?'
					if (!confirm(msg)) {
						return
					}

				// apply recover record
				// Restore the entire section record to the state captured in the selected snapshot.
				// lang is set to NOLAN (language-neutral) because TM records are lang-neutral.
					tool.apply_value({
						section_id		: section_id,
						section_tipo	: section_tipo,
						tipo			: section_tipo,
						lang			: page_globals.dedalo_data_nolan,
						matrix_id		: matrix_id
					})
					.then(function(response){
						if (response.result===true) {
							// refresh main section first so it shows the restored data,
							// then refresh the time-machine list to reflect the new state
							main_caller.refresh()
							.then(function(){
								service_time_machine.refresh()
							})
						}else{
							// error case
							console.warn("response:",response);
							alert(response.msg || 'Error. Unknown error on apply tm value');
						}
					})
			}else{

				// component case
				// Rather than restoring immediately, signal the tool panel to load this
				// snapshot for preview and optional apply. Subscribers (tool_time_machine)
				// listen for 'tm_edit_record' and render the historical component value.

				// publish event
					const tm_edit_record_options = {
						tipo			: section_tipo,
						section_id		: section_id,
						matrix_id		: matrix_id,
						modification_component_date	: modification_component_date,
						bulk_process_id	: bulk_process_id || null,
						mode			: 'tm',
						caller			: options
					}
					event_manager.publish('tm_edit_record', tm_edit_record_options)
					// reset buttons
					// (!) Scans the full document — see known issues in function doc-block.
					const dom_buttons_view			= document.querySelectorAll('.button_view')
					const dom_buttons_view_length	= dom_buttons_view.length
					for (let i = dom_buttons_view_length - 1; i >= 0; i--) {
						dom_buttons_view[i].classList.remove('warning')
					}
					// mark this row as the active (previewed) snapshot
					button_view.classList.add('warning')
			}
		}
		button_view.addEventListener('mousedown', click_handler)
		// Attach the same handler to sibling cells so clicking anywhere on the row
		// triggers preview. Deferred until idle so the parent grid row exists in the DOM.
		dd_request_idle_callback(
			() => {
				const children			= button_view.parentNode?.parentNode?.children || []
				const children_length	= children.length
				for (let i = children_length - 1; i >= 0; i--) {
					if(children[i]!==button_view) {
						// 'link' class gives sibling cells a pointer cursor
						children[i].classList.add('link')
						children[i].addEventListener('mousedown', click_handler)
					}
				}
			}
		)

	// section_id
		ui.create_dom_element({
			element_type	: 'span',
			text_content	: section_id,
			class_name		: 'section_id',
			parent			: button_view
		})

	// icon eye time machine preview (eye)
	// 'history' icon indicates a full-section restore; 'eye' indicates component preview
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon ' + (main_caller.model==='section' ? 'history' : 'eye'),
			parent			: button_view
		})


	return fragment
}//end render_column_id



// @license-end
