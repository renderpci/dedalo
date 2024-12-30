// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



/**
* RENDER_LOCK_COMPONENTS
* Manages the component's logic and appearance in client side
*/
export const render_lock_components = function() {

	return true
}//end render_lock_components



/**
* LIST
* Creates the nodes of current widget.
* The created wrapper will be append to the widget body in area_maintenance
* @param object options
* Sample:
* {
*	render_level : "full"
*	render_mode : "list"
* }
* @return HTMLElement wrapper
* 	To append to the widget body node (area_maintenance)
*/
render_lock_components.prototype.list = async function(options) {

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
		const value			= self.value || {}
		const active_users	= value.active_users || null

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// version
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: `Active users`,
			parent			: content_data
		})

	// info_node
		const info_node = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'info_node',
			parent			: content_data
		})
		if (active_users?.result) {
			print_active_users(active_users)
		}

	// button_refresh
		const button_refresh = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_refresh',
			inner_html		: 'Refresh',
			parent			: content_data
		})
		button_refresh.addEventListener('click', fn_refresh)
		async function fn_refresh(e) {
			e.stopPropagation()

			// lock
				content_data.classList.add('lock')

			// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				info_node.prepend(spinner)

			// request
				const api_response = await data_manager.request({
					use_worker	: true,
					body		: {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'lock_components_actions',
						options	: {
							fn_action : 'get_active_users'
						}
					}
				})

				if (api_response.result) {
					print_active_users(api_response)
				}

			// lock
				content_data.classList.remove('lock')
				// spinner.remove()
		}//end fn_reset_counter
		// force first load
		button_refresh.click()

		function print_active_users(api_response) {
			// clean container
			while (info_node.firstChild) {
				info_node.removeChild(info_node.firstChild);
			}
			const api_response_ar_user_actions_length = api_response.ar_user_actions.length
			for (let i = 0; i < api_response_ar_user_actions_length; i++) {

				const item = api_response.ar_user_actions[i]

				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'icon gear',
					parent			: info_node
				})
				const label = `User ${item.user_id} (${item.full_username}) is editing ${item.component_model} ${item.component_tipo} (${item.component_label})`
					+ ` of section ${item.section_tipo}-${item.section_id} (${item.section_label}) from ${item.date}`
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: '',
					inner_html		: label,
					parent			: info_node
				})
			}
		}

	// button_force_unlock_all_components
		const button_force_unlock_all_components = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_force_unlock_all_components',
			inner_html		: 'Unlock all components',
			parent			: content_data
		})
		button_force_unlock_all_components.addEventListener('click', fn_unlock)
		async function fn_unlock(e) {
			e.stopPropagation()

			// prompt
				const user_id = prompt('User id optional');
				if (user_id===null) {
					// user cancel action case
					return
				}

			// lock
				content_data.classList.add('lock')

			// spinner
				const spinner = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'spinner'
				})
				info_node.prepend(spinner)

			// request
				const api_response = await data_manager.request({
					use_worker	: true,
					body		: {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'lock_components_actions',
						options	: {
							fn_action	: 'force_unlock_all_components',
							user_id		: user_id || null
						}
					}
				})

				info_node.innerHTML = JSON.stringify({
					action	: 'force_unlock_all_components',
					result	: api_response.result,
					msg		: api_response.msg
				}, null, 2)

			// lock
				content_data.classList.remove('lock')
				spinner.remove()
		}//end fn_reset_counter



	return content_data
}//end get_content_data_edit



// @license-end
