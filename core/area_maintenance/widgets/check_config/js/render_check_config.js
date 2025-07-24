// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback,when_in_viewport} from '../../../../common/js/events.js'



/**
* RENDER_CHECK_CONFIG
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

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// maintenance_mode, recovery_mode, notification
	// root only
		if (page_globals.is_root===true) {

			// maintenance_mode
				const maintenance_mode_container = render_maintenance_mode(self)
				content_data.appendChild(maintenance_mode_container)

			// recovery_mode
				const recovery_mode_container = render_recovery_mode(self)
				content_data.appendChild(recovery_mode_container)

			// notification
				const notification_container = render_notification(self)
				content_data.appendChild(notification_container)

		}//end if (page_globals.is_root===true)

	// config vars status
	// config_vars_status_container
		const config_vars_status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'config_vars_status_container',
			parent			: content_data
		})
		const config_vars_node = render_config_vars_status(self)
		config_vars_status_container.appendChild(config_vars_node)


	return content_data
}//end get_content_data_edit



/**
* RENDER_CONFIG_VARS_STATUS
* Create the necessary DOM nodes to display the config vars status.
* @param object self Widget instance
* @return DocumentFragment
*/
const render_config_vars_status = function (self) {

	// value
	const value = self.value || [];

	const fragment = new DocumentFragment();

	// tables
		const tables = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tables',
			parent			: fragment
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
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {

			const item = value[i]

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
					parent			: fragment
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
		}//end for (let i = 0; i < value_length; i++)


	return fragment;
}//end render_config_vars_status



/**
* RENDER_MAINTENANCE_MODE
* Creates the form nodes to switch between maintenance modes
* @param object self
* @return HTMLElement maintenance_mode_container
*/
const render_maintenance_mode = (self) => {

	const maintenance_mode_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container maintenance_mode_container',
	})

	// label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label',
		inner_html		: 'maintenance mode',
		parent			: maintenance_mode_container
	})

	// body_response warning
	const maintenance_mode_body_response = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: "Warning! On true, users other than 'root' will be kicked and will not be able to login in this mode.",
		class_name		: 'body_response'
	})

	// form
	if (self.caller?.init_form) {
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
					dd_request_idle_callback(
						() => {
							// update page_globals value
							page_globals.maintenance_mode = new_maintenance_mode
							// render the page again
							window.dd_page.refresh({
								build_autoload	: false,
								destroy			: false
							})
						}
					)
				}
			}
		})
		if (page_globals.maintenance_mode===false) {
			form_container.button_submit.classList.add('danger')
		}
	}

	// add maintenance_mode_body_response at end
	maintenance_mode_container.appendChild(maintenance_mode_body_response)


	return maintenance_mode_container
}//end render_maintenance_mode



/**
* RENDER_RECOVERY_MODE
* Creates the form nodes to switch between recovery modes
* @param object self
* @return HTMLElement recovery_mode_container
*/
const render_recovery_mode = (self) => {

	const recovery_mode_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container recovery_mode_container',
	})

	// label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label',
		inner_html		: 'recovery mode',
		parent			: recovery_mode_container
	})

	// body_response warning
	const recovery_mode_body_response = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: "Warning! On true, Ontology backup table will be used instead the main Ontology table.",
		class_name		: 'body_response'
	})

	// form
	if (self.caller?.init_form) {
		const submit_label = page_globals.recovery_mode===true
			? 'Deactivate recovery mode'
			: 'Activate recovery mode'
		const new_recovery_mode = !page_globals.recovery_mode
		const form_container = self.caller.init_form({
			submit_label	: submit_label,
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: recovery_mode_container,
			body_response	: recovery_mode_body_response,
			trigger : {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'class_request',
				source	: {
					action : 'set_recovery_mode'
				},
				options	: {
					value : new_recovery_mode

				}
			},
			on_done : (api_response) => {
				if (api_response.result) {
					dd_request_idle_callback(
						() => {
							// update page_globals value
							page_globals.recovery_mode = new_recovery_mode
							// render the page again
							window.dd_page.refresh({
								build_autoload	: false,
								destroy			: false
							})
							// refresh URL (remove possible recovery param to prevent infinite loop)
							const URL = window.location.href.split("recovery")[0];
							window.history.pushState({}, document.title, URL );
						}
					)
				}
			}
		})
		if (page_globals.recovery_mode===false) {
			form_container.button_submit.classList.add('danger')
		}
	}

	// add recovery_mode_body_response at end
	recovery_mode_container.appendChild(recovery_mode_body_response)


	return recovery_mode_container
}//end render_recovery_mode



/**
* RENDER_NOTIFICATION
* Creates the form nodes to send user notifications
* Note that this custom notifications are stored in core_config file
* and read from API update_lock_components_state on every component activation/deactivation
* @param object self
* @return HTMLElement recovery_mode_container
*/
const render_notification = (self) => {

	const notification_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'container'
	})

	// label
	ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'label',
		inner_html		: 'Notification',
		parent			: notification_container
	})

	const dedalo_notification = page_globals.dedalo_notification ?? false;

	// body response
	const notification_body_response = ui.create_dom_element({
		element_type	: 'div',
		inner_html		: "Notification. " + JSON.stringify(dedalo_notification, null, 2),
		class_name		: 'body_response'
	})
	// sample: define('DEDALO_NOTIFICATION', ['msg' => $notice, 'class_name' => 'warning']);

	// form
	if (self.caller?.init_form) {
		const submit_label = !dedalo_notification
			? 'Activate notification'
			: 'Remove notification'

		self.caller.init_form({
			submit_label	: submit_label,
			confirm_text	: get_label.sure || 'Sure?',
			body_info		: notification_container,
			body_response	: notification_body_response,
			inputs			: (dedalo_notification===false)
				? [{
					type		: 'text',
					name		: 'notification_text',
					label		: 'Message here..',
					mandatory	: (dedalo_notification===false)
				  }]
				: null,
			on_submit : async (e, values) => {

				const input				= values.find(el => el.name==='notification_text')
				const notification_text	= input?.value // string like 'My custom notification'

				const notification_value = dedalo_notification===false
					? notification_text
					: false

				const api_response = await data_manager.request({
					body : {
						dd_api			: 'dd_area_maintenance_api',
						action			: 'class_request',
						prevent_lock	: true,
						source			: {
							action : 'set_notification',
						},
						options : {
							value	: notification_value // string|false
						}
					},
					retries : 1, // one try only
					timeout : 3600 * 1000 // 1 hour waiting response
				})
				if(SHOW_DEBUG===true) {
					console.log('debug set_notification api_response:', api_response);
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
					dd_request_idle_callback(
						() => {
							window.dd_page.refresh({
								build_autoload	: false,
								destroy			: false
							})
						}
					)
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
	}

	// add notification_body_response at end
	notification_container.appendChild(notification_body_response)


	return notification_container
}//end render_notification



// @license-end
