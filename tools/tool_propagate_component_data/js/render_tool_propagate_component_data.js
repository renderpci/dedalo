/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_propagate_component_data */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	// import {get_tool_label} from '../../tool_common/js/tool_common.js'
	// import {printf} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_PROPAGATE_COMPONENT_DATA
* Manages the component's logic and appearance in client side
*/
export const render_tool_propagate_component_data = function() {

	return true
};//end render_tool_propagate_component_data



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_propagate_component_data.js'
* @param object options
* @return DOM node
*/
render_tool_propagate_component_data.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns a standard built tool wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.caller.refresh()
		// 		// when closing the modal, common destroy is called to remove tool and elements instances
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param instance self
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	const fragment = new DocumentFragment()

	// short vars
		const section_tipo		= self.caller.section_tipo
		const component_list	= self.component_list


	// section_info
		const section_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'section_info',
			parent			: fragment
		})

		// section_name
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_name',
				inner_html		: self.caller.label,
				parent			: section_info
			})
		// section_tipo
			ui.create_dom_element({
				element_type	: 'h3',
				class_name		: 'section_tipo',
				inner_html		: self.caller.tipo,
				parent			: section_info
			})

	// components_list_container
		const components_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container',
			parent			: fragment
		})

	// component caller
		self.main_component.render()
		.then(function(component_node){
			components_list_container.appendChild(component_node)
		})

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// info_text
		const section		= self.caller.caller.caller
		const text_string	= self.get_tool_label('content_will_be_added_removed', section.total)
			|| 'The content of the component in the current {0} records will be added or removed'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: text_string,
			parent			: buttons_container
		})

	// response_text
		const response_text = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'response_text',
			parent			: buttons_container
		})

	// button_add
		const button_add = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning add button_add',
			// inner_html	: get_label.tool_do_add || 'Add',
			inner_html		: self.get_tool_label('tool_do_add') || 'Add',
			parent			: buttons_container
		})
		button_add.addEventListener("click", function(e){
			e.preventDefault()
			// propagate_component_data
			if (confirm(get_label.seguro || 'Sure?')) {
				content_data.classList.add('loading')
				self.propagate_component_data('add')
				.then(function(response){
					content_data.classList.remove('loading')
					response_text.innerHTML = response.msg
				})
			}
		})

	// button_delete
		const button_delete = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning remove button_delete',
			// inner_html	: get_label.elminar_contenido || 'Remove',
			inner_html		: self.get_tool_label('tool_do_delete') || 'Delete',
			parent			: buttons_container
		})
		button_delete.addEventListener("click", function(e){
			e.preventDefault()
			// propagate_component_data
			if (confirm(get_label.seguro || 'Sure?')) {
				content_data.classList.add('loading')
				self.propagate_component_data('delete')
				.then(function(response){
					content_data.classList.remove('loading')
					response_text.innerHTML = response.msg
				})
			}
		})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data


