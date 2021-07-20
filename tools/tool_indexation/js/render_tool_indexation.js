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
};//end render_tool_indexation



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
		modal.on_close = async () => {
			// tool destroy
				await self.destroy(true, true, true)
			// refresh source component text area
				self.caller.refresh()
		}

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation		
		const related_list_node = render_related_list(self)
		header.appendChild(related_list_node)



	get_tag_info(self)

	return wrapper
};//end render_tool_indexation



/**
* get_TAG_INFO
* When user click on index tag, event if fired and recovered by this tool.
* This event (click_tag_index) fires current function that build tag info panel nodes
*/
const get_tag_info = function(self) {

	// const self = this

	// tag dom node
	// const tag		= options.tag || null
	// const tag_id	= tag.dataset.tag_id || null
	const tag_id	= ''


	const info_container = self.info_container
	// clean previous nodes
	while (info_container.lastChild) {
		info_container.removeChild(info_container.lastChild)
	}

	// common_line. line info about tag
		const common_line = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'common_line',
			parent			: info_container
		})

	// tag id info
		const fragment_id_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fragment_id_info',
			parent			: common_line
		})
		const fragment_id_label = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: "TAG " + tag_id,
			parent			: fragment_id_info
		})
		const fragment_id_tag_id = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: tag_id,
			parent			: fragment_id_info
		})
	// wrap_tag_state_selector selector
		const wrap_tag_state_selector = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrap_tag_state_selector',
			inner_html		: get_label.state || "State",
			parent			: common_line
		})
	// state selector
		const tag_state_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'tag_state_selector',
			inner_html		: get_label.state || "State",
			parent			: common_line
		})
		const states =  [
			{ label	: get_label.etiqueta_normal,	value : "n"},
			{ label	: get_label.etiqueta_borrada,	value : "d"},
			{ label	: get_label.etiqueta_revisar,	value : "r"}
		]
		for (let i = 0; i < states.length; i++) {
			ui.create_dom_element({
				element_type	: 'option',
				text_content	: states[i].label,
				value			: states[i].value,
				parent			: tag_state_selector
			})
		}

	// div_delete_tag
		const div_delete_tag = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'div_delete_tag',
			dataset			: {tag_id : tag_id},
			parent			: common_line
		})
		// button delete
			const button_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove',
				parent			: div_delete_tag
			})
			const button_delete_label = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.borrar,
				parent			: div_delete_tag
			})
			div_delete_tag.addEventListener("click", function(e){
				alert("Deleting " + this.dataset.tag_id);
			})

	// active values
		self.active_value("tag_id", function(value){
			fragment_id_tag_id.textContent	= value
			div_delete_tag.dataset.tag_id	= value
			button_delete_label.textContent	= get_label.borrar + " " + value
		})
		self.active_value("state", function(value){
			tag_state_selector.value		= value
		})


	return true;
};//end get_tag_info



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	// area thesaurus (left)
		const thesaurus_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'thesaurus_container',
			parent			: fragment
		})
		const thesaurus = self.get_thesaurus()
		thesaurus.then(function(thesaurus_instance){
			thesaurus_instance.render().then(function(node){
				thesaurus_container.appendChild(node)
			})
		})

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
				const component = await self.get_component(self.lang)
				component.render()
				.then(function(node){
					component_container.appendChild(node)
				})
				// self.caller.render()
				// .then(function(node){
				// 	component_container.appendChild(node)
				// })

		// info container
			const info_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_container',
				parent			: right_container
			})
			// fix
			self.info_container = info_container

		// indexation component
			const indexing_component_node = await self.indexing_component.render()
			right_container.appendChild(indexing_component_node)


	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_data ' + self.type
		})
		content_data.appendChild(fragment)



	return content_data
};//end get_content_data_edit



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

	const component	= await self.load_component(value)
	const node		= await component.render()

	// clean container
		while (component_container.firstChild) {
			component_container.removeChild(component_container.firstChild)
		}

	// append node
		component_container.appendChild(node)


	return true
};//end add_component



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


