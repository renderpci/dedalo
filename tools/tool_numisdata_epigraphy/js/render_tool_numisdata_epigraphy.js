/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	import {open_tool} from '../../tool_common/js/tool_common.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_tool_numisdata_epigraphy
* Manages the component's logic and appearance in client side
*/
export const render_tool_numisdata_epigraphy = function() {

	return true
}//end render_tool_numisdata_epigraphy



/**
* EDIT
* Render node
* @return DOM node
*/
render_tool_numisdata_epigraphy.prototype.edit = async function(options={render_level:'full'}) {

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

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const tanscription_options = await render_header_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(tanscription_options)

	// // status, render the status components for users and admins to control the process of the tool
	// 	const status_container = await render_status(self)
	// 	wrapper.tool_buttons_container.appendChild(status_container)

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)


	return wrapper
}//end render_tool_numisdata_epigraphy



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// component_epigraphy. render another node of component caller and append to container
		const epigraphy_node = await self.epigraphy.render()
		left_container.appendChild(epigraphy_node)

	// common update nodes function, use for autocompletes to generate the target text_areas
		const update_text_nodes = async function (options){
			// options
			const caller	= options.caller
			const node		= options.node
			const role		= options.role
			const name		= options.name
			// clean the text container
			while (node.firstChild) {
				node.removeChild(node.firstChild);
			}
			// create and render new nodes and add to text container
			if(caller.data && caller.data.value){
				const value = caller.data.value
				const value_len = value.length
				for (let i = 0; i < value_len; i++) {
					const current_value = value[i]
					const new_component = await self.get_component({
						data : current_value,
						role : role,
						name : name
					})
					const new_text_node = await new_component.render()
					node.appendChild(new_text_node)
				}
			}

		}


	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})

		// Coins
			const coins_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'coins_container',
				parent 			: right_container
			})
			// const ddo_coins = self.tool_config.ddo_map.find(el => el.role==='coins')

			// self.coins.context.properties = ddo_coins.properties
			// self.coins.rqo.sqo.limit = 1
			// self.coins.rqo.sqo.offset = 0
			// self.coins.rqo.source.properties = ddo_coins.properties
			// // self.coins.data = []
			// // self.coins.datum.data = []
			// // self.coins.ar_instances = []
			// self.coins.data.pagination.limit = 1
			// self.coins.data.pagination.offset = 0
			// self.coins.request_config_object.show.sqo_config.limit = 1
			// self.coins.request_config_object.sqo.limit = 1
			// self.coins.update_pagination_values('update')

			// self.coins.paginator.build(true)

			// const api_response = await data_manager.request({
			// 		body : self.coins.rqo
			// })


			// await self.coins.build(true)
			const coins_node = await self.coins.render()
			coins_container.appendChild(coins_node)

		// legends nodes
			const legends_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container legends_container',
				parent 			: right_container
			})

				const obverse_legend_node = await self.obverse_legend.render()
				legends_container.appendChild(obverse_legend_node)
				self.events_tokens.push(
					event_manager.subscribe('save_'+ self.obverse_legend.id_base, update_obverse_legend)
				)
				function update_obverse_legend(options) {
					update_text_nodes({
						caller	: self.obverse_legend,
						node	: obverse_legend_text_container,
						role	: 'legend_text',
						name	: 'obverse_legend_text'
					})
				}

				const reverse_legend_node = await self.reverse_legend.render()
				legends_container.appendChild(reverse_legend_node)
				self.events_tokens.push(
					event_manager.subscribe('save_'+ self.reverse_legend.id_base, update_reverse_legend)
				)
				function update_reverse_legend(options) {
					update_text_nodes({
						caller	: self.reverse_legend,
						node	: reverse_legend_text_container,
						role	: 'legend_text',
						name	: 'reverse_legend_text'
					})
				}
				const legends_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container legends_container',
					parent 			: right_container
				})
					const obverse_legend_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container obverse_legend_text_container',
						parent 			: legends_text_container
					})
					const reverse_legend_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container reverse_legend_text_container',
						parent 			: legends_text_container
					})
					update_text_nodes({
						caller	: self.obverse_legend,
						node	: obverse_legend_text_container,
						role	: 'legend_text',
						name	: 'obverse_legend_text'
					})
					update_text_nodes({
						caller	: self.reverse_legend,
						node	: reverse_legend_text_container,
						role	: 'legend_text',
						name	: 'reverse_legend_text'
					})

		// Designs nodes
			const desings_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container desings_container',
				parent 			: right_container
			})

				const obverse_desing_node = await self.obverse_desing.render()
				desings_container.appendChild(obverse_desing_node)
				self.events_tokens.push(
					event_manager.subscribe('save_'+ self.obverse_desing.id_base, update_obverse_desing)
				)
				function update_obverse_desing(options) {
					update_text_nodes({
						caller	: self.obverse_desing,
						node	: obverse_desing_text_container,
						role	: 'desing_text',
						name	: 'obverse_desing_text'
					})
				}

				const reverse_desing_node = await self.reverse_desing.render()
				desings_container.appendChild(reverse_desing_node)
				self.events_tokens.push(
					event_manager.subscribe('save_'+ self.reverse_desing.id_base, update_reverse_desing)
				)
				function update_reverse_desing(options) {
					update_text_nodes({
						caller	: self.reverse_desing,
						node	: reverse_desing_text_container,
						role	: 'desing_text',
						name	: 'reverse_desing_text'
					})
				}
				const desings_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container desings_container',
					parent 			: right_container
				})
					const obverse_desing_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container obverse_desing_text_container',
						parent 			: desings_text_container
					})
					const reverse_desing_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container reverse_desing_text_container',
						parent 			: desings_text_container
					})
					update_text_nodes({
						caller	: self.obverse_desing,
						node	: obverse_desing_text_container,
						role	: 'desing_text',
						name	: 'obverse_desing_text'
					})
					update_text_nodes({
						caller	: self.reverse_desing,
						node	: reverse_desing_text_container,
						role	: 'desing_text',
						name	: 'reverse_desing_text'
					})

		// symbols nodes
			const symbols_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container symbols_container',
				parent 			: right_container
			})

				const obverse_symbol_node = await self.obverse_symbol.render()
				symbols_container.appendChild(obverse_symbol_node)

				const reverse_symbol_node = await self.reverse_symbol.render()
				symbols_container.appendChild(reverse_symbol_node)


				const symbol_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container symbol_container',
					parent 			: right_container
				})

					const obverse_symbol_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container obverse_symbol_text_container',
						parent 			: symbol_text_container
					})
					const reverse_symbol_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container reverse_symbol_text_container',
						parent 			: symbol_text_container
					})

					if(self.obverse_symbol.data && self.obverse_symbol.data.value){
						const value = self.obverse_symbol.data.value
						const value_len = value.length
						for (let i = 0; i < value_len; i++) {
							const current_value = value[i]
							const obverse_symbol_text = await self.get_component({
								data : current_value,
								role : 'symbol_text',
								name : 'obverse_symbol_text',
							})
							const obverse_symbol_text_node = await obverse_symbol_text.render()
							obverse_symbol_text_container.appendChild(obverse_symbol_text_node)
						}
					}

					if(self.reverse_symbol.data && self.reverse_symbol.data.value){
						const value = self.reverse_symbol.data.value
						const value_len = value.length
						for (let i = 0; i < value_len; i++) {
							const current_value = value[i]
							const reverse_symbol_text = await self.get_component({
								data : current_value,
								role : 'symbol_text',
								name : 'reverse_symbol_text',
							})
							const reverse_symbol_text_node = await reverse_symbol_text.render()
							reverse_symbol_text_container.appendChild(reverse_desing_text_node)
						}
					}

		// marks nodes
			const marks_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container marks_container',
				parent 			: right_container
			})

				const mark_node = await self.mark.render()
				marks_container.appendChild(mark_node)

 		// edges nodes
			const edges_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container edges_container',
				parent 			: right_container
			})

				const edge_desing_node = await self.edge_desing.render()
				edges_container.appendChild(edge_desing_node)

				const edge_legend_node = await self.edge_legend.render()
				edges_container.appendChild(edge_legend_node)


	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
}//end get_content_data_edit



/**
* RENDER_RELATED_LIST
* This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
*/
const render_related_list = function(self){

	const datum		= self.relation_list
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
		//if the section is not called by other sections (related sections) return empty node
		if(!sections){
			return fragment
		}
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
}//end render_related_list



/**
* RENDER_HEADER_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_header_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

	// lang selector
		const lang_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'lang_selector',
			parent			: fragment
		})
		const lang_label = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'lang_label',
			inner_html 		: get_label.idioma || 'Language',
			parent 			: lang_container
		})
		// the lang selector use the content_data pointer .left_container to remove the transcription text_area and rebuild the new node
		const lang_selector = ui.build_select_lang({
			selected	: self.lang,
			class_name	: 'dd_input selector',
			action		: async function(e){
				// create new one
				const component = await self.get_component(e.target.value)
				self.lang = e.target.value
				component.render().then(function(node){
					// remove previous nodes
					while (content_data.left_container.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.left_container.removeChild(content_data.left_container.lastChild)
					}
					// add the new one
					content_data.left_container.appendChild(node)
				})
			}
		})
		lang_container.appendChild(lang_selector)

	return fragment
}//end render_header_options



/**
* RENDER_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
* @param object self
* 	instance of current tool
* @return DOM node fragment
*/
const render_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view	= 'mini'
			self.status_user_component.is_inside_tool = true
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.is_inside_tool = true
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_status



/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @param object self
* 	instance of current tool
* @return DOM node activity_info_body
*/
const render_activity_info = function(self) {

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body'
		})

	// event save
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options) {

			// recived options contains an object with instance and api_response
			const node_info_options = Object.assign(options,{
				container : activity_info_body
			})

			// render notification node
			const node_info = render_node_info(node_info_options)
			activity_info_body.prepend(node_info)
		}


	return activity_info_body
}//end render_activity_info
