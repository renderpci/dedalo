/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../common/js/event_manager.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_tool_time_machine
* Manages the component's logic and apperance in client side
*/
export const render_tool_time_machine = function() {

	return true
}//end render_tool_time_machine



/**
* RENDER_tool_time_machine
* Render node for use like button
* @return DOM node
*/
render_tool_time_machine.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
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
		const header 	= wrapper.querySelector('.tool_header')
		const modal  	= ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			self.destroy(true, true, true)
		}
		// fix
		self.modal_container = modal

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


	return wrapper
}//end render_tool_time_machine



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	const tm_date = new Date();

	// current_component_container
		const current_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'current_component_container disabled_component',
			parent 			: fragment
		})
		await add_component(self, current_component_container, self.caller.lang, get_label['ahora'], 'edit', null)

	// preview_component_container
		const preview_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'preview_component_container disabled_component',
			parent 			: fragment
		})
		// set
		self.preview_component_container = preview_component_container


	// tool_bar
		const tool_bar = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'tool_bar',
			parent 			: fragment
		})
		// lang selector
			if (self.caller.lang!=='lg-nolan') {
				const selector_label = ui.create_dom_element({
					element_type	: 'label',
					text_content 	: get_label['idioma'],
					parent 			: tool_bar
				})
				const lang_selector = ui.build_select_lang({
					langs  		: self.langs,
					selected 	: self.lang,
					class_name	: '',
					action 		: on_change_select
				})
				function on_change_select(e) {
					const lang = e.target.value
					if (lang!==self.lang) {
						self.lang = lang
						self.caller.lang = lang
						self.refresh()
					}
				}

				// lang_selector.addEventListener('change', async (e) => {
				// 	e.stopPropagation()

				// 	const lang = e.target.value
				// 	if (lang!==self.lang) {
				// 		self.lang = lang
				// 		self.caller.lang = lang
				// 		self.refresh()
				// 	}
				// })
				tool_bar.appendChild(lang_selector)
			}
		// button apply
			self.button_apply = ui.create_dom_element({
				element_type	: 'button',
				class_name 		: 'warning button_apply hide',
				text_content    : get_label['aplicar_y_salvar'] || 'Apply and save',
				parent 			: tool_bar
			})
			self.button_apply.addEventListener("click", self.apply_value.bind(self))

	// section container
		// const section_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'section_container',
		// 	parent 			: fragment
		// })

	// section list
		const section 		= await self.load_section()
		const section_node 	= await section.render()
		fragment.appendChild(section_node)


	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'buttons_container',
		// 	parent 			: components_container
		// })


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end content_data_edit


// DES
	// /**
	// * GET_LANG_SELECTOR
	// */
	// const get_lang_selector = function(langs, selected_lang, class_name='') {

	// 	// components container
	// 		const select = ui.create_dom_element({
	// 			element_type	: 'select',
	// 			class_name 		: class_name
	// 		})

	// 		const option = ui.create_dom_element({
	// 				element_type	: 'option',
	// 				value 			: null,
	// 				text_content 	: '',
	// 				parent 			: select
	// 			})

	// 		const length = langs.length
	// 		for (let i = 0; i < length; i++) {

	// 			const lang = langs[i]
	// 			const option = ui.create_dom_element({
	// 				element_type	: 'option',
	// 				value 			: lang.value,
	// 				text_content 	: lang.label,
	// 				parent 			: select
	// 			})

	// 			// selected options set on match
	// 			if (lang.value === selected_lang) {
	// 				option.selected = true
	// 			}
	// 		}

	// 	return select
	// }//end get_lang_selector



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

	const component = await self.load_component(lang_value, mode, matrix_id)

	// render node
	const node = await component.render({
		render_mode : 'edit'
	})

	while (component_container.firstChild) {
		component_container.removeChild(component_container.firstChild)
	}
	component_container.appendChild(node)

	// label
		ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'time_label',
			text_content 	: label,
			parent 			: component_container
		})


	return true
}//end add_component


