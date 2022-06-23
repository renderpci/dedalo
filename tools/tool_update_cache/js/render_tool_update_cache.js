/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_update_cache */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_UPDATE_CACHE
* Manages the component's logic and appearance in client side
*/
export const render_tool_update_cache = function() {

	return true
}//end render_tool_update_cache



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_update_cache.js'
* @param object options
* @return DOM node
*/
render_tool_update_cache.prototype.edit = async function(options) {

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
}//end edit



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

	// components list checkbox
		const options_nodes = []
		const components_list_length = component_list.length
		for (let i = 0; i < components_list_length; i++) {

			const item = component_list[i]

 			// checkbox label
				const option_label = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: item.label,
					parent			: components_list_container
				})
				// info
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: `${item.model} - ${item.tipo}`,
					parent			: option_label
				})

			// input checkbox
				const option = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox',
					id				: section_tipo + '_' +  item.tipo,
					value			: item.tipo
				})
				if (item.model==='component_section_id') {
					option.disabled = true
				}
				option_label.prepend(option)

			// add
				options_nodes.push(option)
		}

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// button_apply
		const button_apply = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'success button_apply',
			inner_html		: 'OK',
			parent			: buttons_container
		})
		button_apply.addEventListener("click", function(e){
			e.preventDefault()
			// selection
				const checked_list			= options_nodes.filter(el => el.checked===true)
				const checked_list_length	= checked_list.length
			// empty case
				if (checked_list_length<1) {
					alert(get_label.seleccion_vacia || 'Empty selection');
					return
				}
			// update_cache
			if (confirm(get_label.seguro || 'Sure?')) {
				content_data.classList.add('loading')
				const ar_component_tipo = checked_list.map(el => el.value)
				self.update_cache(ar_component_tipo)
				.then(function(){
					content_data.classList.remove('loading')
				})
			}
		})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data


