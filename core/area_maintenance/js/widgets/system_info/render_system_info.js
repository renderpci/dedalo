// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
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

	// datalist

		// datalist_container
			const datalist_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'datalist_container',
				parent			: content_data
			})
			render_datalist(self, datalist_container)

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

	// body_response
		const body_response = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body_response'
		})

	// form init
		// if (self.caller?.init_form) {
		// 	self.caller.init_form({
		// 		submit_label	: get_label.registrar_herramientas || self.name,
		// 		confirm_text	: get_label.sure || 'Sure?',
		// 		body_info		: content_data,
		// 		body_response	: body_response,
		// 		trigger : {
		// 			dd_api	: 'dd_area_maintenance_api',
		// 			action	: 'class_request',
		// 			source	: {
		// 				action : 'system_info'
		// 			},
		// 			options	: {}
		// 		},
		// 		on_done : async () => {

		// 			// get and update value
		// 			self.value = await self.get_widget_value()

		// 			// render datalist again
		// 			render_datalist(self, datalist_container)
		// 		}
		// 	})
		// }

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
		if (errors.length) {
			set_widget_label_style(self, 'danger', 'add', datalist_container)
		}else{
			set_widget_label_style(self, 'danger', 'remove', datalist_container)
		}

	const fragment = new DocumentFragment()

	// Dédalo requeriments_list
		const requeriments_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_container requeriments_list_container',
			parent			: fragment
		})
		requeriments_list_container.appendChild(
			render_requeriments_list(requeriments_list)
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
* RENDER_REQUERIMENTS_LIST
* Render the list of Dédalo requirements check
* @param array system_list
* @return DocumentFragment
*/
const render_requeriments_list = function (requeriments_list) {

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
			class_name		: '',
			inner_html		: 'Check',
			parent			: info_item
		})
		// result label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
			inner_html		: 'Result',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
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
			inner_html		: name + ': ',
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
		}

		// info
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'info',
			inner_html		: info,
			parent			: info_item
		})
	}


	return fragment
}//end render_requeriments_list


/**
* RENDER_SYSTEM_LIST
* Render the list of system resources like OS, RAM, etc.
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
			class_name		: '',
			inner_html		: 'Info',
			parent			: info_item
		})
		// info label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: '',
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
			inner_html		: name + ': ',
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
