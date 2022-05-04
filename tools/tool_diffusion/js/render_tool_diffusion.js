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
};//end render_tool_diffusion



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
		const diffusion_info	= self.diffusion_info


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
		ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'resolve_levels_input',
			value			: diffusion_info.resolve_levels,
			parent			: resolve_levels_container
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
			inner_html		: 'diffusion_map: ' + JSON.stringify(diffusion_info.ar_diffusion_map, null, 2),
			parent			: diffusion_info_container
		})
		ui.collapse_toggle_track({
			header			: button_info,
			content_data	: info_div,
			collapsed_id	: 'collapsed_tool_diffusion_info'
		})

	// info_text
		const total = self.caller.total
		const target = 'MySQL'
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'info_text',
			inner_html		: self.get_tool_label('publish_selected_records', total, target),
			parent			: diffusion_info_container
		})
		diffusion_info_container

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
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data


