/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_LANG_MULTI
* Manages the component's logic and apperance in client side
*/
export const render_tool_lang_multi = function() {

	return true
};//end render_tool_lang_multi



/**
* EDIT
* @return DOM node
*/
render_tool_lang_multi.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

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
		if (!window.opener) {
			const header	= wrapper.tool_header // is created by ui.tool.build_wrapper_edit
			const modal		= ui.attach_to_modal(header, wrapper, null)
			modal.on_close	= () => {
				self.destroy(true, true, true)
			}
		}


	return wrapper
};//end render_tool_lang_multi



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


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
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: components_container
		})

		// automatic_translation
			const translator_engine = (self.config)
				? self.config.translator_engine.value
				: false
			if (translator_engine) {
				const automatic_tranlation_node = build_automatic_tranlation(self, translator_engine, source_select_lang, target_select_lang, components_container)
				buttons_container.appendChild(automatic_tranlation_node)
			}//end if (translator_engine)


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



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
		self.main_component.render()
		.then(function(node){
			target_component_container.appendChild(node)
		})
	}else{
		self.load_component(lang.value)
		.then(function(component){
			component.render()
				.then(function(node){
				target_component_container.appendChild(node)
			})
		})
	}

	return target_component_container
};//end create_target_component


