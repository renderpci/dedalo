// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise */
/*eslint no-undef: "error"*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {clone, object_to_url_vars} from '../../common/js/utils/index.js'
	import {ui} from '../../common/js/ui.js'
	import {create_source, push_browser_history} from '../../common/js/common.js'
	import {open_tool} from '../../../tools/tool_common/js/tool_common.js'
	import {
		render_column_id
	} from './render_list_section.js'



/**
* VIEW_GRAPH_LIST_SECTION
* Manages the component's logic and appearance in client side
*/
export const view_graph_list_section = function() {

	return true
}//end view_graph_list_section



/**
* RENDER
* Render node for use current view
* @param object self
* @para object options
* sample:
* {
*    "render_level": "full",
*    "render_mode": "list"
* }
* @return HTMLElement wrapper
*/
view_graph_list_section.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// DocumentFragment
		const fragment = new DocumentFragment()

	// content_data
		const content_data = await get_content_data(self)

		if (render_level==='content') {
			return content_data
		}

	// buttons add
		if (self.buttons && self.mode!=='tm') {
			const buttons_node = get_buttons(self);
			if(buttons_node){
				fragment.appendChild(buttons_node)
			}
		}

	// search filter node
		if (self.filter && self.mode!=='tm') {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			// set pointers
			self.search_container = search_container
		}

	// content_data append at end
		fragment.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.section_tipo}_${self.tipo} ${self.tipo} ${self.mode} view_${self.view}`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @para object self
* @return HTMLElement content_data
*/
const get_content_data = async function(self) {

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)

	// get values by typologies
		const order_key = self.context?.properties?.view_config?.group_by || 'nexus46'
		const data_to_be_grouped = self.datum.data.filter(el => el.tipo === order_key)

		const group_by = function(array, key) {
			return array.reduce(function(rv, x) {
			(rv[x[key]] = rv[x[key]] || []).push(x);
				return rv;
			}, {});
		};
		const order_value = group_by(data_to_be_grouped, 'value')

		for (const group_label in order_value) {

			const current_group = order_value[group_label]

			const grouped_value = []

			const current_group_length = current_group.length
			for (let i = 0; i < current_group_length; i++) {
				const item = current_group[i]

				const current_value = self.data.value.find(el => el.section_id === item.section_id)

				grouped_value.push(current_value)
			}

			// ar_section_record. section_record instances (initialized and built)
			const current_instances = await get_section_records({
				caller	: self,
				view	: self.view,
				value	: grouped_value
			})
			self.ar_instances.push(...current_instances)

			const current_block = await render_grouper_block(self, group_label, current_instances)
			if (current_block) {
				content_data.appendChild(current_block)
			}
		}//end for (const group_label in order_value)


	return content_data
}//end get_content_data



/**
* RENDER_GROUPER_BLOCK
* @param {object} self
* @param {string} group_label
* @param {array} ar_section_record
* @return {HTMLElement} content_data
*/
const render_grouper_block = async function(self, group_label, ar_section_record) {

	const fragment = new DocumentFragment()

	const grouper_block = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'grouper_block',
		parent			: fragment
	})

	const group_label_node = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'group_label',
		inner_html 		: group_label || '',
		parent			: grouper_block
	})

	const group_content = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'group_content',
		parent			: grouper_block
	})

	// rows. parallel mode
	const ar_section_record_length = ar_section_record.length
	const ar_promises = []
	for (let i = 0; i < ar_section_record_length; i++) {
		const render_promise_node = ar_section_record[i].render()
		ar_promises.push(render_promise_node)
	}

	const values = await Promise.all(ar_promises)
	for (let i = 0; i < ar_section_record_length; i++) {
		const section_record_node = values[i]
		group_content.appendChild(section_record_node)
	}


	return fragment
}//end render_grouper_block



/**
* REBUILD_COLUMNS_MAP
* Adding control columns to the columns_map that will processed by section_recods
* @param object self
* @return obj columns_map
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// column section_id check
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			tipo		: 'section_id', // used to sort only
			sortable	: true,
			width		: 'minmax(auto, 6rem)',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: render_column_id
		})

	// graph column
		columns_map.push({
			id			: 'graph',
			label		: '', // get_label.delete || 'Delete',
			width 		: 'auto',
			callback	: render_column_graph
		})

	// columns base
		const base_columns_map = await self.columns_map

		const remove_columns = self.context.properties?.view_config?.remove_columns || []
		const base_columns_map_length = base_columns_map.length

		for (let i = 0; i < base_columns_map_length; i++) {
			const column = base_columns_map[i]

			const found = remove_columns.includes(column.tipo)
			if(found){
				continue
			}
			columns_map.push(column)
		}

	// fixed as calculated
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement fragment
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context.buttons
		if(!ar_buttons) {
			return null;
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_container',
			parent			: fragment
		})

	// filter button (search) . Show and hide all search elements
		const filter_button	= ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'warning search',
			inner_html		: get_label.find || 'Search',
			parent			: buttons_container
		})
		filter_button.addEventListener('mousedown', function(e) {
			e.stopPropagation()
			// Note that self section is who is observing this event (init)
			event_manager.publish('toggle_search_panel_'+self.id)
		})

	// non_editable_sections. Activity section 'dd542'
		const non_editable_sections = [
			'dd542', // activity
			'dd1324' // registered tools
		]
		if (non_editable_sections.includes(self.tipo)) {
			return fragment
		}

	// other_buttons_block
		const other_buttons_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'other_buttons_block hide',
			parent			: buttons_container
		})

	// other buttons
		const ar_buttons_length = ar_buttons.length;
		for (let i = 0; i < ar_buttons_length; i++) {

			const current_button = ar_buttons[i]

			// button_delete multiple
			// check if user is global admin to activate the button delete (avoid users to delete multiple sections)
				if(current_button.model==='button_delete' && page_globals.is_global_admin===false){
					continue
				}

			// button node
				const class_name	= 'warning ' + current_button.model.replace('button_', '')
				const button_node	= ui.create_dom_element({
					element_type	: 'button',
					class_name		: class_name,
					inner_html		: current_button.label,
					parent			: other_buttons_block
				})
				button_node.addEventListener('click', (e) => {
					e.stopPropagation()

					switch(current_button.model){
						case 'button_new':
							event_manager.publish('new_section_' + self.id)
							break;

						case 'button_delete': {
							// sqo conform
							const delete_sqo = clone(self.rqo.sqo)
							delete_sqo.limit = null
							delete delete_sqo.offset

							// delete_record
							self.render_delete_record_dialog({
								section			: self,
								section_id		: null,
								section_tipo	: self.section_tipo,
								sqo				: delete_sqo
							})
							break;
						}
						// button_import and button_trigger cases for compatibility with v5 ontology
						// in future version will be merge both with new model button_tool
						// in the mid-time use button_trigger for general cases to dispatch tools.
						case 'button_import':
						case 'button_trigger':
							// open_tool (tool_common)
							open_tool({
								tool_context	: current_button.tools[0],
								caller			: self
							})
							break;

						default:
							event_manager.publish('click_' + current_button.model)
							break;
					}
				})
		}//end for (let i = 0; i < ar_buttons_length; i++)

	// tools buttons
		ui.add_tools(self, other_buttons_block)

	// show_other_buttons_button
		const show_other_buttons_label	= get_label.show_buttons || 'Show buttons'
		const show_other_buttons_button	= ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'icon_arrow show_other_buttons_button',
			title			: show_other_buttons_label,
			dataset			: {
				label : show_other_buttons_label
			},
			parent			: buttons_container
		})
		show_other_buttons_button.addEventListener('click', function(e) {
			e.stopPropagation()
		})

		// track collapse toggle state of content
		ui.collapse_toggle_track({
			toggler				: show_other_buttons_button,
			container			: other_buttons_block,
			collapsed_id		: 'section_other_buttons_block',
			collapse_callback	: collapse,
			expose_callback		: expose,
			default_state		: 'closed'
		})
		function collapse() {
			show_other_buttons_button.classList.remove('up')
		}
		function expose() {
			show_other_buttons_button.classList.add('up')
		}


	return fragment
}//end get_buttons



/**
* RENDER_COLUMN_GRAPH
* @param object DocumentFragment
* @return DocumentFragment fragment
*/
const render_column_graph = function(options) {

	// options
		const self			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// DocumentFragment
		const fragment = new DocumentFragment()

	// graph_button
	const graph_button = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'button graph',
		parent			: fragment
	})
	// mouseup event
	let is_processing = false
	const mouseup_handler = async (e) => {

		// Prevent multiple simultaneous executions
		if (is_processing) {
			return;
		}
		is_processing = true

		try {

			const target_section_value	= self.context?.properties?.view_config?.target_section_value || 'nexus53'

			// Validate self.datum.data exists
			if (!self.datum?.data || !Array.isArray(self.datum.data)) {
				console.error('render_column_graph: self.datum.data is not available or not an array');
				return;
			}

			// Find target section data
			const target_section_data	= self.datum.data.find(el =>
				el.section_id	=== section_id &&
				el.section_tipo	=== section_tipo &&
				el.tipo			=== target_section_value
			)

			// Extract target section type
			const target_section_tipo = target_section_data?.value?.[0];

			if (!target_section_tipo) {
				console.warn('render_column_graph: Empty target_section_data value:', target_section_data);
				return;
			}

			// target section
			const section = await get_instance({
				model 			: 'section',
				tipo			: target_section_tipo,
				section_tipo	: target_section_tipo,
				mode 			: 'solved',
				inspector 		: false
			})

			if (!section) {
                throw new Error('render_column_graph: Failed to create section instance');
            }

			await section.build(true)

			// Configure section
			section.view = 'graph'
			section.caller = self.caller // injected caller (page), needed because to render new menu label

			// Render section
			const section_node = await section.render()

			// Add to DOM
            if (self.node && self.node.after) {
                self.node.after(section_node);
            } else {
                console.error('render_column_graph: self.node.after is not available');
                return;
            }

			// remove current section instance and nodes
			self.destroy(true, true, true)

			// navigation (update browser URL and history)
			const source	= create_source(section, null)
			const sqo		= section.request_config_object.sqo
			const title		= section.id

			// url search. Append section_id if exists
			const url = '?' + object_to_url_vars({
				tipo	: section.tipo,
				mode	: section.mode,
				view	: section.view,
				fst		: section_tipo,
				fsi		: section_id
			})

			// browser navigation update
			push_browser_history({
				source	: source,
				sqo		: sqo,
				title	: title,
				url		: url
			})
		} catch (error) {
			console.error('render_column_graph: Error in mouseup handler:', error);
		} finally {
			is_processing = false;
		}
	}
	graph_button.addEventListener('mouseup', mouseup_handler)


	return fragment
}//end render_column_graph



// @license-end
