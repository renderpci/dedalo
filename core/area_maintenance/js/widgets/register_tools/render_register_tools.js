// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'
	import {set_widget_label_style} from '../../../js/render_area_maintenance.js'


/**
* RENDER_REGISTER_TOOLS
* Manages the widget logic and appearance in client side
*/
export const render_register_tools = function() {

	return true
}//end render_register_tools



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
render_register_tools.prototype.list = async function(options) {

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
		const datalist	= value.datalist || []
		const errors	= value.errors || []

	// check versions
		const outdated = datalist.reduce((carry, value) => {
			if (value.version !== value.installed_version) {
				carry.push(value)
			}
			return carry
		}, [])

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})

	// set widget container label color style
		if (errors.length || outdated.length) {
			const when_in_dom_handler = () => {
				const wrapper = self.node
				const widget_container = wrapper.parentNode.parentNode
				if (widget_container) {
					widget_container.classList.add('danger')
				}
			}
			when_in_dom(content_data, when_in_dom_handler)
		}

	// datalist
		// header
			const tool_item = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_item header',
				parent			: content_data
			})
			// name
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_name',
				inner_html		: get_label.name || 'Name',
				parent			: tool_item
			})

			// developer
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'developer',
				inner_html		: get_label.developer || 'Developer',
				parent			: tool_item
			})

			// version
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_version',
				inner_html		: get_label.version || 'Version',
				parent			: tool_item
			})

			// installed_version
			const installed_version_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_installed_version',
				inner_html		: get_label.installed || 'Installed',
				parent			: tool_item
			})

			// warning
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tool_warning',
				inner_html		: get_label.informacion || 'Info',
				parent			: tool_item
			})

		// list
			const datalist_length = datalist.length
			for (let i = 0; i < datalist_length; i++) {

				const item = datalist[i]

				const name				= item.name
				const version			= item.version
				const developer			= item.developer
				const installed_version	= item.installed_version
				const ar_warning		= item.warning
					? [item.warning]
					: []

				// tool_item
				const tool_item = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_item',
					parent			: content_data
				})

				// name
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_name',
					inner_html		: name,
					parent			: tool_item
				})

				// developer
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'developer',
					inner_html		: developer,
					parent			: tool_item
				})

				// version
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_version',
					inner_html		: version,
					parent			: tool_item
				})

				// installed_version
				const installed_version_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_installed_version',
					inner_html		: installed_version,
					parent			: tool_item
				})
				if (installed_version!==version) {
					installed_version_node.classList.add('warning')
				}

				// warning
				if (!version) {
					ar_warning.push('Tool version not defined')
				}
				if (!installed_version) {
					ar_warning.push('Installed version not defined')
				}
				const warning_node = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tool_warning',
					inner_html		: ar_warning.join('<br>'),
					parent			: tool_item
				})
			}

	// info errors
		if (value.errors) {
			const text = `Errors found. Fix this errors before continue: <br>` + value.errors.join('<br>')
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
		if (self.caller?.init_form) {
			self.caller.init_form({
				submit_label	: get_label.registrar_herramientas || self.name,
				confirm_text	: get_label.sure || 'Sure?',
				body_info		: content_data,
				body_response	: body_response,
				trigger : {
					dd_api	: 'dd_area_maintenance_api',
					action	: 'class_request',
					source	: {
						action : 'register_tools'
					},
					options	: {}
				}
			})
		}

	// add at end body_response
		content_data.appendChild(body_response)


	return content_data
}//end render_content_data



// @license-end
