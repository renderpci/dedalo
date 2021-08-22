/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {render_components_list} from '../../../core/common/js/render_common.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import * as instances from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_tool_export
* Manages the component's logic and apperance in client side
*/
export const render_tool_export = function() {
	
	return true
};//end render_tool_export



/**
* RENDER_tool_export
* Render node for use like button
* @return DOM node
*/
render_tool_export.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// tool_container container
		const header = wrapper.querySelector('.tool_header')
		const tool_container  = ui.attach_to_modal(header, wrapper, null, 'big')
		tool_container.on_close = async () => {
			// tool destroy
				await self.destroy(true, true, true)
			// refresh source component text area
				if (self.caller) {
					self.caller.refresh()
				}
		}

	return wrapper
};//end render_tool_export



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// components_list_container
		const components_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_list_container',
			parent			: fragment
		})
		// fields list . List of section fields usable in search
			// const search_container_selector = ui.create_dom_element({
			// 	element_type	: 'ul',
			// 	class_name		: 'search_section_container target_container',
			// 	parent			: components_list_container
			// })

		// components_list. render section component list [left]
			await render_components_list({
				self			: self,
				section_tipo	: self.target_section_tipo,
				target_div		: components_list_container,
				path			: []
			})

				console.log("self.components_list:",self.components_list);

	// export_components_container
		const export_components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_components_container',
			parent			: fragment
		})
			const list_title = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_title',
				text_content 	: get_label.elementos_activos,
				parent			: export_components_container
			})
			// drag and drop events
		export_components_container.addEventListener('dragstart',function(e){self.on_dragstart(this,e)})
		export_components_container.addEventListener('dragend',function(e){self.on_drag_end(this,e)})
		export_components_container.addEventListener('drop',function(e){self.on_drop(this,e)})
		export_components_container.addEventListener('dragover',function(e){self.on_dragover(this,e)})
		export_components_container.addEventListener('dragleave',function(e){self.on_dragleave(this,e)})

	// export_buttons_config
		const export_buttons_config = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_config',
			parent			: fragment
		})

	// export_buttons_options
		const export_buttons_options = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'export_buttons_options',
			parent			: fragment
		})

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data ' + self.type
		})
		content_data.appendChild(fragment)



	return content_data
};//end get_content_data_edit





/**
* BUILD_export_COMPONENT
* @return dom object
*/
render_tool_export.prototype.build_export_component = async function(parent_div, path_plain, ddo) {

	const self = this

	const path			= JSON.parse(path_plain)
	const last_item		= path[path.length-1]
	const first_item	= path[0]


	// export_component container. Create dom element before load html from trigger
		const export_component = ui.create_dom_element({
			element_type	: 'div',
			parent			: parent_div,
			class_name		: "export_component",
			data_set		: {
				path		: path_plain,
				// section_id	: section_id
			}
		})

	// component  node
	const component_node		= ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'component_label',
			inner_html		: ddo.label,
			// draggable		: is_draggable,
			data_set		: {
				path			: path,
				tipo			: ddo.tipo,
				section_tipo	: ddo.section_tipo,
			}
		})

	// Inject component html
		export_component.appendChild(component_node)

	// button close
		const export_component_button_close = ui.create_dom_element({
			element_type	: 'span',
			parent			: export_component,
			class_name		: "button close"
		})
		export_component_button_close.addEventListener("click",function(e){
			// remove search box and content (component) from dom
			export_component.parentNode.removeChild(export_component)
			// delete the instance from search ar_instances
			const delete_ddo_index = self.ar_ddo_to_export.findIndex( el => el.id === ddo.id )
			self.ar_instances.splice(delete_instance_index, 1)
			// destroy component instance
			// component_instance.destroy(true);
			// Set as changed
			// self.update_state({state:'changed'})
		})

	// label component source if exists
		if (first_item!==last_item) {
			//console.log("first_item:",first_item);
			const label_add = parent_div.querySelector("span.label_add")
			if (label_add) {
				label_add.innerHTML = first_item.name +" "+ label_add.innerHTML
			}
		}

	// show hidden parent cantainer
		parent_div.classList.remove("hide")


	return true
};//end build_export_component



