// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
 	import {dd_request_idle_callback,when_in_viewport} from '../../../../common/js/events.js'
 	import {check_server_health,data_manager,get_api_health_url,get_api_url} from '../../../../common/js/data_manager.js'
	import {set_widget_label_style} from '../../../js/render_area_maintenance.js'



/**
* RENDER_SYSTEM_INFO
* Manages the widget logic and appearance in client side
*/
export const render_system_info = function() {

	return true
}//end render_system_info



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
render_system_info.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = await render_content_data(self)
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
* RENDER_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const render_content_data = async function(self) {

	// short vars
		const value		= self.value || {}
		const errors	= value.errors || []

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// info errors
		if (errors.length) {
			const text = `Errors found. Fix this errors before continue: <br>` + errors.join('<br>')
			ui.create_dom_element({
				element_type	: 'div',
				inner_html		: text,
				class_name		: 'info_text error',
				parent			: content_data
			})
		}

	// datalist_container
		const datalist_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'datalist_container',
			inner_html		: 'Collecting system info. Please wait..',
			parent			: content_data
		})

		// get system data from API
		let load_status = null
		const load_data = () => {
			// prevent to load multiple times
			if (load_status!==null) {
				return
			}

			// clean node
			while (datalist_container.firstChild) {
				datalist_container.removeChild(datalist_container.firstChild);
			}

			load_status = 'loading'
			const spinner = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'spinner',
				parent			: datalist_container
			})
			const info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info',
				inner_html		: 'Collecting system info. Please wait..',
				parent			: datalist_container
			})

			self.get_value()
			.then(function(value){
				load_status = 'loaded'
				spinner.remove()
				info.remove()
				// fix value
				self.value = value
				// render system info to datalist_container
				render_datalist(self, datalist_container)
			})
		}
		// force load system info to allow update widget label color
		setTimeout(load_data, 1500)

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end render_content_data



/**
* RENDER_DATALIST
* Create the datalist nodes and add nodes to datalist_container
* @param object self
* @return bool
*/
const render_datalist = (self, datalist_container) => {

	// short vars
		const value				= self.value || {}
		const system_list		= value.system_list || []
		const requeriments_list	= value.requeriments_list || []
		const errors			= value.errors || []

	// set widget container label color style
		dd_request_idle_callback(
			() => {
				if (errors.length) {
					set_widget_label_style(self, 'danger', 'add', datalist_container)
				}else{
					set_widget_label_style(self, 'danger', 'remove', datalist_container)
				}
			}
		)

	const fragment = new DocumentFragment()

	// Dédalo health_list
		const health_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container health_list_container',
			parent			: fragment
		})
		health_list_container.appendChild(
			render_health_list(self)
		)

	// Dédalo requeriments_list
		const requeriments_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container requeriments_list_container',
			parent			: fragment
		})
		requeriments_list_container.appendChild(
			render_requeriments_list(requeriments_list, self, datalist_container)
		)

	// System overview system_list
		const system_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container system_list_container',
			parent			: fragment
		})
		system_list_container.appendChild(
			render_system_list(system_list)
		)

	// clean node
		while (datalist_container.firstChild) {
			datalist_container.removeChild(datalist_container.firstChild);
		}

	// append to datalist_container
		datalist_container.appendChild(fragment)


	return true
}//end render_datalist



/**
* RENDER_HEALTH_LIST
* Render the list of Dédalo health check
* @param object self
* 	widget instance
* @return DocumentFragment
*/
const render_health_list = function (self) {

	const fragment = new DocumentFragment()

	const api_health_url = get_api_health_url()

	// environment
	const get_environment = async () => {
		return data_manager.request({
			body : {
				dd_api			: 'dd_core_api',
				action			: 'get_environment',
				prevent_lock	: true,
			},
			retries : 1, // one try only
			timeout : 3600 * 1000 // 1 hour waiting response
		})
	}

	// failed_list
		const failed_list = []

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Check',
			parent			: info_item
		})
		// result label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Result',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Info',
			parent			: info_item
		})

	const checks_list = [
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'check_server_health',
		'get_environment',
	]
	const total_tries = checks_list.length
	for (let i = 0; i < total_tries; i++) {

		const check_name = checks_list[i]

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})
		// name
		const name_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: 'Loading..',
			parent			: info_item
		})

		// value
		const value_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value',
			parent			: info_item
		})

		// info text
		const info_column = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			parent			: info_item
		})

		const start_time = performance.now();

		switch (check_name) {

			case 'check_server_health':
				check_server_health()
				.then(function(result){

					name_node.innerHTML = `API health call ${i+1}`

					const total_time = performance.now() - start_time;

					value_node.innerHTML = JSON.stringify(result, null, 2)

					// icon success / failed
					if (result) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon check success',
							parent			: value_node
						})
					}else{
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon cancel error',
							parent			: value_node
						})

						failed_list.push('Health API check ', i+1)
					}

					info_column.innerHTML = `The API health endpoint (${api_health_url}) check takes ${total_time.toFixed(2)}ms.`
					if (total_time > 150) {
						info_column.classList.add('warning')
					}
				})
				break;

			case 'get_environment':
				get_environment()
				.then(function(response){

					name_node.innerHTML = 'API environment call'

					const total_time = performance.now() - start_time;

					value_node.innerHTML = JSON.stringify(response.result!==false, null, 2)

					// icon success / failed
					if (response.result!==false) {
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon check success',
							parent			: value_node
						})
					}else{
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'button icon cancel error',
							parent			: value_node
						})

						failed_list.push('Environment API check ', i+1)
					}

					info_column.innerHTML = `The API environment check takes ${total_time.toFixed(2)}ms.`
					if (total_time > 300) {
						info_column.classList.add('warning')
					}
				})
				break;
		}//end switch (check_name)
	}//end for (let i = 0; i < total_tries; i++)

	// failed list
	if (failed_list.length>0) {
		dd_request_idle_callback(
			() => {
				set_widget_label_style(self, 'danger', 'add', datalist_container)
			}
		)
	}


	return fragment
}//end render_health_list



/**
* RENDER_REQUERIMENTS_LIST
* Render the list of Dédalo requirements check
* @param array system_list
* @return DocumentFragment
*/
const render_requeriments_list = function (requeriments_list, self, datalist_container) {

	const fragment = new DocumentFragment()

	// failed_list
		const failed_list = []

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Check',
			parent			: info_item
		})
		// result label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Result',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Info',
			parent			: info_item
		})

	const requeriments_list_length = requeriments_list.length
	for (let i = 0; i < requeriments_list_length; i++) {

		const item = requeriments_list[i]

		const name	= item.name
		const value	= item.value
		const info	= item.info

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})

		// name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: name,
			parent			: info_item
		})

		// value
		const class_add = (typeof value === 'boolean')
			? (value===true ? ' success' : ' failed')
			: ''
		const value_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value' + class_add,
			inner_html		: JSON.stringify(value, null, 2),
			parent			: info_item
		})

		// icon success / failed
		if (class_add===' success') {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon check success',
				parent			: value_node
			})
		}else if(class_add===' failed') {
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button icon cancel error',
				parent			: value_node
			})

			failed_list.push(name)
		}

		// info text
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			inner_html		: info,
			parent			: info_item
		})
	}

	// failed list
	if (failed_list.length>0) {
		dd_request_idle_callback(
			() => {
				set_widget_label_style(self, 'danger', 'add', datalist_container)
			}
		)
	}


	return fragment
}//end render_requeriments_list



/**
* RENDER_SYSTEM_LIST
* Render the list of server resources like OS, RAM, etc.
* @param array system_list
* @return DocumentFragment
*/
const render_system_list = function (system_list) {

	const fragment = new DocumentFragment()

	// header
		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item header',
			parent			: fragment
		})
		// Check label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Server info',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			inner_html		: 'Value',
			parent			: info_item
		})

	const system_list_length = system_list.length
	for (let i = 0; i < system_list_length; i++) {

		const item = system_list[i]

		const name	= item.name
		const value	= item.value

		// info_item
		const info_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_item',
			parent			: fragment
		})

		// name
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'name',
			inner_html		: name,
			parent			: info_item
		})

		// value
		const value_string = typeof value==='string'
			? value
			: JSON.stringify(value, null, 2)
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'value',
			inner_html		: value_string,
			parent			: info_item
		})
	}


	return fragment
}//end render_system_list



// @license-end
