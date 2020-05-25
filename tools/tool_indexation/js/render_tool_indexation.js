/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_tool_indexation
* Manages the component's logic and apperance in client side
*/
export const render_tool_indexation = function() {

	return true
}//end render_tool_indexation



/**
* RENDER_tool_indexation
* Render node for use like button
* @return DOM node
*/
render_tool_indexation.prototype.edit = async function (options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = await ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			// tool destroy
				self.destroy(true, true, true)			
			// refresh source component text area
				self.caller.refresh()
		}

	// events



	return wrapper
}//end render_tool_indexation



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {


	const fragment = new DocumentFragment()


	// area thesaurus
		const thesaurus_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'thesaurus_container',
			parent 			: fragment
		})
		const thesaurus = self.get_thesaurus()
		thesaurus.then(function(thesaurus_instance){
			thesaurus_instance.render().then(function(node){
				thesaurus_container.appendChild(node)
			})
		})


	// component_text_area
		const component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'component_container',
			parent 			: fragment
		})
		// lang selector
			const lang_selector = ui.build_select_lang({
				id 			: "index_lang_selector",
				selected 	: self.lang,
				class_name 	: 'dd_input',
				action 	 	: async function(e){
					// create new one
					const component = await self.get_component(e.target.value)

					component.render().then(function(node){
						// remove previous nodeS
						while (component_container.lastChild && component_container.lastChild.id!==lang_selector.id) {
							component_container.removeChild(component_container.lastChild)
						}
						// add the new one
						component_container.appendChild(node)
					})
				}
			})
			console.log("lang_selector", lang_selector);
			component_container.appendChild(lang_selector)
		
		// component. render another node of component caller and append to container
			const component = await self.get_component(self.lang)
			component.render().then(function(node){
				component_container.appendChild(node)
			})		
		

	// info container
		const info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'info_container',
			parent 			: fragment
		})


	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'content_data ' + self.type
		})
		content_data.appendChild(fragment)


	return content_data



	// // components container
	// 	const components_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'components_container',
	// 		parent 			: fragment
	// 	})


	// // source lang select
	// 	const source_select_lang = ui.build_select_lang({
	// 		langs  		: self.langs,
	// 		selected 	: self.source_lang,
	// 		class_name	: 'source_lang',
	// 		action 		: on_change_source_select_lang
	// 	})
	// 	function on_change_source_select_lang(e) {
	// 		add_component(self, source_component_container, e.target.value)
	// 	}
	// 	components_container.appendChild(source_select_lang)


	// // target lang select
	// 	const target_select_lang = ui.build_select_lang({
	// 		langs  		: self.langs,
	// 		selected 	: self.target_lang,
	// 		class_name	: 'target_lang',
	// 		action 		: on_change_target_select_lang
	// 	})
	// 	function on_change_target_select_lang(e) {
	// 		add_component(self, target_component_container, e.target.value)
	// 	}
	// 	components_container.appendChild(target_select_lang)


	// // source
	// 	const source_component_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'source_component_container disabled_component',
	// 		parent 			: components_container
	// 	})

	// 	// source default value check
	// 		if (source_select_lang.value) {
	// 			add_component(self, source_component_container, source_select_lang.value)
	// 		}

	// // target
	// 	const target_component_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'target_component_container',
	// 		parent 			: components_container
	// 	})

	// 	// target default value check
	// 		if (target_select_lang.value) {
	// 			add_component(self, target_component_container, target_select_lang.value)
	// 		}

	// // buttons container
	// 	const buttons_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name 		: 'buttons_container',
	// 		parent 			: components_container
	// 	})

	// 	// automatic_translation
	// 		const translator_engine = self.simple_tool_object.config.translator_engine
	// 		if (translator_engine) {
	// 			const automatic_tranlation_node = build_automatic_translation(self, translator_engine, source_select_lang, target_select_lang, components_container)
	// 			buttons_container.appendChild(automatic_tranlation_node)
	// 		}//end if (translator_engine)


}//end get_content_data_edit



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
	const node 		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
}//end add_component
