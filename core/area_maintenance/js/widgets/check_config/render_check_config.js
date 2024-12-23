// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {open_window, object_to_url_vars} from '../../../../common/js/utils/index.js'



/**
* RENDER_check_config
* Manages the component's logic and appearance in client side
*/
export const render_check_config = function() {

	return true
}//end render_check_config



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
render_check_config.prototype.list = async function(options) {

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
		const value				= self.value || {}
		const info				= value.info || {}
		const errors			= info.errors
		const result			= info.result || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// root only
		if (page_globals.is_root===true) {

			// maintenance mode
			{
				const maintenance_mode_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container maintenance_mode_container',
					parent			: content_data
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label',
					inner_html		: 'Maintenance mode',
					parent			: maintenance_mode_container
				})
				const maintenance_mode_body_response = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: "Warning! On true, users other than 'root' will be kicked and will not be able to login in this mode.",
					class_name		: 'body_response'
				})
				// form
				const submit_label = page_globals.maintenance_mode===true
					? 'Deactivate maintenance mode'
					: 'Activate maintenance mode'
				const new_maintenance_mode = !page_globals.maintenance_mode
				const form_container = self.caller.init_form({
					submit_label	: submit_label,
					confirm_text	: get_label.sure || 'Sure?',
					body_info		: maintenance_mode_container,
					body_response	: maintenance_mode_body_response,
					trigger : {
						dd_api	: 'dd_area_maintenance_api',
						action	: 'class_request',
						source	: {
							action : 'set_maintenance_mode'
						},
						options	: {
							value : new_maintenance_mode
						}
					},
					on_done : (api_response) => {
						if (api_response.result) {
							setTimeout(function(){
								// update page_globals value
								page_globals.maintenance_mode = new_maintenance_mode
								// render the page again
								window.dd_page.refresh({
									build_autoload	: false,
									destroy			: false
								})
							}, 0)
						}
					}
				})
				if (page_globals.maintenance_mode===false) {
					form_container.button_submit.classList.add('danger')
				}

				// add maintenance_mode_body_response at end
				maintenance_mode_container.appendChild(maintenance_mode_body_response)
			}

			// notification
			{
				/* Disable (Experimental with serious security implications)
				const notification_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container',
					parent			: content_data
				})
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label',
					inner_html		: 'Notification',
					parent			: notification_container
				})
				const notification_body_response = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: "Notification. " + JSON.stringify(page_globals.dedalo_notification, null, 2),
					class_name		: 'body_response'
				})
				// sample: define('DEDALO_NOTIFICATION', ['msg' => $notice, 'class_name' => 'warning']);
				// form
				console.log('page_globals.dedalo_notification:', page_globals.dedalo_notification);
				const submit_label = page_globals.dedalo_notification===false
					? 'Activate notification'
					: 'Remove notification'
				const form_container = self.caller.init_form({
					submit_label	: submit_label,
					confirm_text	: get_label.sure || 'Sure?',
					body_info		: notification_container,
					body_response	: notification_body_response,
					inputs			: (page_globals.dedalo_notification===false)
						? [{
							type		: 'text',
							name		: 'notification_text',
							label		: 'Message here..',
							mandatory	: (page_globals.dedalo_notification===false)
						  }]
						: null,
					on_submit : async (e, values) => {

						const input				= values.find(el => el.name==='notification_text')
						const notification_text	= input?.value // string like 'My custom notification'

						const notification_value = page_globals.dedalo_notification===false
							? notification_text
							: false

						const api_response = await data_manager.request({
							body		: {
								dd_api	: 'dd_area_maintenance_api',
								action	: 'class_request',
								source	: {
									action	: 'set_congif_auto',
								},
								options : {
									name	: 'DEDALO_NOTIFICATION_CUSTOM',
									value	: notification_value // string
								}
							}
						})
						if(SHOW_DEBUG===true) {
							console.log('))))))))))))) api_response:', api_response);
						}

						if (api_response.result) {
							// update page_globals value
							page_globals.dedalo_notification = notification_value===false
								? false
								: {
									msg			: notification_value,
									class_name	: 'warning'
								  }
							// render the page again
							setTimeout(function(){
								window.dd_page.refresh({
									build_autoload	: false,
									destroy			: false
								})
							}, 10)
						}else{
							const error_txt = api_response.msg || 'Error setting notification_value (unknown)'
							const error_node = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'error',
								inner_html		: error_txt,
								parent			: notification_body_response
							})
						}
					}
				})
				if (page_globals.dedalo_notification===null) {
					// form_container.button_submit.classList.add('danger')
				}

				// add notification_body_response at end
				notification_container.appendChild(notification_body_response)
				*/
			}
		}//end if (page_globals.is_root===true)


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

	// tables
		const tables = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tables',
			parent			: content_data
		})

	// missing_container
		const missing_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table missing_container',
			parent			: tables
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: 'Missing constants',
			parent			: missing_container
		})

	// obsolete_container
		const obsolete_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'table obsolete_container',
			parent			: tables
		})
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: 'Obsolete constants',
			parent			: obsolete_container
		})

	// result iterate
		const result_length = result.length
		for (let i = 0; i < result_length; i++) {
			const item = result[i]

			// missing
			{
				// file_container (grid)
				const file_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_container ' + item.file_name,
					parent			: missing_container
				})
				// sample_vs_config
				// label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label sample_vs_config',
					inner_html		: `${item.file_name}`,
					parent			: file_container
				})
				// data
				const data_text = item.sample_vs_config.length>0
					? item.sample_vs_config.join('<br>')
					: get_label.ok || 'OK'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'data' + (item.sample_vs_config.length>0 ? ' missing' : ''),
					inner_html		: data_text,
					parent			: file_container
				})
			}

			// obsolete
			{
				// file_container (grid)
				const file_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'file_container ' + item.file_name,
					parent			: obsolete_container
				})
				// config_vs_sample
				// label
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'label config_vs_sample',
					inner_html		: `${item.file_name}`,
					parent			: file_container
				})
				// data
				const data_text = item.config_vs_sample.length>0
					? item.config_vs_sample.join('<br>')
					: get_label.ok || 'OK'
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'data' + (item.config_vs_sample.length>0 ? ' obsolete' : ''),
					inner_html		: data_text,
					parent			: file_container
				})
			}

			// list
			{
				// const_list_node
				const const_list_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'datalist_container show_list',
					inner_html		: '<span class="button icon eye"></span>Display all sample.'+item.file_name+' constants list',
					parent			: content_data
				})
				const_list_node.addEventListener('click', function(e) {
					e.stopPropagation();
					const_list_pre.classList.toggle('hide')
				})
				const const_list	= item.sample_config_constants_list || []
				const const_list_pre = ui.create_dom_element({
					element_type	: 'pre',
					class_name		: 'hide',
					inner_html		: JSON.stringify(const_list, null, 2),
					parent			: const_list_node
				})

			}

		}//end for (let i = 0; i < result_length; i++)


	return content_data
}//end get_content_data_edit



// @license-end
