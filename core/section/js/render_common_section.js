/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'



/**
* RENDER_COMMON_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_common_section = function() {

	return true
}//end render_common_section



/**
* DELETE_RECORD
* Delete selected record or Delete find records
* @param object options
* @return bool
*/
render_common_section.prototype.delete_record = (options) => {

	// options
		const section		= options.section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const sqo			= options.sqo

	// short vars
		const total	= section.total
		const label 		= section.label || section_tipo

		const id_label 		= section_id
			? section_id
			: get_label.all_records_found || 'All records found' + ' ('+total+')'

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: (get_label.delete || 'Delete') + ` ID: ${id_label} <span class="note">[${label}]</span>`,
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content delete_record'
		})

		// warning/relation_list
			if (section_id) {

				// relation_list
					const relation_list = render_relation_list({
						section			: section,
						section_id		: section_id,
						section_tipo	: section_tipo
					})
					body.appendChild(relation_list)
			}else{

				// warning
					ui.create_dom_element({
						element_type	: 'h3',
						class_name		: 'warning',
						parent			: body,
						inner_html		:
							(get_label.warning || 'Warning') + '. ' +
							(get_label.delete_found_records || 'All records found will be deleted.') + ' ' +
							(get_label.total || 'Total') + ': '  + total
					})
			}

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer content'
		})

		// button_delete_record
			const button_delete_record = ui.create_dom_element({
				element_type	: 'button',
				class_name 		: 'danger remove',
				text_content 	: get_label.delete_data_and_record || 'Delete record',
				parent			: footer
			})
			button_delete_record.addEventListener("click", function(){
				if (!confirm(get_label.sure)) {
					return
				}
				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_record'
				})
				.then(function(){
					modal.on_close()
				})
			})

		// button_delete_data
			const button_delete_data = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning remove',
				text_content	: get_label.delete_data_only || 'delete data',
				parent			: footer
			})
			button_delete_data.addEventListener("click", function(){
				if (!confirm(get_label.sure)) {
					return
				}
				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_data'
				})
				.then(function(){
					modal.on_close()
				})
			})

	// modal
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer,
			size	: 'small' // string size big|normal
		})


	return true
}//end delete_record



/**
* RENDER_RELATION_LIST
* @return DOM node relation_list_container
*/
const render_relation_list = function(options) {

	// options
		const section		= options.section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// short vars
		const mode = 'edit'
		const tipo = section.context['relation_list']

	// wrapper
		const relation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_container'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			inner_html		: get_label.relaciones || "Relations",
			parent			: relation_list_container
		})

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_container
		})

	// relation_list events
		event_manager.subscribe('relation_list_paginator', fn_relation_list_paginator)

		function fn_relation_list_paginator(relation_list) {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}

	// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: relation_list_head,
			container			: relation_list_body,
			collapsed_id		: 'inspector_relation_list',
			collapse_callback	: unload_relation_list,
			expose_callback		: load_relation_list,
			default_state		: 'closed'
		})
		async function load_relation_list( instance ) {

			relation_list_head.classList.add('up')

			const relation_list	= (instance && instance.model==='relation_list')
				? instance // pagination case do not need to init relation_list
				: await instances.get_instance({
					model			: 'relation_list',
					tipo			: tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					mode			: mode
				})

			await relation_list.build()
			const relation_list_container = await relation_list.render()
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild)
			}
			relation_list_body.appendChild(relation_list_container)
		}
		function unload_relation_list() {

			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild);
			}
			relation_list_head.classList.remove('up')
		}


	return relation_list_container
}//end render_relation_list



/**
* RENDER_SERVER_RESPONSE_ERROR
* Render generic page error (Raspa background)
* @param string msg
* @return DOM node wrapper|error_container
*/
export const render_server_response_error = function(msg, add_wrapper=false) {

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper page'
		})

	// error_container
		const error_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'page_error_container',
			parent			: wrapper
		})

	// icon_dedalo
		ui.create_dom_element({
			element_type	: 'img',
			class_name		: 'icon_dedalo',
			src				: DEDALO_CORE_URL + '/themes/default/dedalo_logo.svg',
			parent			: error_container
		})

	// server_response_error h1
		ui.create_dom_element({
			element_type	: 'h1',
			class_name		: 'server_response_error',
			inner_html		: 'Server response error: <br>' + msg,
			parent			: error_container
		})

	// more_info
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'more_info',
			inner_html		: 'Received data format is not as expected. See your server log for details',
			parent			: error_container
		})

	// add_wrapper false  case
		if (add_wrapper===false) {
			return error_container
		}


	return wrapper
}//end render_server_response_error