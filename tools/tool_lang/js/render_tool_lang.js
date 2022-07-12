/*global page_globals, SHOW_DEBUG, DEDALO_CORE_URL, get_label */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {clone} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_LANG
* Manages the component's logic and appearance in client side
*/
export const render_tool_lang = function() {

	return true
}//end render_tool_lang



/**
* EDIT
* Render node for use in edit mode
* @param object options
* @return DOM node
*/
render_tool_lang.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. UI build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end render_tool_lang



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// main_element unavailable case
		if (!self.main_element) {
			const content_data = ui.tool.build_content_data(self)
			content_data.innerHTML = 'Error loosed caller. main_element is not available. Please, try to reopen this tool again.'

			return content_data
		}

	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// left_block
		const left_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_block',
			parent			: components_container
		})

		// top_left
			const top_left = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top left',
				parent			: left_block
			})

			// source lang select
				const source_select_lang = ui.build_select_lang({
					langs		: self.langs,
					selected	: self.source_lang,
					class_name	: 'source_lang'
				})
				source_select_lang.addEventListener("change", function(e){
					const lang = e.target.value
					add_component(self, source_component_container, lang)
				})
				top_left.appendChild(source_select_lang)

			// source_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label source_lang_label',
					inner_html		: self.get_tool_label.source_lang || 'Source lang',
					parent			: top_left
				})

		// source component
			const source_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'source_component_container',
				parent			: left_block
			})
			self.main_element.render()
			.then(function(node){
				node.classList.add('disabled_component')
				source_component_container.appendChild(node)
			})

	// right_block
		const right_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_block',
			parent			: components_container
		})

		// top_right
			const top_right = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'top right',
				parent			: right_block
			})

			// target lang select
				const target_select_lang = ui.build_select_lang({
					langs  		: self.langs,
					selected 	: self.target_lang,
					class_name	: 'target_lang'
				})
				target_select_lang.addEventListener("change", async function(e){
					const lang = e.target.value
					// self.target_component = await add_component(self, target_component_container, lang)
					add_component(self, target_component_container, lang)
					.then(function(response){
						self.target_component = response
					})

					const data = {
						id		: 'tool_lang_target_lang',
						value	: lang
					}
					data_manager.set_local_db_data(
						data,
						'status'
					)
				})
				top_right.appendChild(target_select_lang)

			// target_lang_label
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'lang_label target_lang_label',
					inner_html		: self.get_tool_label.target_lang || 'Target lang',
					parent			: top_right
				})

		// target component
			const target_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'target_component_container',
				parent			: right_block
			})
			if (target_select_lang.value) {
				add_component(self, target_component_container, target_select_lang.value)
				.then(function(response){
					self.target_component = response
				})
			}

	// buttons container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

		// automatic_translation
			const translator_engine = (self.context.config)
				? self.context.config.translator_engine.value
				: false
				console.log("translator_engine:",translator_engine, self);
			if (translator_engine) {
				const automatic_tranlation_node = build_automatic_translation(self, translator_engine, source_select_lang, target_select_lang, components_container)
				buttons_container.appendChild(automatic_tranlation_node)
			}//end if (translator_engine)

		// copy_to_target button
			const copy_to_target = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'secondary copy_to_target',
				inner_html		: self.get_tool_label('copy_to_target') || 'Copy to target',
				parent			: buttons_container
			})
			copy_to_target.addEventListener('click', async function(e){
				e.stopPropagation()

				// user confirmation to overwrite content
					if (self.target_component.data.value && self.target_component.data.value.length>0) {
						if (!confirm( get_label.sure || 'Sure?' )) {
							return false
						}
					}

				// source value
					const source_component	= self.main_element
					const source_value		= source_component.data.value

				// debug
					if(SHOW_DEBUG===true) {
						console.log("--> copy_to_target source_value:", clone(source_value));
						console.log("--> copy_to_target target_value:", clone(self.target_component.data.value));
					}

				// copy value
					self.target_component.data.value = source_value

				// save value. (Expected only one value in the array)
					for (let i = 0; i < source_value.length; i++) {
						self.target_component.save({
							action	: 'update',
							key		: i,
							value	: source_value[i]
						})
					}

				// refresh the target component
					self.target_component.refresh({
						build_autoload : false
					})
			})

		// propagate_marks
		// (!) WORKING HERE. Note that this functionality it's not finished in v5
			// const propagate_marks_block = render_propagate_marks_block(self)
			// buttons_container.appendChild(propagate_marks_block)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* RENDER_PROPAGATE_MARKS_BLOCK
* (!) WORKING HERE. Note that this functionality it's not finished in v5
* @return DOM node propagate_marks_container
*/
const render_propagate_marks_block = function(self) {

	const propagate_marks_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'propagate_marks_container'
	})

	// new
		// new_only_label
		const new_only_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label.new_only || 'New only',
			parent			: propagate_marks_container
		})
		// input radio button
		const new_only_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'new_only'
		})
		new_only_input.checked = true // default value is New only
		new_only_label.prepend(new_only_input)

	// recreate all
		// all_label
		const all_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: self.get_tool_label.all || 'Recreate all',
			parent			: propagate_marks_container
		})
		// input radio button
		const all_input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: 'propagate_marks',
			value			: 'all'
		})
		all_label.prepend(all_input)

	// propagate_marks button
		const propagate_marks = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light propagate_marks',
			inner_html		: self.get_tool_label('propagate_marks') || 'Propagate marks',
			parent			: propagate_marks_container
		})
		propagate_marks.addEventListener('click', async function(e){
			e.stopPropagation()

			// user confirmation to overwrite content
				if (self.target_component.data.value && self.target_component.data.value.length>0) {
					if (!confirm( get_label.sure || 'Sure?' )) {
						return false
					}
				}

			// source value
				const source_component	= self.main_element
				const source_value		= source_component.data.value

			// (!) WORKING HERE. Note that this functionality it's not finished in v5
		})

	return propagate_marks_container
}//end render_propagate_marks_block



/**
* BUILD_AUTOMATIC_TRANSLATION
*/
const build_automatic_translation = (self, translator_engine, source_select_lang, target_select_lang, components_container) => {

	// container
		const automatic_translation_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_translation_container'
			//parent		: buttons_container
		})

	// button
		const button_automatic_translation = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning button_automatic_translation',
			inner_html		: self.get_tool_label.automatic_translation || "Automatic translation",
			parent			: automatic_translation_container
		})

		// const button_automatic_translation = document.createElement('button');
		// 	  button_automatic_translation.type = 'button'
		// 	  button_automatic_translation.textContent = get_label['traduccion_automatica'] || "Automatic translation"
		// 	  automatic_translation_container.appendChild(button_automatic_translation)
		button_automatic_translation.addEventListener('click', () => {

			components_container.classList.add('loading')

			const translator	= self.translator_engine_select.value
			const source_lang	= source_select_lang.value
			const target_lang	= target_select_lang.value

			self.automatic_translation(translator, source_lang, target_lang, automatic_translation_container)
			.then(()=>{
				components_container.classList.remove('loading')
			})
		})

	// select
		self.translator_engine_select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: automatic_translation_container
		})
		for (let i = 0; i < translator_engine.length; i++) {

			const engine = translator_engine[i]

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: engine.name,
				inner_html		: engine.label,
				parent			: self.translator_engine_select
			})
			if (self.target_translator===engine.name) {
				option.selected = true
			}
		}
		self.translator_engine_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: 'translator_engine_select',
				value	: self.translator_engine_select.value
			}, 'status')
		})


	return automatic_translation_container
}//end build_automatic_translation



/**
* ADD_COMPONENT
* Load and render a new component for translate
* @return DOM node|bool
* 	component wrapper node
*/
export const add_component = async (self, component_container, lang) => {

	// user select blank lang case
		if (!lang) {
			// remove node from DOM (not component instance)
			while (component_container.firstChild) {
				component_container.removeChild(component_container.firstChild)
			}
			return false
		}

	// render component
		const component	= await self.load_component(lang)
		const node		= await component.render()

	// source lang lock
		if (lang===self.source_lang || component_container.classList.contains('source_component_container')) {
			node.classList.add('disabled_component')
		}

	// clean container before append
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return component
}//end add_component
