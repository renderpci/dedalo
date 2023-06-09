// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {no_records_node} from '../../section/js/render_common_section.js'



/**
* RENDER_AREA_THESAURUS
* Manages the area appearance in client side
*/
export const render_area_thesaurus = function() {

	return true
}//end render_area_thesaurus



/**
* LIST
* Alias of edit
* @return HTMLElement
*/
render_area_thesaurus.prototype.list = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// ts_object. Is a global page var
		// set mode. Note that ts_object is NOT an instance
		self.ts_object.thesaurus_mode = self.context?.thesaurus_mode || null
		// caller set
		self.ts_object.caller = self
		self.ts_object.linker = self.linker // usually a portal component instance

		// parse data
		const data = self.data.find(item => item.tipo==='dd100')

	// content_data
		if (render_level==='content') {

			if (data.ts_search) {

				self.ts_object.parse_search_result(data.ts_search.result, null, false)
				// prevent to recreate content_data again
				const content_data = self.node.querySelector('.content_data.area')
				return content_data

			}else{

				const content_data = render_content_data(self)
				return content_data
			}
		}//end if (render_level==='content')

	const fragment = new DocumentFragment()

	// buttons_container
		const buttons_container = get_buttons(self);
		if(buttons_container){
			fragment.appendChild(buttons_container)
		}

	// search_container
		if (self.filter) {
			const search_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'search_container',
				parent			: fragment
			})
			self.search_container = search_container
		}

	// content_data
		const content_data = render_content_data(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data	: content_data,
			label			: null
		})
		wrapper.prepend(fragment)
		wrapper.content_data = content_data

	// ts_search case
		if (data.ts_search) {
			event_manager.subscribe('render_'+self.filter.id, exec_search)
			function exec_search() {
				self.ts_object.parse_search_result(data.ts_search.result, null, false)
			}
		}

	return wrapper
}//end list



/**
* RENDER_CONTENT_DATA
* @return HTMLElement content_data
*/
const render_content_data = function(self) {

	const fragment = new DocumentFragment()

	// container for list
		const ul = ui.create_dom_element({
			id				: 'thesaurus_list_wrapper',
			element_type	: 'ul',
			parent			: fragment
		})

	// elements
		const data				= self.data.find(item => item.tipo==='dd100')
		const ts_nodes			= data.value
		const typology_nodes	= ts_nodes.filter(node => node.type==='typology' )
		const typology_length	= typology_nodes.length
		const hierarchy_nodes	= ts_nodes.filter(node => node.type==='hierarchy')

	// sort typologies by order field
		typology_nodes.sort((a, b) => parseFloat(a.order) - parseFloat(b.order));

	// iterate typology_nodes
		for (let i = 0; i < typology_length; i++) {

			// li
				const li = ui.create_dom_element({
					element_type : 'li',
					parent 		 : ul,
				})
			// typology_header
				const typology_name = ui.create_dom_element({
					element_type	: 'div',
					class_name		:'typology_name icon_arrow',
					dataset			: {
						section_id	: typology_nodes[i].section_id
					},
					inner_html		: typology_nodes[i].label,
					parent			: li
				})
			// children_container
				const children_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		:'children_container',
					parent			: li
				})
			//collapse children
				ui.collapse_toggle_track({
					toggler				: typology_name,
					container			: children_container,
					collapsed_id		: 'collapsed_area_thesaurus_'+typology_nodes[i].section_id,
					collapse_callback	: collapse,
					expose_callback		: expose,
					default_state		: 'opened'
				})
				function collapse() {
					typology_name.classList.remove('up')
				}
				function expose() {
					typology_name.classList.add('up')
				}

			// hierarchy sections
				const hierarchy_sections = hierarchy_nodes.filter(node => node.typology_section_id===typology_nodes[i].section_id)

			//sort hierarchy_nodes by alphabetic
				hierarchy_sections.sort((a, b) => new Intl.Collator().compare(a.target_section_name, b.target_section_name));
				const hierarchy_sections_length = hierarchy_sections.length

				for (let j = 0; j < hierarchy_sections_length; j++) {

					// hierarchy wrapper
						const hierarchy_wrapper = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'wrap_ts_object hierarchy_root_node',
							dataset			: {
												node_type			: 'hierarchy_node',
												section_tipo		: hierarchy_sections[j].section_tipo,
												section_id			: hierarchy_sections[j].section_id,
												target_section_tipo	: hierarchy_sections[j].target_section_tipo,
											 },
							parent			: children_container
						})

					// hierarchy elements container
						const elements_contanier = ui.create_dom_element({
							element_type	: 'div',
							class_name		:'elements_contanier',
							parent			: hierarchy_wrapper

						})
						// hierarchy link_children
							const link_children = ui.create_dom_element({
								element_type	: 'div',
								class_name		:'list_thesaurus_element',
								id				: hierarchy_sections[j].section_tipo+'_'+hierarchy_sections[j].section_id+'_root',
								dataset			: {
													tipo	: hierarchy_sections[j].children_tipo,
													type 	: 'link_children'
												 },
								parent			: elements_contanier
							})
					// hierarchy children_container
							ui.create_dom_element({
								element_type	: 'div',
								class_name		:'children_container',
								dataset			: {
													section_id	: hierarchy_sections[j].section_id,
													role		: 'children_container'
												 },
								parent			: hierarchy_wrapper
							})

					// ts_object render
						self.ts_object.get_children(link_children)
				}
		}//end for (let i = 0; i < typology_length; i++)

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end render_content_data



/**
* GET_BUTTONS
* @param object self
* 	area instance
* @return HTMLElement fragment
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context.buttons
		if(!ar_buttons) {
			return null;
		}

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
				event_manager.publish('toggle_search_panel_'+self.id)
			})
			// ui.create_dom_element({
			// 	element_type	: 'span',
			// 	class_name		: 'button white search',
			// 	parent			: filter_button
			// })
			// filter_button.insertAdjacentHTML('beforeend', get_label.find)

		const ar_buttons_length = ar_buttons.length;
		for (let i = 0; i < ar_buttons_length; i++) {

			const current_button = ar_buttons[i]

			if(current_button.model==='button_delete') continue

			// button node
				const class_name	= 'warning ' + current_button.model
				const button_node	= ui.create_dom_element({
					element_type	: 'button',
					class_name		: class_name,
					inner_html		: current_button.label,
					parent			: buttons_container
				})
				button_node.addEventListener('click', (e) => {
					e.stopPropagation()

					switch(current_button.model){
						case 'button_new':
							event_manager.publish('new_section_' + self.id)
							break;
						case 'button_import':
							// tool_common.open_tool({
							// 	tool_context	: current_button.tools[0],
							// 	caller			: self
							// })
							break;
						default:
							event_manager.publish('click_' + current_button.model)
							break;
					}
				})
		}//end for (let i = 0; i < ar_buttons_length; i++)

	// tools
		ui.add_tools(self, buttons_container)

	return fragment
}//end get_buttons


// @license-end
