// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'



/**
* RENDER_COMMON_SECTION
* Manages the component's logic and appearance in client side
*/
export const render_common_section = function() {

	return true
}//end render_common_section



/**
* RENDER_DELETE_RECORD_DIALOG
* Delete selected record or Delete find records
* @param object options
* @return dd-modal modal
*/
render_common_section.prototype.render_delete_record_dialog = async (options) => {

	// options
		const section		= options.section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const sqo			= options.sqo

	// short vars
		const total			= await section.get_total()
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
						self			: section,
						section_tipo	: section_tipo,
						section_id		: section_id
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

		// delete diffusion records
			const delete_diffusion_records_label = ui.create_dom_element({
				element_type	: 'label',
				class_name		: 'block_label unselectable',
				inner_html		: get_label.delete_diffusion_records || 'Delete diffusion records',
				parent			: body
			})
			const delete_diffusion_records_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox'
			})
			delete_diffusion_records_checkbox.checked = true
			delete_diffusion_records_label.prepend(delete_diffusion_records_checkbox)

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
			const click_delete_record_handler = (e) => {
				e.stopPropagation()

				if (!confirm(get_label.sure)) {
					return
				}

				// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner spinner_modal',
					parent			: body
				})
				body.classList.add('loading')
				footer.classList.add('loading')

				section.delete_section({
					sqo							: sqo,
					delete_mode					: 'delete_record',
					delete_diffusion_records	: delete_diffusion_records_checkbox.checked
				})
				.then(function(){
					modal.on_close()
				})
			}
			button_delete_record.addEventListener('click', click_delete_record_handler)

		// button_delete_data
			const button_delete_data = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning remove',
				text_content	: get_label.delete_data_only || 'delete data',
				parent			: footer
			})
			const click_delete_data_handler = (e) => {
				e.stopPropagation()

				if (!confirm(get_label.sure)) {
					return
				}

				// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner spinner_modal',
					parent			: body
				})
				body.classList.add('loading')
				footer.classList.add('loading')

				section.delete_section({
					sqo			: sqo,
					delete_mode	: 'delete_data'
				})
				.then(function(){
					modal.on_close()
				})
			}
			button_delete_data.addEventListener('click', click_delete_data_handler)

	// modal
		const modal = ui.attach_to_modal({
			header		: header,
			body		: body,
			footer		: footer,
			size		: 'small', // string size small|big|normal
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '34rem'
				dd_modal.modal_content.style.maxWidth = '100%'
			}
		})


	return modal
}//end render_delete_record_dialog



/**
* RENDER_RELATION_LIST
* @param object options
* {
* 	section_tipo: string 'oh1',
* 	section_id: int 1
* }
* @return HTMLElement relation_list_container
*/
export const render_relation_list = function(options) {

	// options
		const self			= options.self
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

	// short vars
		const mode			= 'edit'
		const id_variant	= section_tipo +'_'+ section_id +'_'+ (new Date()).getTime()

	// wrapper
		const relation_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_container block'
		})

	// relation_list_head
		const relation_list_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_head icon_arrow',
			inner_html		: get_label.relations || 'Relations',
			parent			: relation_list_container
		})

	// relation_list_body
		const relation_list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'relation_list_body hide',
			parent			: relation_list_container
		})

	// relation_list events
		const relation_list_paginator_handler = (relation_list) => {
			relation_list_body.classList.add('loading')
			load_relation_list(relation_list)
			.then(function(){
				relation_list_body.classList.remove('loading')
			})
		}
		self.events_tokens.push(
			event_manager.subscribe('relation_list_paginator_'+section_tipo, relation_list_paginator_handler)
		)

	// track collapse toggle state of content
		const load_relation_list = async function(instance) {

			relation_list_head.classList.add('up')

			// spinner
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner',
					parent			: relation_list_body
				})

			const relation_list	= (instance && instance.model==='relation_list')
				? instance // pagination case do not need to init relation_list
				: await get_instance({
					model			: 'relation_list',
					tipo			: section_tipo,
					section_tipo	: section_tipo,
					section_id		: section_id,
					mode			: mode,
					id_variant		:id_variant
				})

			// height preserve
				const height = relation_list_body.getBoundingClientRect().height
				relation_list_body.style.minHeight = height + 'px'

			await relation_list.build()
			const relation_list_container = await relation_list.render()
			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild)
			}
			relation_list_body.appendChild(relation_list_container)

			// height preserve
				setTimeout(function(){
					relation_list_body.style.minHeight = null
				}, 1)
		}
		const unload_relation_list = function() {

			while (relation_list_body.firstChild) {
				relation_list_body.removeChild(relation_list_body.firstChild);
			}
			relation_list_head.classList.remove('up')
		}
		ui.collapse_toggle_track({
			toggler				: relation_list_head,
			container			: relation_list_body,
			collapsed_id		: 'inspector_relation_list',
			collapse_callback	: unload_relation_list,
			expose_callback		: load_relation_list,
			default_state		: 'closed'
		})


	return relation_list_container
}//end render_relation_list



/**
* NO_RECORDS_NODE
* @return HTMLElement node
*/
export const no_records_node = () => {

	const node = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'no_records',
		inner_html		: get_label.no_records || 'No records found'
	})

	return node
}//end no_records_node



// @license-end
