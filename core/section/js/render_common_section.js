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
};//end render_common_section



/**
* DELETE_RECORD
* Delete selected record or Delete find records
*/
render_common_section.prototype.delete_record = (options) => {

	// Options
	const section_id	= options.section_id
	const section_tipo	= options.section_tipo
	const section		= options.caller
	const sqo			= options.sqo ||
		{
			section_tipo		: [section_tipo],
			filter_by_locators	: [{
				section_tipo	: section_tipo,
				section_id		: section_id
			}],
			limit				: 1
		}

	const element_id = 'delete_'+ section_tipo

	// body_content
		const body_content = ui.create_dom_element({
			element_type : 'div'
		})

	// warning/relation_list
		if (section_id && !options.sqo) {

			// relation_list
				const relation_list = render_relation_list(options)
				body_content.appendChild(relation_list)
		}else{
			
			// warning
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'warning',
					parent			: body_content,
					inner_html		:
						(get_label.warning || 'Warning') + '. ' +
						(get_label.delete_found_records || 'All records found will be deleted. ') +
						(get_label.total || 'Total') + ': '  + section.total
				})
		}

	// dialog
		ui.create_dialog({
			element_id 		: element_id,
			title			: 'Delete...',
			msg				: get_label.are_you_sure_to_delete_this_record || 'Are you sure to delete this record?',
			header_class	: 'light',
			body_class 		: 'light',
			body_content 	: body_content,
			footer_class 	: 'light',
			user_options	: [{
				id 			: 1,
				label 		: get_label.delete_data_and_record || 'delete record',
				class_name 	: 'danger'
			},{
				id 			: 2,
				label 		: get_label.delete_data_only || 'delete data',
				class_name 	: 'warning'
			},{
				id 			: 3,
				label 		: get_label.cancel || 'Cancel',
				class_name 	: 'light'
			}]
		})


	const token = event_manager.subscribe('user_option_'+element_id, fn_delete_option)
	function fn_delete_option(delete_option) {


		switch (delete_option){
			case 1:
				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_record'
				})
			break;

			case 2:
				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_data'
				})
			break;

			default:
		}
		event_manager.unsubscribe(token)
	}


	return false
};//end delete_record




/**
* RENDER_RELATION_LIST
* @return DOM node relation_list_container
*/
const render_relation_list = function(self) {

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
			header				: relation_list_head,
			content_data		: relation_list_body,
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
					tipo			: self.caller.context['relation_list'],
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					mode			: self.mode
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
};//end render_relation_list
