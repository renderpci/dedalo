/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_propagate_component_data */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	// import {get_tool_label} from '../../tool_common/js/tool_common.js'
	// import {pause} from '../../../core/common/js/utils/util.js'



/**
* RENDER_TOOL_PROPAGATE_COMPONENT_DATA
* Manages the component's logic and appearance in client side
*/
export const render_tool_propagate_component_data = function() {

	return true
}//end render_tool_propagate_component_data



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_propagate_component_data.js'
* @param object options
* @return HTMLElement wrapper
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


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* Render tool body or 'content_data'
* @param object self
* @return HTMLElement content_data
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
		ui.load_item_with_spinner({
			container	: components_list_container,
			callback	: async () => {
				// await pause(2000)
				await self.get_component_to_propagate()
				const component_node = await self.component_to_propagate.render()
				return component_node
			}
		})


	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// info_text
		const section = self.caller.caller?.caller
		if (!section) {
			console.error('Ignored order. Unable to get section. caller:', self.caller);
			const content_data = ui.tool.build_content_data(self)
			content_data.appendChild(ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'msg',
				inner_html		: 'Caller section is unavailable'
			}))
			return content_data
		}

	// filter. Check the filter to know if the user has apply some filter or if will apply to all records
		const filter = section.rqo && section.rqo.sqo && section.rqo.sqo.filter
			? section.rqo.sqo.filter.$and.length > 0
			: false

		const total = await section.get_total()

		const text_string = self.get_tool_label('content_will_be_added_removed', total)
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

	// button_replace
		const button_replace = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning add button_replace',
			inner_html		: self.get_tool_label('tool_do_replace') || 'Replace values',
			parent			: buttons_container
		})
		button_replace.addEventListener('click', async function(e){
			e.preventDefault()

			await ui.component.deactivate(self.component_to_propagate)

			if(filter === false){
				const alert_replace_all = (self.get_tool_label('will_replaced_all_records') || 'All records will be replaced') + ' '+
				(get_label.total || 'Total') + ': '  + total

				if (!confirm(alert_replace_all)){
					return false
				}
			}
			// propagate_component_data
			if (confirm(get_label.sure || 'Sure?')) {
				content_data.classList.add('loading')
				self.propagate_component_data('replace')
				.then(function(response){
					content_data.classList.remove('loading')
					response_text.innerHTML = response.msg
				})
			}
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
			if (confirm(get_label.sure || 'Sure?')) {
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
			// inner_html	: get_label.delete_content || 'Remove',
			inner_html		: self.get_tool_label('tool_do_delete') || 'Delete',
			parent			: buttons_container
		})
		button_delete.addEventListener("click", function(e){
			e.preventDefault()
			// propagate_component_data
			if (confirm(get_label.sure || 'Sure?')) {
				content_data.classList.add('loading')
				self.propagate_component_data('delete')
				.then(function(response){
					content_data.classList.remove('loading')
					response_text.innerHTML = response.msg
				})
			}
		})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data