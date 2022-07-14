/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import Split from '../../../lib/split/dist/split.es.js'



/**
* RENDER_TOOL_INDEXATION
* Manages the component's logic and apperance in client side
*/
export const render_tool_indexation = function() {

	return true
}//end render_tool_indexation



/**
* EDIT
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
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
		const related_list_node = render_related_list(self)
		wrapper.tool_buttons_container.appendChild(related_list_node)

	// get_tag_info. Fires build tag info panel nodes at begin
		get_tag_info(self)


	return wrapper
}//end render_tool_indexation



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container. area thesaurus (left)
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			id				: 'left_container',
			class_name		: 'left_container',
			parent			: fragment
		})
		// const thesaurus = self.get_thesaurus()
		// thesaurus.then(function(thesaurus_instance){
		// 	thesaurus_instance.render().then(function(node){
		// 		left_container.appendChild(node)
		// 	})
		// })
		self.area_thesaurus.render()
		.then(function(node){
			left_container.appendChild(node)
		})

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			id				: 'right_container',
			class_name		: 'right_container',
			parent			: fragment
		})

		// transcription_component
			const transcription_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'transcription_component_container',
				parent			: right_container
			})
			// lang selector
				const lang_selector = ui.build_select_lang({
					id			: "indexing_lang_selector",
					selected	: self.lang,
					class_name	: 'dd_input'
				})
				lang_selector.addEventListener('change', async function(e){

					// unsaved data confirm on true
						if (self.transcription_component.is_data_changed===true) {
							if (!confirm(get_label.discard_changes || 'Discard changes?')) {
								// restore previous value lang and stop
								this.value = self.transcription_component.lang
								return
							}
						}

					// create new one
						const component = await self.get_component(e.target.value)
						// set auto_init_editor for convenience
						component.auto_init_editor = true
						component.render()
						.then(function(node){
							// remove previous node
							while (transcription_component_container.lastChild && transcription_component_container.lastChild.id!==lang_selector.id) {
								transcription_component_container.removeChild(transcription_component_container.lastChild)
							}
							// add the new component to the container
							transcription_component_container.appendChild(node)
							// console.log("self.transcription_component.is_data_changed:",self.transcription_component.is_data_changed);
						})
				})

				transcription_component_container.appendChild(lang_selector)

			// component. render another node of component caller and append to container
				const transcription_component = self.transcription_component || await self.get_component(self.lang)
				// set auto_init_editor = true to force init edidor instead use user click to activate it
				transcription_component.auto_init_editor = true
				transcription_component.render()
				.then(function(node){

					transcription_component_container.appendChild(node)
				})
				// self.caller.render()
				// .then(function(node){
				// 	transcription_component_container.appendChild(node)
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
			const component_indexing_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'component_indexing_container',
				parent			: right_container
			})
			self.indexing_component.render()
			.then(function(indexing_component_node){
				component_indexing_container.appendChild(indexing_component_node)
			})

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

	// split
	// @see https://github.com/nathancahill/split/tree/master/packages/splitjs
		event_manager.when_in_viewport(
			left_container, // node to observe
			() => { // callback
				Split(['#left_container', '#right_container'], {
					sizes: [45, 55],
					minSize: '40%'
				});
				console.log("activated Split:", Split);
			}
		)


	return content_data
}//end get_content_data_edit



/**
* GET_TAG_INFO
* When user click on index tag, event if fired and recovered by this tool.
* This event (click_tag_index) fires current function that build tag info panel nodes
* @param object self
* 	Instance of the tool
*/
const get_tag_info = function(self) {

	// tag_id. Set on every user tag item click
		let tag_id	= ''

	// info container
		const info_container = self.info_container
		// clean previous nodes
		while (info_container.lastChild) {
			info_container.removeChild(info_container.lastChild)
		}

	// tag_info_container. line info about tag
		const tag_info_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'tag_info_container hide',
			parent			: info_container
		})
		// fix node
		self.tag_info_container = tag_info_container

	// tag id info
		const fragment_id_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fragment_id_info',
			parent			: tag_info_container
		})
		// fragment_id_label
		ui.create_dom_element({
			element_type	: 'span',
			inner_html		: 'TAG ' + tag_id,
			parent			: fragment_id_info
		})
		const fragment_id_tag_id = ui.create_dom_element({
			element_type	: 'span',
			inner_html		: tag_id,
			parent			: fragment_id_info
		})

	// state
		// wrap_tag_state_selector selector
			const wrap_tag_state_selector = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'wrap_tag_state_selector',
				inner_html		: get_label.state || 'State',
				parent			: tag_info_container
			})
		// state selector
			const tag_state_selector = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'tag_state_selector',
				inner_html		: get_label.state || 'State',
				parent			: tag_info_container
			})

			for (let k = 0; k < self.label_states.length; k++) {
				ui.create_dom_element({
					element_type	: 'option',
					inner_html		: self.label_states[k].label,
					value			: self.label_states[k].value,
					parent			: tag_state_selector
				})
			}
			tag_state_selector.addEventListener('change', function(){

				const state	= this.value

				self.transcription_component.update_tag({
					type			: 'indexIn', // will be split into ['indexIn','indexOut']
					tag_id			: tag_id,
					new_data_obj	: {
						state : state
					}
				})
				.then(function(){
					// update tag_info_container color matching tag state
					self.label_states.map((el)=>{
						if (el.value===state) {
							tag_info_container.classList.add(el.value)
						}else{
							if (tag_info_container.classList.contains(el.value)) {
								tag_info_container.classList.remove(el.value)
							}
						}
					})
					// self.transcription_component
					window.unsaved_data = true
				})
			})


	// delete_tag
		// wrap_delete_tag
		const wrap_delete_tag = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrap_delete_tag',
			parent			: tag_info_container
		})
		// button delete tag
			const button_delete = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove',
				parent			: wrap_delete_tag
			})
			button_delete.addEventListener('click', function(){

				// delete_tag
				self.delete_tag(tag_id)
				.then(function(response){

					// show/hide tag_info
					if (response && response.delete_tag.result!==false && response.delete_locator.result!==false) {
						const toggle_node = self.tag_info_container // self.info_container
						if (!toggle_node.classList.contains('hide')) {
							toggle_node.classList.add('hide')
						}
					}
				})
			})
		// label delete
			const button_delete_label = ui.create_dom_element({
				element_type	: 'label',
				inner_html		: get_label.borrar,
				parent			: wrap_delete_tag
			})


	// active values
		self.active_value('tag_id', function(value){

			tag_id							= value // update current tag_id var (let)
			fragment_id_tag_id.textContent	= value // update fragment label
			button_delete_label.textContent	= get_label.borrar //  + ' ' + value // update delete label

			// show/hide info_container
				const toggle_node = self.tag_info_container // self.info_container
				if (toggle_node.classList.contains('hide')) {
					toggle_node.classList.remove('hide')
				}
		})
		self.active_value('state', function(value){

			// fix selector value
				tag_state_selector.value = value

			// update tag_info_container color matching tag state
				self.label_states.map((el)=>{
					if (el.value==value) {
						self.tag_info_container.classList.add(el.value)
					}else{
						if (self.tag_info_container.classList.contains(el.value)) {
							self.tag_info_container.classList.remove(el.value)
						}
					}
				})
		})


	return true;
}//end get_tag_info



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
}//end add_component



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

	// select -> options
		// sections
			const sections = data.find(el => el.typo==='sections')
			if (!sections) {
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error msg',
					inner_html		: 'Empty top sections to index!',
					parent			: related_list_container
				})
				console.error('Empty top sections to index!')
				return fragment
			}

		const select = ui.create_dom_element({
			element_type	: 'select',
			parent			: related_list_container
		})

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
		select.addEventListener('change', async function(e){
			self.top_locator = this.options[this.selectedIndex].locator
		})


	return fragment
}//end render_related_list
