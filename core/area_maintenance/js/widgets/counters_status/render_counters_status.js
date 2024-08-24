// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {open_window, object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_COUNTERS_STATUS
* Manages the component's logic and appearance in client side
*/
export const render_counters_status = function() {

	return true
}//end render_counters_status



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* 	Sample:
* 	{
*		render_level : "full"
		render_mode : "list"
*   }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_counters_status.prototype.list = async function(options) {

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
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// short vars
		const value		= self.value || {}
		const datalist	= value.datalist
		const errors	= value.errors

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// counters_total
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'counters_total',
			inner_html		: 'Counters total: ' + datalist.length,
			parent			: content_data
		})

	// errors
		if (errors && errors.length>0) {
			const errors_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'errors_container',
				inner_html		: 'Some errors found',
				parent			: content_data
			})
			ui.create_dom_element({
				element_type	: 'pre',
				class_name		: 'error_pre',
				inner_html		: errors.join('\n'),
				parent			: errors_container
			})
		}

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// datalist
		const datalist_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'datalist_container',
			parent			: content_data
		})
		// header

		// list
			const full_list = [{
				type			: 'header',
				section_tipo	: 'Section tipo',
				label			: 'Section name',
				counter_value	: 'Counter value',
				last_section_id	: 'Last section_id'
			}, ...datalist]
			const full_list_length = full_list.length
			for (let i = 0; i < full_list_length; i++) {

				const item = full_list[i]

				const last_section_id	= item.last_section_id || 'empty'
				const out_of_sync		= last_section_id!=='empty' && item.counter_value!==last_section_id
				const class_type		= item.type
					? ' ' + item.type
					: ''

				// datalist_item_container
					const ctn_class = item.type==='header' ? ' header' : ''
					const datalist_item_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'datalist_item_container' + ctn_class,
						parent			: datalist_container
					})

				// section_tipo
					const section_tipo_node = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column' + class_type,
						inner_html		: item.section_tipo,
						parent			: datalist_item_container
					})
					if (item.type!=='header') {
						section_tipo_node.classList.add('link')
						section_tipo_node.addEventListener('click', function(e) {
							// open a new window
							const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
								tipo	: item.section_tipo,
								mode	: 'list',
								menu	: false
							})
							const new_window = open_window({
								url		: url,
								name	: 'section_view'
							})
						})
					}

				// section_name
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column' + class_type,
						inner_html		: item.label,
						parent			: datalist_item_container
					})

				// counter_value
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right' + class_type,
						inner_html		: item.counter_value,
						parent			: datalist_item_container
					})

				// last_section_id
					const lsid_class = item.type!=='header' && out_of_sync===true
						? ' out_of_sync' + class_type
						: class_type
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right' + lsid_class,
						inner_html		: last_section_id,
						parent			: datalist_item_container
					})

				// fix_counter_container
					const fix_counter_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right fix_counter_container' + class_type,
						parent			: datalist_item_container
					})
					if (item.type==='header') {
						fix_counter_container.insertAdjacentHTML('afterbegin', 'Fix counter')
					}else if(out_of_sync) {
						const button_fix = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'light button_action fix_counter',
							inner_html		: 'Fix counter',
							parent			: fix_counter_container
						})
						button_fix.addEventListener('click', fn_fix_counter)
						async function fn_fix_counter(e) {
							e.stopPropagation()

							// confirm action
								if (!confirm( get_label.sure || 'Sure?' )) {
									return false;
								}

							// lock
								content_data.classList.add('lock')

							// spinner
								const spinner = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'spinner'
								})
								body_response.prepend(spinner)

							// modify_counter
								await self.modify_counter({
									counter_action	: 'fix',
									section_tipo	: item.section_tipo,
									body_response	: body_response
								})

							// lock
								content_data.classList.remove('lock')
								spinner.remove()
						}//end fn_fix_counter
					}

				// reset_counter_container
					const reset_counter_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'item_column right reset_counter_container' + class_type,
						parent			: datalist_item_container
					})
					if (item.type==='header') {
						reset_counter_container.insertAdjacentHTML('afterbegin', 'Reset counter')
					}else{
						const button_reset_counter = ui.create_dom_element({
							element_type	: 'button',
							class_name		: 'warning button_action reset_counter',
							inner_html		: 'Reset counter',
							parent			: reset_counter_container
						})
						button_reset_counter.addEventListener('click', fn_reset_counter)
						async function fn_reset_counter(e) {
							e.stopPropagation()

							// confirm action
								if (!confirm( 'Warning! \nReset counter will delete this section ['+item.section_tipo+'] counter. \nThis action cannot be undone.' )) {
									return false;
								}
								if (!confirm( get_label.sure || 'Sure?' )) {
									return false;
								}

							// lock
								content_data.classList.add('lock')

							// spinner
								const spinner = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'spinner'
								})
								body_response.prepend(spinner)

							// modify_counter
								await self.modify_counter({
									counter_action	: 'reset',
									section_tipo	: item.section_tipo,
									body_response	: body_response
								})

							// lock
								content_data.classList.remove('lock')
								spinner.remove()
						}//end fn_reset_counter
					}

			}//end for (let i = 0; i < full_list_length; i++)

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end get_content_data_edit



// @license-end
