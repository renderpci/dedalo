// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'



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
* @return HTMLElement wrapper
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

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
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
		if (self.epigraphy) {
			const epigraphy_node = await self.epigraphy.render()
			left_container.appendChild(epigraphy_node)
		}

	// common update nodes function, use for autocompletes to generate the target text_areas
		const update_text_nodes = async function (options){
			// options
			const caller		= options.caller
			const node			= options.node
			const role			= options.role
			const name			= options.name

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

					const result_relations = await self.get_relations({
						data : current_value,
						role : role,
						name : name,
						count: true
					})
					const count_node = ui.create_dom_element({
						element_type	: 'span',
						class_name 		: 'count',
						inner_html 		: self.get_tool_label('used_in') +': '+result_relations.total,
						parent 			: new_text_node
					})
				}
			}// end if(data)
		}// end update_text_nodes()


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

			// await self.coins.build(true)
			if (self.coins) {
				const coins_node = await self.coins.render()
				coins_container.appendChild(coins_node)
			}

		// legends nodes
			const legends_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container legends_container',
				parent 			: right_container
			})

				if (self.obverse_legend) {
					const obverse_legend_node = await self.obverse_legend.render()
					legends_container.appendChild(obverse_legend_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.obverse_legend.id_base, update_obverse_legend)
					)
				}
				function update_obverse_legend(options) {
					update_text_nodes({
						caller		: self.obverse_legend,
						node		: obverse_legend_text_container,
						role		: 'legend_text',
						name		: 'obverse_legend_text',
					})
				}

				if (self.reverse_legend) {
					const reverse_legend_node = await self.reverse_legend.render()
					legends_container.appendChild(reverse_legend_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.reverse_legend.id_base, update_reverse_legend)
					)
				}
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

				// first load of the text data
					if (self.obverse_legend) update_obverse_legend()
					if (self.reverse_legend) update_reverse_legend()

		// Designs nodes
			const desings_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container desings_container',
				parent 			: right_container
			})

				if (self.obverse_desing) {
					const obverse_desing_node = await self.obverse_desing.render()
					desings_container.appendChild(obverse_desing_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.obverse_desing.id_base, update_obverse_desing)
					)
				}
				function update_obverse_desing(options) {
					update_text_nodes({
						caller	: self.obverse_desing,
						node	: obverse_desing_text_container,
						role	: 'desing_text',
						name	: 'obverse_desing_text'
					})
				}

				if (self.reverse_desing) {
					const reverse_desing_node = await self.reverse_desing.render()
					desings_container.appendChild(reverse_desing_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.reverse_desing.id_base, update_reverse_desing)
					)
				}
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
				// first load of the text data
					if (self.obverse_desing) update_obverse_desing()
					if (self.reverse_desing) update_reverse_desing()

		// symbols nodes
			const symbols_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container symbols_container',
				parent 			: right_container
			})

				if (self.obverse_symbol) {
					const obverse_symbol_node = await self.obverse_symbol.render()
					symbols_container.appendChild(obverse_symbol_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.obverse_symbol.id_base, update_obverse_symbol)
					)
				}
				function update_obverse_symbol(options) {
					update_text_nodes({
						caller	: self.obverse_symbol,
						node	: obverse_symbol_text_container,
						role	: 'desing_text',
						name	: 'obverse_symbol_text'
					})
				}

				if (self.reverse_symbol) {
					const reverse_symbol_node = await self.reverse_symbol.render()
					symbols_container.appendChild(reverse_symbol_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.reverse_symbol.id_base, update_reverse_symbol)
					)
				}
				function update_reverse_symbol(options) {
					update_text_nodes({
						caller	: self.reverse_symbol,
						node	: reverse_symbol_text_container,
						role	: 'desing_text',
						name	: 'reverse_symbol_text'
					})
				}
				const symbols_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container symbols_container',
					parent 			: right_container
				})
					const obverse_symbol_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container obverse_symbol_text_container',
						parent 			: symbols_text_container
					})
					const reverse_symbol_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container reverse_symbol_text_container',
						parent 			: symbols_text_container
					})
				// first load of the text data
					if (self.obverse_symbol) update_obverse_symbol()
					if (self.reverse_symbol) update_reverse_symbol()

		// marks nodes
			const marks_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container marks_container',
				parent 			: right_container
			})

				if (self.obverse_mark) {
					const obverse_mark_node = await self.obverse_mark.render()
					marks_container.appendChild(obverse_mark_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.obverse_mark.id_base, update_obverse_mark)
					)
				}
				function update_obverse_mark(options) {
					update_text_nodes({
						caller	: self.obverse_mark,
						node	: obverse_mark_text_container,
						role	: 'mark_text',
						name	: 'obverse_mark_text'
					})
				}

				if (self.reverse_mark) {
					const reverse_mark_node = await self.reverse_mark.render()
					marks_container.appendChild(reverse_mark_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.reverse_mark.id_base, update_reverse_mark)
					)
				}
				function update_reverse_mark(options) {
					update_text_nodes({
						caller	: self.reverse_mark,
						node	: reverse_mark_text_container,
						role	: 'mark_text',
						name	: 'reverse_mark_text'
					})
				}
				const marks_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container marks_container',
					parent 			: right_container
				})
					const obverse_mark_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container obverse_mark_text_container',
						parent 			: marks_text_container
					})
					const reverse_mark_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container reverse_mark_text_container',
						parent 			: marks_text_container
					})
				// first load of the text data
					if (self.obverse_mark) update_obverse_mark()
					if (self.reverse_mark) update_reverse_mark()

 		// edges nodes
			const edges_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'portal_container edges_container',
				parent 			: right_container
			})

				if (self.edge_desing) {
					const edge_desing_node = await self.edge_desing.render()
					edges_container.appendChild(edge_desing_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.edge_desing.id_base, update_obverse_edge)
					)
				}
				function update_obverse_edge() {
					update_text_nodes({
						caller	: self.edge_desing,
						node	: edge_desing_text_container,
						role	: 'desing_text',
						name	: 'edge_desing_text'
					})
				}

				if (self.edge_legend) {
					const edge_legend_node = await self.edge_legend.render()
					edges_container.appendChild(edge_legend_node)
					self.events_tokens.push(
						event_manager.subscribe('save_'+ self.edge_legend.id_base, update_reverse_edge)
					)
				}
				function update_reverse_edge() {
					update_text_nodes({
						caller	: self.edge_legend,
						node	: edge_legend_text_container,
						role	: 'legend_text',
						name	: 'edge_legend_text'
					})
				}
				const edges_text_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'portal_container edges_container',
					parent 			: right_container
				})
					const edge_desing_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container edge_desing_text_container',
						parent 			: edges_text_container
					})
					const edge_legend_text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'text_container edge_legend_text_container',
						parent 			: edges_text_container
					})
					if (self.edge_desing) update_obverse_edge()
					if (self.edge_legend) update_reverse_edge()

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
}//end get_content_data_edit



/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @param object self
* 	instance of current tool
* @return HTMLElement activity_info_body
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



// @license-end
