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
* Manages the service's appearance in client side
*/
export const view_tool_time_machine_list = function() {

	return true
}//end view_tool_time_machine_list


view_tool_time_machine_list.render = view_default_list_section.render
view_tool_time_machine_list.get_content_data = view_default_list_section.get_content_data
view_tool_time_machine_list.rebuild_columns_map = view_default_list_section.rebuild_columns_map


/**
* RENDER_COLUMN_ID
* Creates the column id DOM nodes and events
* @param object options
* @return DocumentFragment
*/
view_tool_time_machine_list.render_column_id = function(options) {

	// options
		const service_time_machine	= options.caller
		const section_id			= options.locator.caller_section_id
		const section_tipo			= options.locator.caller_section_tipo
		const matrix_id				= options.locator.matrix_id		
		const bulk_process_id		= options.locator.bulk_process_id

	// short vars
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
				const modification_component_date = options.ar_instances.find(instance => instance.tipo === 'dd559');

			if (main_caller.model==='section') {

				// section case
				// user confirmation
					const msg = tool.get_tool_label('recover_section_alert') || '*Are you sure you want to restore this section?'
					if (!confirm(msg)) {
						return
					}

				// apply recover record
					tool.apply_value({
						section_id		: section_id,
						section_tipo	: section_tipo,
						tipo			: section_tipo,
						lang			: page_globals.dedalo_data_nolan,
						matrix_id		: matrix_id
					})
					.then(function(response){
						if (response.result===true) {
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

				// publish event
					const tm_edit_record_options = {
						tipo			: section_tipo,
						section_id		: section_id,
						matrix_id		: matrix_id,
						modification_component_date	: modification_component_date,
						bulk_process_id	:  null,
						mode			: 'tm',
						caller			: options
					}
					event_manager.publish('tm_edit_record', tm_edit_record_options)
					// reset buttons
					const dom_buttons_view			= document.querySelectorAll('.button_view')
					const dom_buttons_view_length	= dom_buttons_view.length
					for (let i = dom_buttons_view_length - 1; i >= 0; i--) {
						dom_buttons_view[i].classList.remove('warning')
					}
					button_view.classList.add('warning')
			}
		}
		button_view.addEventListener('mousedown', click_handler)
		// siblings can use click too to easy set preview value
		dd_request_idle_callback(
			() => {
				const children			= button_view.parentNode?.parentNode?.children || []
				const children_length	= children.length
				for (let i = children_length - 1; i >= 0; i--) {
					if(children[i]!==button_view) {
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
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon ' + (main_caller.model==='section' ? 'history' : 'eye'),
			parent			: button_view
		})


	return fragment
}//end render_column_id



// @license-end
