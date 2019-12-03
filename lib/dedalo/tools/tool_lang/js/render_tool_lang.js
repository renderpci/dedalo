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
render_tool_lang.prototype.edit = async function (options={render_level:'full'}) {

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


	// // buttons container
	// 	const buttons_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'buttons_container',
	// 		parent 			: wrapper
	// 	})

	// 	// automatic_translation
	// 		const automatic_translation_container = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'automatic_translation_container',
	// 			parent 			: buttons_container
	// 		})
	// 		// button
	// 		const button_automatic_translation = document.createElement('button');
	// 			  button_automatic_translation.type = 'button'
	// 			  button_automatic_translation.textContent = get_label['traduccion_automatica'] || "Automatic translation"
	// 			  automatic_translation_container.appendChild(button_automatic_translation)
	// 			  button_automatic_translation.addEventListener("click", (e) => {

	// 			  	const translator  = translator_engine_select.value
	// 			  	const source_lang = wrapper.querySelector('.source_lang').value	// source_select_lang.value
	// 			  	const target_lang = wrapper.querySelector('.target_lang').value // target_select_lang.value
	// 			  	self.automatic_translation(translator, source_lang, target_lang, automatic_translation_container)
	// 			  })

	// 		// select
	// 		const translator_engine_select = ui.create_dom_element({
	// 			element_type	: 'select',
	// 			parent 			: automatic_translation_container
	// 		})
	// 		const translator_engine = self.config.properties.translator_engine
	// 		for (let i = 0; i < translator_engine.length; i++) {
	// 			const translator = translator_engine[i]
	// 			ui.create_dom_element({
	// 				element_type	: 'option',
	// 				value 			: JSON.stringify(translator),
	// 				text_content 	: translator.label,
	// 				parent 			: translator_engine_select
	// 			})
	// 		}



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
		ui.tool.attach_to_modal(wrapper, self)

	// events
		// click
			// wrapper.addEventListener("click", function(e){
			// 	e.stopPropagation()
			// 	console.log("e:",e);
			// 	return
			// })


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


	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: content_data
		})


	// source lang select
		const source_select_lang = lang_selector(self.langs, self.source_lang, 'source_lang')
		components_container.appendChild(source_select_lang)
	// target lang select
		const target_select_lang = lang_selector(self.langs, self.target_lang, 'target_lang')
		components_container.appendChild(target_select_lang)


	// source
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component_container disabled_component',
			parent 			: components_container
		})

		// source on_change
			source_select_lang.addEventListener('change', async (e) => {
				e.stopPropagation()
				add_component(self, source_component_container, e.target.value)
			})

		// source default value check
			if (source_select_lang.value) {
				add_component(self, source_component_container, source_select_lang.value)
			}

	// target
		const target_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'target_component_container',
			parent 			: components_container
		})

		// target on_change
			target_select_lang.addEventListener('change', async (e) => {
				e.stopPropagation()
				add_component(self, target_component_container, e.target.value)
			})

		// target default value check
			if (target_select_lang.value) {
				add_component(self, target_component_container, target_select_lang.value)
			}


	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: components_container
		})

		// automatic_translation
			const automatic_translation_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'automatic_translation_container',
				parent 			: buttons_container
			})
			// button
			const button_automatic_translation = document.createElement('button');
				  button_automatic_translation.type = 'button'
				  button_automatic_translation.textContent = get_label['traduccion_automatica'] || "Automatic translation"
				  automatic_translation_container.appendChild(button_automatic_translation)
				  button_automatic_translation.addEventListener("click", (e) => {

				  	content_data.classList.add("loading")

				  	const translator  = translator_engine_select.value
				  	const source_lang = source_select_lang.value
				  	const target_lang = target_select_lang.value
				  	self.automatic_translation(translator, source_lang, target_lang, automatic_translation_container)
				  	.then(()=>{
				  		content_data.classList.remove("loading")
				  	})
				  })

			// select
			const translator_engine_select = ui.create_dom_element({
				element_type	: 'select',
				parent 			: automatic_translation_container
			})
			const translator_engine = self.config.properties.translator_engine
			for (let i = 0; i < translator_engine.length; i++) {
				const translator = translator_engine[i]
				ui.create_dom_element({
					element_type	: 'option',
					value 			: JSON.stringify(translator),
					text_content 	: translator.label,
					parent 			: translator_engine_select
				})
			}

	return content_data
}//end content_data_edit



/**
* ADD_COMPONENT
*/
export const add_component = async (self, component_container, value) => {

	// user select blank value case
		if (!value) {
			while (component_container.firstChild) {
				// remove node from dom (not component instance)
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	const component = await self.load_component(value)
	const node = await component.render()

	while (component_container.firstChild) {
		component_container.removeChild(component_container.firstChild)
	}
	component_container.appendChild(node)

	return true
}//end add_component



/**
* LANG_SELECTOR
*/
const lang_selector = function(langs, selected_lang, class_name='') {

	// components container
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name 		: class_name
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


