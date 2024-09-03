// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_viewport} from '../../../core/common/js/events.js'
	import {ui} from '../../../core/common/js/ui.js'
	import Split from '../../../lib/split/dist/split.es.js'



/**
* RENDER_TOOL_INDEXATION
* Manages the component's logic and appearance in client side
*/
export const render_tool_indexation = function() {

	return true
}//end render_tool_indexation



/**
* EDIT
* Render node for use like button
* @return HTMLElement wrapper
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

		// fix pointers
		wrapper.content_data = content_data

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
		const related_list_node = render_related_list(self)
		wrapper.tool_buttons_container.appendChild(related_list_node)

	// viewer_selector. (thesaurus/audiovisual)
		const viewer_selector_node = render_viewer_selector(self, wrapper)
		wrapper.tool_buttons_container.appendChild(viewer_selector_node)

	// status, render the status components for users and admins to control the process of the tool
		const status_container = await render_status(self)
		wrapper.tool_buttons_container.appendChild(status_container)

	// get_tag_info. Fires build tag info panel nodes at begin
		get_tag_info(self)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Render tool content_data
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container (area thesaurus)
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			id				: 'left_container',
			class_name		: 'left_container',
			parent			: fragment
		})

		// thesaurus render
			self.area_thesaurus.render()
			.then(function(node){
				left_container.appendChild(node)
				// fix pointer
				left_container.area_thesaurus_node = node
			})

	// right_container (component_text_area && component_portal)
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			id				: 'right_container',
			class_name		: 'right_container',
			parent			: fragment
		})

		// transcription_component (component_text_area)
			const transcription_component_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'transcription_component_container',
				parent			: right_container
			})

			// lang_selector
				const lang_selector = ui.build_select_lang({
					selected	: self.transcription_component.lang,
					class_name	: 'dd_input selector'
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
						// show_interface
						component.show_interface.tools = false
						component.render()
						.then(function(node){
							// remove previous node
							while (transcription_component_container.lastChild && transcription_component_container.lastChild!==lang_selector) {
								transcription_component_container.removeChild(transcription_component_container.lastChild)
							}
							// add the new component to the container
							transcription_component_container.appendChild(node)
							// console.log("self.transcription_component.is_data_changed:",self.transcription_component.is_data_changed);
						})
				})
				transcription_component_container.appendChild(lang_selector)

			// transcription_component. render another node of component caller and append to container
				const transcription_component = self.transcription_component || await self.get_component(self.lang)
				// set auto_init_editor = true to force init editor instead use user click to activate it
				transcription_component.auto_init_editor = true
				// show_interface
				transcription_component.show_interface.tools = false

				const transcription_component_node = await transcription_component.render()
				transcription_component_container.appendChild(transcription_component_node)

			// Original lang set label
				if (transcription_component.lang!==self.lang) {
					const lang_selector_options	= Array.from(lang_selector.options);
					const option_to_select		= lang_selector_options.find(item => item.value===transcription_component.lang);
					const label					= get_label.original || 'Original'
					option_to_select.text		= option_to_select.text + ' ('+label+')'
				}

		// info container
			const info_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'info_container',
				parent			: right_container
			})
			// fix
			self.info_container = info_container

		// tag_info
			const tag_info = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tag_info',
				parent			: info_container
			})

		// indexation_container
			const indexation_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'indexation_container',
				parent			: right_container
			})

			// indexing_component (component_portal)
				const component_indexing_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'component_indexing_container tab active',
					parent			: indexation_container
				})
				// self.indexing_component.context.view	= 'indexation' // set indexation as render view
				// self.indexing_component.autocomplete	= false // prevent load autocomplete service
				self.indexing_component.render()
				.then(function(indexing_component_node){
					component_indexing_container.appendChild(indexing_component_node)
				})

		// info (indexation note)
			const indexation_note = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'indexation_note tab',
				parent			: indexation_container
			})
			// fix
			self.indexation_note = indexation_note
			// self.indexing_component.render()
			// .then(function(indexing_component_node){
			// 	component_indexing_container.appendChild(indexing_component_node)
			// })

		// references component
			const references_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'indexation_container',
				parent			: right_container
			})

			const component_references_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'component_indexing_container tab',
				parent			: references_container
			})

			const references_component = self.references_component
			if (references_component) {
				references_component.render()
				.then(function(references_component_node){
					component_references_container.appendChild(references_component_node)
				})
			}else{
				console.error('Ignored references_component render. Not found');
			}

		// tag_info_container. line info about tag
			const tag_info_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'tag_info_container hide',
				parent			: tag_info
			})
			// fix node
			self.tag_info_container = tag_info_container

			const tab_nodes = []

			const activate_tab = function( name ){

				const tab_nodes_len = tab_nodes.length

				for (let i = tab_nodes_len - 1; i >= 0; i--) {
					const current_tab = tab_nodes[i]

					if(current_tab.name === name){
						current_tab.node.classList.add('active')
						current_tab.component_node.classList.add('active')
					}else{
						current_tab.node.classList.remove('active')
						current_tab.component_node.classList.remove('active')
					}
				}
			}

			// tab_indexation
				const tab_indexation = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tab_label active',
					inner_html		: 'Indexation',
					parent			: info_container
				})
				tab_indexation.addEventListener('click', function(e){
					e.stopPropagation()
					activate_tab('indexation')
				})

				tab_nodes.push({
					name: 'indexation',
					node: tab_indexation,
					component_node: component_indexing_container
				})

			// tab_info
				const tab_info = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tab_label',
					inner_html		: 'Info',
					parent			: info_container
				})
				tab_info.addEventListener('click', function(e){
					e.stopPropagation()
					activate_tab('info')
				})

				tab_nodes.push({
					name: 'info',
					node: tab_info,
					component_node: indexation_note
				})

			// tab_references
				const tab_references = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'tab_label',
					inner_html		: 'References',
					parent			: info_container
				})
				tab_references.addEventListener('click', function(e){
					e.stopPropagation()
					activate_tab('references')
				})
				tab_nodes.push({
					name: 'references',
					node: tab_references,
					component_node: component_references_container
				})



	// split
	// @see https://github.com/nathancahill/split/tree/master/packages/splitjs
		when_in_viewport(
			left_container, // node to observe
			() => { // callback
				// don't add on small windows
				if (window.innerWidth<800) {
					return
				}
				Split(['#left_container', '#right_container'], {
					sizes: [45, 55],
					minSize: '40%'
				});
				// console.log("activated Split:", Split);
			}
		)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

		// fix pointers
		content_data.left_container = left_container


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

	// short vars
		const tag_info_container = self.tag_info_container

	// info container
		// const info_container = self.info_container
		// clean previous nodes
		// while (info_container.lastChild) {
		// 	info_container.removeChild(info_container.lastChild)
		// }

	// tag_info_container. line info about tag
		// const tag_info_container = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name		: 'tag_info_container hide',
		// 	parent			: info_container
		// })
		// // fix node
		// self.tag_info_container = tag_info_container

	// tag id info
		const fragment_id_info = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'fragment_id_info',
			parent			: tag_info_container
		})
		// fragment_id_label
		ui.create_dom_element({
			element_type	: 'span',
			inner_html		: get_label.tag || 'Tag',
			parent			: fragment_id_info
		})
		const fragment_id_tag_id = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'fragment_id_tag_id',
			inner_html		: tag_id,
			parent			: fragment_id_info
		})

	// state
		// wrap_tag_state_selector selector
			ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'wrap_tag_state_selector',
				inner_html		: get_label.state || 'State',
				parent			: tag_info_container
			})
		// state selector
			const tag_state_selector = ui.create_dom_element({
				element_type	: 'select',
				class_name		: 'selector tag_state_selector',
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
				title			: get_label.delete || 'Delete',
				class_name		: 'button remove',
				parent			: wrap_delete_tag
			})
			button_delete.addEventListener('click', function(e) {
				e.stopPropagation()

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
				inner_html		: get_label.delete || 'Delete',
				parent			: wrap_delete_tag
			})

	// active values
		self.active_value('tag_id', function(value) {

			tag_id							= value // update current tag_id var (let)
			fragment_id_tag_id.textContent	= value // update fragment label
			button_delete_label.textContent	= get_label.delete || 'Delete' //  + ' ' + value // update delete label

			// show/hide info_container
				if (self.tag_info_container.classList.contains('hide')) {
					self.tag_info_container.classList.remove('hide')
				}
		})
		self.active_value('state', function(value) {

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
* RENDER_RELATED_LIST
* This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
* @param object self
* 	tool instance
* @return DocumentFragment
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
			inner_html		: (get_label.approach || 'Aproch') + ': &nbsp;',
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

	// select node
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'hidden selector',
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
			const ar_component_data	= data.filter(el =>
				el.section_tipo === current_locator.section_top_tipo &&
				el.section_id === current_locator.section_top_id
			)

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
				const current_value = current_locator.section_top_tipo + '_' + current_locator.section_top_id
				const option = ui.create_dom_element({
					element_type	: 'option',
					inner_html		: label,
					value			: current_value,
					parent			: select
				})
				option.locator = current_locator
		}//end for

	// local_db
		const status_id			= 'tool_indexation_approach'
		const local_db_table	= 'status'

	// change event
		select.addEventListener('change', async function(e){

			self.top_locator = this.options[this.selectedIndex].locator

			// fix value in local DDBB table status
				const data = {
					id		: status_id,
					value	: e.target.value
				}
				data_manager.set_local_db_data(
					data,
					local_db_table
				)
		})

	// select initial value. local DDBB table status
		data_manager.get_local_db_data(
			status_id,
			local_db_table,
			true
		)
		.then(async function(db_data){
			if (db_data) {
				select.value = db_data.value
				// select.dispatchEvent(new Event('change'))
			}

			// select first options if no value
				if (!select.value && value_length===1) {
					select.selectedIndex = 0
				}

			select.classList.remove('hidden')
		})


	return fragment
}//end render_related_list



/**
* RENDER_VIEWER_SELECTOR
* Let user select left side viewer from options (thesaurus/audiovisual)
* @param object self
* 	tool instance
* @return DocumentFragment
*/
const render_viewer_selector = function(self, wrapper){

	// short vars
		const media_component	= self.media_component
		const area_thesaurus	= self.area_thesaurus
		const items = [
			{
				label : area_thesaurus.label,
				value : 'area_thesaurus'
			},
			{
				label : media_component.label,
				value : 'media_component'
			}
		]

	// fix initial viewer name (Thesaurus)
		self.viewer = items[0].value

	const fragment = new DocumentFragment();

	// viewer_selector_container
		const viewer_selector_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'viewer_selector_container',
			// inner_html		: (get_label.viewer || 'Viewer') + ': &nbsp;',
			parent			: fragment
		})

	// select viewer
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'selector viewer_selector',
			parent			: viewer_selector_container
		})
		// change event
		select.addEventListener('change', async function(e){

			// fix the new viewer name
			self.viewer = e.target.value
			// console.log('Fixed new self.viewer:', self.viewer);

			const left_container		= wrapper.content_data.left_container
			const area_thesaurus_node	= left_container.area_thesaurus_node
			const media_component_node	= left_container.media_component_node || null

			if (self.viewer==='media_component') {

				// hide area_thesaurus_node
					area_thesaurus_node.classList.add('hide')

				// show media_component_node
					if (media_component_node) {
						media_component_node.classList.remove('hide')
					}else{
						// first call, do not exists
						// self.media_component.mode = 'player'
						self.media_component.render()
						.then(function(node){
							left_container.appendChild(node)
							// fix pointer
							left_container.media_component_node = node
						})
					}
			}else
			if (self.viewer==='area_thesaurus'){

				// hide media_component_node
					if (media_component_node) {
						media_component_node.classList.add('hide')
					}

				// show area_thesaurus_node
					area_thesaurus_node.classList.remove('hide')
			}
		})

	// option label
		const option_blank = ui.create_dom_element({
			element_type	: 'option',
			inner_html		: (get_label.viewer || 'Viewer') + ': &nbsp;',
			value			: null,
			parent			: select
		})
		option_blank.disabled = true

	// options
		const items_length = items.length
		for (let i = 0; i < items_length; i++) {

			const item = items[i]

			// option
			const option = ui.create_dom_element({
				element_type	: 'option',
				inner_html		: item.label,
				value			: item.value,
				parent			: select
			})
			if (item.value==='area_thesaurus') {
				option.selected = true // select default (Thesaurus)
			}
		}


	return fragment
}//end render_viewer_selector



/**
* RENDER_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
* @param object self
* 	instance of current tool
* @return HTMLElement fragment
*/
const render_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view	= 'mini'
			self.status_user_component.show_interface.tools = false
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.show_interface.tools = false
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_status


// @license-end
