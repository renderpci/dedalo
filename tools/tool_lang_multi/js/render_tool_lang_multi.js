/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_LANG_MULTI
* Manages the component's logic and apperance in client side
*/
export const render_tool_lang_multi = function() {

	return true
}//end render_tool_lang_multi



/**
* EDIT
* @return DOM node
*/
render_tool_lang_multi.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	// options
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

	// modal container
		// if (!window.opener) {
		// 	const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
		// 	const modal		= ui.attach_to_modal(header, wrapper, null)
		// 	modal.on_close	= () => {
		// 		self.destroy(true, true, true)
		// 	}
		// }


	return wrapper
}//end render_tool_lang_multi



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// top_container
		const top_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'top_container',
			parent			: fragment
		})

	// automatic_translation
		// icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button icon lang black',
			parent			: top_container
		})
		// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'automatic_label',
			inner_html		: get_label.traduccion_automatica || 'Automatic translation',
			parent			: top_container
		})
		const translator_engine = (self.context.config)
			? self.context.config.translator_engine.value
			: false
		if (translator_engine) {
			const automatic_tranlation_node = build_automatic_translation({
				self				: self,
				translator_engine	: translator_engine
			})
			top_container.appendChild(automatic_tranlation_node)
		}//end if (translator_engine)


	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'components_container',
			parent			: fragment
		})

	// components list (source and targets)
		const langs_length = self.langs.length
		for (let i = 0; i < langs_length; i++) {
			const current_lang = self.langs[i] // object as {label:Spanish,value:lg-spa}
			const target_component_container = create_target_component(current_lang, self)
			components_container.appendChild(target_component_container)
		}

	// buttons container
		// const buttons_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'buttons_container',
		// 	parent			: components_container
		// })


	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* CREATE_TARGET_COMPONENT
* @param object lang
* @param object instance
*/
export const create_target_component = (lang, self) => {

	const target_component_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'target_component_container'
	})

	const target_component_title = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'target_component_title',
		inner_html		: lang.label,
		parent			: target_component_container
	})

	if (lang.value===self.source_lang){
		target_component_container.classList.add('source')
		self.main_element.render()
		.then(function(node){
			target_component_container.appendChild(node)
			node.classList.add('disabled_component')
		})
		target_component_title.classList.add('bold')
	}else{
		self.load_component(lang.value)
		.then(function(component){
			component.render()
				.then(function(node){
				target_component_container.appendChild(node)

				// append translation button
					const translator_engine = (self.context.config)
						? self.context.config.translator_engine.value
						: false
					if (translator_engine) {
						const buttons_fold = node.querySelector('.buttons_fold')
						if (buttons_fold) {
							const button_translate = ui.create_dom_element({
								element_type	: 'span',
								class_name		: 'button lang',
								title			: get_label.traduccion_automatica || 'Automatic translation',
								parent			: buttons_fold
							})
							button_translate.addEventListener("click", function(e){
								e.stopPropagation()

								// non empty value cases generates a confirm dialog
									const current_value	= component.data.value
									const is_empty		= (!current_value || current_value.length<1 || current_value[0]==='')
									if (is_empty===false) {
										if(!confirm(get_label.esta_seguro_de_sobreescribir_el_texto || 'Are you sure to overwrite the current value?')) {
											return
										}
									}

								target_component_container.classList.add('loading')

								const translator	= self.translator_engine_select.value
								const source_lang	= self.source_lang
								const target_lang	= component.lang

								self.automatic_translation(translator, source_lang, target_lang, target_component_container)
								.then(()=>{
									target_component_container.classList.remove('loading')
								})
							})
						}
					}
			})
		})
	}

	return target_component_container
}//end create_target_component



/**
* BUILD_AUTOMATIC_TRANSLATION
*/
const build_automatic_translation = (options) => {

	// options
		const self				= options.self
		const translator_engine	= options.translator_engine

	// container
		const automatic_translation_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_translation_container'
		})

	// button
		// const button_automatic_translation = ui.create_dom_element({
		// 	element_type	: 'button',
		// 	class_name		: 'warning button_automatic_translation',
		// 	inner_html		: self.get_tool_label.automatic_translation || "Automatic translation",
		// 	parent			: automatic_translation_container
		// })

		// // const button_automatic_translation = document.createElement('button');
		// // 	  button_automatic_translation.type = 'button'
		// // 	  button_automatic_translation.textContent = get_label['traduccion_automatica'] || "Automatic translation"
		// // 	  automatic_translation_container.appendChild(button_automatic_translation)
		// button_automatic_translation.addEventListener("click", () => {

		// 	components_container.classList.add('loading')

		// 	const translator	= translator_engine_select.value
		// 	const source_lang	= source_select_lang.value
		// 	const target_lang	= target_select_lang.value

		// 	self.automatic_translation(translator, source_lang, target_lang, automatic_translation_container)
		// 	.then(()=>{
		// 		components_container.classList.remove('loading')
		// 	})
		// })

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
			data_manager.prototype.set_local_db_data({
				id		: 'translator_engine_select',
				value	: self.translator_engine_select.value
			}, 'status')
		})


	return automatic_translation_container
}//end build_automatic_translation
