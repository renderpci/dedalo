// imports
	import event_manager from '../../../page/js/page.js'
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOL_LANG
* Manages the component's logic and apperance in client side
*/
export const render_tool_lang = function() {

	return true
}//end render_tool_lang



/**
* RENDER_TOOL_LANG
* Render node for use like button
* @return DOM node
*/
render_tool_lang.prototype.edit = async function (options={
		render_level : 'full'
	}) {

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

	const tool_container = document.getElementById('tool_container')

	// tool_container
		if(tool_container!==null){
			tool_container.appendChild(wrapper)
		}else{
			const main = document.getElementById('main')
			const new_tool_container = ui.create_dom_element({
				id 				: 'tool_container',
				element_type	: 'div',
				parent 			: main
			})
			new_tool_container.appendChild(wrapper)
		}

	// events
		// click
		/*
			wrapper.addEventListener("dblclick", function(e){
				e.stopPropagation()

				//change mode
				self.change_mode()

			})
			*/



	return wrapper
}//end render_tool_lang



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")

	// create the source select_lang
		const source_select_lang = lang_selector(self.langs, self.source_lang)
		const target_select_lang = lang_selector(self.langs, self.target_lang)

		content_data.appendChild(source_select_lang)
		content_data.appendChild(target_select_lang)

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: content_data
		})

		const source_component = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component',
			parent 			: components_container
		})

	// on_change. only prevent click propagation to wrapper
		source_select_lang.addEventListener('change', async (e) => {
			e.stopPropagation()

			if (!e.target.value) {
				while (source_component.firstChild)	source_component.removeChild(source_component.firstChild)
				return false
			}

			const component = await self.load_component(e.target.value)
			const node = await component.render()

			while (source_component.firstChild) {
				source_component.removeChild(source_component.firstChild)
			}
			source_component.appendChild(node)
		})


		const target_component = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'target_component',
			parent 			: components_container
		})

	// on_change. only prevent click propagation to wrapper
		target_select_lang.addEventListener('change', async (e) => {
			e.stopPropagation()

			if (!e.target.value) {
				while (target_component.firstChild)	target_component.removeChild(target_component.firstChild)
				return false
			}

			const component = await self.load_component(e.target.value)
			const node = await component.render()

			while (target_component.firstChild) {
				target_component.removeChild(target_component.firstChild)
			}
			target_component.appendChild(node)
		})


	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})


	return content_data
}//end content_data_edit



/**
* LANG_SELECTOR
*/
const lang_selector = function(langs, selected_lang) {

	// components container
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: 'components_container',
		})

		const option = ui.create_dom_element({
				element_type	: 'option',
				value 			: null,
				text_content 	: '',
				parent 			: select
			})

		const length = langs.length
		for (let i = 0; i < length; i++) {

			const lang = langs[i]
			const option = ui.create_dom_element({
				element_type	: 'option',
				value 			: lang.value,
				text_content 	: lang.label,
				parent 			: select
			})

			// selected options set on match
			if (lang.value === selected_lang) {
				option.selected = true
			}
		}

	return select
}//end lang_selector






