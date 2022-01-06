/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_transcription
* Manages the component's logic and apperance in client side
*/
export const render_tool_transcription = function() {
	
	return true
};//end render_tool_transcription



/**
* RENDER_TOOL_transcription
* Render node for use like button
* @return DOM node
*/
render_tool_transcription.prototype.edit = async function(options={render_level:'full'}) {

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


	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			self.destroy(true, true, true)
			// refresh source component text area
				if (self.transcription_component) {
					self.transcription_component.refresh()
				}
		}

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
		const related_list_node = render_related_list(self)
		header.appendChild(related_list_node)

	console.log("related_list_node:",related_list_node);

	return wrapper
};//end render_tool_transcription



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	// components container
		const components_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'components_container',
			parent 			: fragment
		})

	// source component
		const source_component_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'source_component_container',
			parent 			: components_container
		})

		const media_component_node = await self.media_component.render();

		source_component_container.appendChild(media_component_node)


	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_container',
			parent			: fragment
		})

	// component_text_area
			const component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'component_container',
				parent			: right_container
			})
			// lang selector
				const lang_selector = ui.build_select_lang({
					id			: "index_lang_selector",
					selected	: self.lang,
					class_name	: 'dd_input',
					action		: async function(e){
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
				component_container.appendChild(lang_selector)

			// component. render another node of component caller and append to container
				const component = self.transcription_component || await self.get_component(self.lang)
				component.render()
				.then(function(node){
					component_container.appendChild(node)
				})



	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit




/**
* RENDER_RELATED_LIST
* This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
*/
const render_related_list = function(self){

	const datum		= self.related_sections_list
	const context	= datum.context
	const data		= datum.data

	const fragment = new DocumentFragment();

	// related list
		const related_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'related_list_container',
			parent			: fragment
		})
		const select = ui.create_dom_element({
			element_type	: 'select',
			parent			: related_list_container
		})

	// select -> options
		const sections		= data.find(el => el.typo==='sections')
		const value			= sections.value
		const value_length	= value.length
		for (let i = 0; i < value_length; i++) {

			const current_locator = {
				section_top_tipo	: value[i].section_tipo,
				section_top_id		: value[i].section_id
			}
			// fix the first locator when tool is loaded (without user interaction)
				if(i===0){
					self.top_locator = current_locator
				}

			const section_label		= context.find(el => el.section_tipo===current_locator.section_top_tipo).label
			const ar_component_data	= data.filter(el => el.section_tipo===current_locator.section_top_tipo && el.section_id===current_locator.section_top_id)

			// ar_component_value
				const ar_component_value = []
				for (let j = 0; j < ar_component_data.length; j++) {
					const current_value = ar_component_data[j].value // toString(ar_component_data[j].value)
					ar_component_value.push(current_value)
				}

			// label
				const label = 	section_label + ' | ' +
								current_locator.section_top_id +' | ' +
								ar_component_value.join(' | ')

			// option DOM element
				const option = ui.create_dom_element({
					element_type	: 'option',
					inner_html		: label,
					parent			: select
				})
				option.locator = current_locator

		}//end for

	// event . Change
		select.addEventListener("change", async function(e){
			self.top_locator = this.options[this.selectedIndex].locator
		})

	return fragment
};//end render_related_list



