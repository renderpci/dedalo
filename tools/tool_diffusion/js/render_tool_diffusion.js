/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_diffusion */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_DIFFUSION
* Manages the component's logic and appearance in client side
*/
export const render_tool_diffusion = function() {

	return true
}//end render_tool_diffusion



/**
* EDIT
* Render tool DOM nodes
* This function is called by render common attached in 'tool_diffusion.js'
* @param object options
* @return DOM node
*/
render_tool_diffusion.prototype.edit = async function(options) {

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
		// const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// const modal		= ui.attach_to_modal(header, wrapper, null)
		// modal.on_close	= () => {
		// 	self.caller.refresh()
		// 	// when closing the modal, common destroy is called to remove tool and elements instances
		// 	self.destroy(true, true, true)
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
		const diffusion_info = self.diffusion_info


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


	// diffusion_info_container
		const diffusion_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'diffusion_info_container',
			parent			: fragment
		})

	// resolve_levels
		const resolve_levels_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'resolve_levels_container',
			parent			: diffusion_info_container
		})
		// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			inner_html		: get_label.niveles || 'Levels',
			parent			: resolve_levels_container
		})
		// resolve_levels_input
		const resolve_levels_node = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'resolve_levels_input',
			value			: self.resolve_levels,
			parent			: resolve_levels_container
		})
		resolve_levels_node.addEventListener('change', function(e) {
			e.preventDefault()
			// fix self levels value
			self.resolve_levels = parseInt(this.value)
			if (self.resolve_levels<1) {
				self.resolve_levels	= 1
				this.value	= 1
			}
		})
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: '',
			inner_html		: self.get_tool_label('depth_levels') || 'Depth levels to solve',
			parent			: resolve_levels_container
		})

	// info
		const button_info = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button info',
			parent			: diffusion_info_container
		})
		const info_div = ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'info_div hide',
			inner_html		: 'diffusion_map: ' + JSON.stringify(diffusion_info.diffusion_map, null, 2),
			parent			: diffusion_info_container
		})
		ui.collapse_toggle_track({
			toggler			: button_info,
			container		: info_div,
			collapsed_id	: 'collapsed_tool_diffusion_info',
			default_state 	: 'closed'
		})

	// publication items
		const publication_items = render_publication_items(self)
		fragment.appendChild(publication_items)

	// info_text
		const total = self.caller.total
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: self.get_tool_label('publish_selected_records', total),
			parent			: diffusion_info_container
		})
		diffusion_info_container

	// buttons_container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'buttons_container',
		// 	parent			: fragment
		// })

	// button_apply
		// const button_apply = ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'success button_apply',
		// 	inner_html		: 'OK',
		// 	parent			: buttons_container
		// })
		// button_apply.addEventListener('click', function(e){
		// 	e.preventDefault()


		// })

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_PUBLICATION_ITEMS
* @return DOM node publication_items
*/
export const render_publication_items = function(self) {

	const diffusion_map = self.diffusion_info.diffusion_map

	const publication_items = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'publication_items'
	})

	for(const diffusion_group_tipo in diffusion_map) {

		const current_diffusion_map = diffusion_map[diffusion_group_tipo] // array

		const current_diffusion_map_length = current_diffusion_map.length
		for (let i = 0; i < current_diffusion_map_length; i++) {

			const item = current_diffusion_map[i]

			const current_diffusion_element_tipo = item.element_tipo

			// publication_items_grid
				const publication_items_grid = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'publication_items_grid',
					parent			: publication_items
				})

			// name
				const name_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.nombre || 'Name',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const name_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// type
				const type_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.tipo || 'Type',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const type_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.class_name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// diffusion_element
				const diffusion_element_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: 'Diffusion element',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const diffusion_element_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: current_diffusion_element_tipo,
					class_name		: 'value',
					parent			: publication_items_grid
				})


			// database
				const database_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: get_label.database || 'Database',
					class_name		: 'label',
					parent			: publication_items_grid
				})
				const database_value = ui.create_dom_element({
					element_type	: 'div',
					inner_html		: item.database_name,
					class_name		: 'value',
					parent			: publication_items_grid
				})

			// container_bottom
				const container_bottom = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'container_bottom',
					parent			: publication_items_grid
				})

				// response_message
					const response_message = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'response_message',
						parent			: container_bottom
					})

				// publication_button
					const publication_button = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'warning publication_button',
						inner_html		: get_label.publicar || 'Publish',
						parent			: container_bottom
					})
					publication_button.addEventListener('click', function(e) {
						e.stopPropagation()

						// user confirmation
							if (!confirm(get_label.sure || 'Sure?')) {
								return
							}

						// clean previous messages
							response_message.classList.remove('error')
							while (response_message.firstChild) {
								response_message.removeChild(response_message.firstChild);
							}

						// spinner
							const spinner = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'spinner',
								parent			: container_bottom
							})
							publication_button.classList.add('hide')

						// export
							self.export({
								diffusion_element_tipo : current_diffusion_element_tipo
							})
							.then(function(api_response){
								console.log('export api_response:', api_response);

								response_message.innerHTML = api_response.msg || 'Unknown error'
								if (api_response.result===false) {
									response_message.classList.add('error')
								}

								spinner.remove()
								publication_button.classList.remove('hide')
							})
					})
		}//end for (let i = 0; i < current_diffusion_map_length; i++)
	}


	return publication_items
}//end render_publication_items
