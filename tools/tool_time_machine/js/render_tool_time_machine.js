/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {get_ar_instances} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_TIME_MACHINE
* Manages the component's logic and apperance in client side
*/
export const render_tool_time_machine = function() {

	return true
};//end render_tool_time_machine



/**
* EDIT
* Render node for use like button
* @return DOM node
*/
render_tool_time_machine.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level || 'full'

	// columns_map
		// const columns_map = await rebuild_columns_map(self)
		// self.time_machine.columns_map = columns_map

	// section_record
		// const ar_section_record = await get_ar_instances(self.time_machine)

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// tool_container
		//const tool_container = document.getElementById('tool_container')
		//if(tool_container!==null){
		//	tool_container.appendChild(wrapper)
		//}else{
		//	const main = document.getElementById('main')
		//	const new_tool_container = ui.create_dom_element({
		//		id 				: 'tool_container',
		//		element_type	: 'div',
		//		parent 			: main
		//	})
		//	new_tool_container.appendChild(wrapper)
		//}

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null, 'big')
		// 	modal.on_close	= () => {
		// 		self.destroy(true, true, true) // (delete_self, delete_dependencies, remove_dom)
		// 	}
		// 	// fix
		// 	self.modal_container = modal
		// }

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
};//end render_tool_time_machine



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// const tm_date = new Date();

	// current_component_container
		const current_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'current_component_container',
			parent			: fragment
		})
		if(self.main_element.model !=='section'){
			await add_component(self, current_component_container, self.main_element.lang, get_label.ahora, 'edit', null)
		}

	// preview_component_container
		const preview_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'preview_component_container',
			parent			: fragment
		})
		// set
		self.preview_component_container = preview_component_container

	// tool_bar
		const tool_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tool_bar',
			parent			: fragment
		})
		// lang selector
		if (self.main_element.lang!=='lg-nolan') {

			// label
			ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.idioma,
				parent			: tool_bar
			})
			// selector
			const select_lang = ui.build_select_lang({
				langs		: self.langs,
				selected	: self.lang,
				class_name	: '',
				action		: on_change_select
			})
			function on_change_select(e) {
				const lang = e.target.value
				if (lang!==self.lang) {
					self.lang					= lang
					self.main_element.lang	= lang
					self.refresh()
				}
			}
			tool_bar.appendChild(select_lang)
		}

		// button apply
			self.button_apply = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'warning button_apply lock',
				inner_html		: get_label.aplicar_y_salvar || 'Apply and save',
				parent			: tool_bar
			})
			self.button_apply.addEventListener("click", function(){
				// const response = self.apply_value.bind(self)
				self.apply_value(self)
				.then(function(response){
					if (response.result===true) {
						// success case
						if (window.opener) {
							// close this window when was opened from another
							window.close()
						}
					}else{
						// error case
						console.warn("response:",response);
						alert(response.msg || 'Error. Unknow error on apply tm value');
					}
				})
			})

	// section container
		// const section_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'section_container',
		// 	parent 			: fragment
		// })

	// section list. Call time machine service render callback
		const time_machine_node	= await self.time_machine.render()
		fragment.appendChild(time_machine_node)

	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'buttons_container',
		// 	parent 			: components_container
		// })

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)


	return content_data
};//end content_data_edit



/**
* ADD_COMPONENT
*/
export const add_component = async (self, component_container, lang_value, label, mode, matrix_id=null) => {

	// user select blank lang_value case
		if (!lang_value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// component load
		const component = matrix_id===null
			? self.main_element // self.caller
			: await self.load_component(lang_value, mode, matrix_id)

	// render node
		const node = await component.render({
			render_mode : 'edit'
		})

	// clean previous and append rendered node
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}
		node.classList.add('disabled_component')
		component_container.appendChild(node)

	// label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'time_label',
			inner_html		: label,
			parent			: component_container
		})


	return true
};//end add_component


