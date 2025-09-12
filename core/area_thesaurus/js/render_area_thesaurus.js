// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {ts_object} from '../../ts_object/js/ts_object.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA_THESAURUS
* Manages the area appearance in client side
*/
export const render_area_thesaurus = function() {

	return true
}//end render_area_thesaurus



/**
* LIST
* Render the area thesaurus in list mode
* @param object options
* {
* 	render_level: string default: 'full'
* }
* @return HTMLElement
*/
render_area_thesaurus.prototype.list = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

		// parse data
		// sample data:
		// {
		// 	  tipo: "dd100",
		// 	  typologies: [{},...],
		// 	  value: [{},..]
		// }
		const data = self.data.find(item => item.tipo==='dd100' || item.tipo==='dd5') || {}

	// content_data
		if (render_level==='content') {

			if (data.ts_search) {

				// search result case

				// prevent to re-create content_data again
					const content_data = self.node.content_data

				// clean children_container nodes (inside categories)
					// const children_container = content_data.querySelectorAll('[data-role="children_container"]')
					// const children_container_length = children_container.length
					// for (let i = 0; i < children_container_length; i++) {
					// 	const item = children_container[i]
					// 	while (item.firstChild) {
					// 		item.removeChild(item.firstChild);
					// 	}
					// }

				// render. parse_search_result with ts_object
					dd_request_idle_callback(
						() => {
							ts_object.parse_search_result(
								data.ts_search.result, // object data
								data.ts_search.found, // to hilite
								null, // HTMLElement main_div
								false // bool is_recursion
							)
						}
					)

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
			// set pointers
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
		// set pointers
		wrapper.content_data = content_data

	// ts_search case
		if (data.ts_search) {
			const render_handler = () => {
				dd_request_idle_callback(
					() => {
						ts_object.parse_search_result(
							data.ts_search.result,
							data.ts_search.found, // to hilite
							null,
							false
						)
					}
				)
			}
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.filter.id, render_handler)
			)
			// search_tipos Ontology case
			// force filter render to fire the render event that parse the search result
			if (self.model==='area_ontology' && self.search_tipos) {
				self.filter.render()
			}
		}

	// event keydown
	// swap between title (section info as 'dd0') and title (tld as '[dd222]')
		let id_info_mode = 'tld' // tld|section
		const keydown_handler = (e) => {

			if (e.key==='s' && e.ctrlKey===true) {
				dd_request_idle_callback(
					() => {
						const id_infos = document.querySelectorAll('.id_info.ontology')
						const id_infos_length = id_infos.length
						for (let i = 0; i < id_infos_length; i++) {

							const item = id_infos[i]

							if (id_info_mode==='tld') {
								item.innerHTML	= item.dataset.section
								item.title		= item.dataset.term_id
								item.classList.add('show_section')
							}else{
								item.innerHTML	= item.dataset.term_id
								item.title		= item.dataset.section
								item.classList.remove('show_section')
							}
						}
						id_info_mode = (id_info_mode==='tld') ? 'section' : 'tld'
					}
				)
			}
		}
		document.removeEventListener('keydown', keydown_handler)
		document.addEventListener('keydown', keydown_handler)


	return wrapper
}//end list



/**
* RENDER_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const render_content_data = function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// thesaurus_list_wrapper ul container for list
		const ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'thesaurus_list_wrapper',
			parent			: fragment
		})

	// elements
		const data				= self.data.find(item => item.tipo==='dd100' || item.tipo==='dd5') || {}
		const hierarchy_nodes	= data.value || []
		const typology_nodes	= data.typologies || []

	// typology_nodes. sort typologies by order field
		typology_nodes.sort((a, b) => parseFloat(a.order) - parseFloat(b.order));

	// iterate typology_nodes
		const typology_length = typology_nodes.length
		for (let i = 0; i < typology_length; i++) {

			const typology_item = typology_nodes[i]

			// check if typology items are empty
				// hierarchy sections
				const hierarchy_sections_full	= hierarchy_nodes.filter(el => parseInt(el.typology_section_id)===parseInt(typology_item.section_id))
				const hierarchy_sections_length	= hierarchy_sections_full.length
				if (hierarchy_sections_length<1) {
					// skip empty typologies (without hierarchy nodes)
					continue
				}
				// skip empty root_terms hierarchies
				const root_terms_length = hierarchy_sections_full.map(el => el.root_terms.length).reduce((a, b) => a + b, 0)
				if (root_terms_length===0) {
					continue;
				}

			// thesaurus_type_block li
				const add_css = self.thesaurus_view_mode==='model'
					? ' model'
					: ''
				const li = ui.create_dom_element({
					element_type	: 'li',
					class_name		: 'thesaurus_type_block' + add_css,
					parent			: ul
				})

			// typology_name
				const typology_name = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'typology_name icon_arrow',
					dataset			: {
						section_id	: typology_item.section_id
					},
					inner_html		: typology_item.label,
					parent			: li
				})

			// typology_container
				const typology_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'typology_container',
					parent			: li
				})

			// collapse typology_name->typology_container children
				const collapse = () => {
					typology_name.classList.remove('up')
				}
				const expose = () => {
					typology_name.classList.add('up')
				}
				ui.collapse_toggle_track({
					toggler				: typology_name,
					container			: typology_container,
					collapsed_id		: 'collapsed_area_thesaurus_'+typology_item.section_id,
					collapse_callback	: collapse,
					expose_callback		: expose,
					default_state		: 'opened'
				})

				// sort hierarchy_nodes by order value and alphabetic. First those with a order value and then the rest.
				const ordered		= hierarchy_sections_full.filter(obj => obj.order !== 0).sort(sort_root_terms)
				const disordered	= hierarchy_sections_full.filter(obj => obj.order === 0).sort(sort_root_terms)
				// concatenate all values, ordered and disordered
				const hierarchy_sections = ordered.concat(disordered)
				for (let j = 0; j < hierarchy_sections_length; j++) {

					const hierarchy_sections_item = hierarchy_sections[j]

					const section_tipo			= hierarchy_sections_item.section_tipo
					const section_id			= hierarchy_sections_item.section_id
					const children_tipo			= hierarchy_sections_item.children_tipo
					const target_section_tipo	= hierarchy_sections_item.target_section_tipo
					const root_terms			= hierarchy_sections_item.root_terms
					if (root_terms.length<1) {
						continue;
					}

					const ts_object_instance = new ts_object()
					ts_object_instance.init({
						thesaurus_mode		: self.context?.thesaurus_mode || null,
						caller				: self,
						linker				: self.linker, // usually a portal component instance
						section_tipo		: section_tipo,
						section_id			: section_id,
						children_tipo		: children_tipo,
						target_section_tipo	: target_section_tipo,
						is_root_node		: true,
						is_descriptor		: true
					})
					.then(function(){

						// hierarchy_wrapper node
							const hierarchy_wrapper = ts_object_instance.render()
							typology_container.appendChild(hierarchy_wrapper)

						// loading
							const loading_node = ui.create_dom_element({
								element_type	: 'div',
								class_name		: 'elements_container loading',
								inner_html		: `Loading ${root_terms[0].section_tipo}`,
								parent			: hierarchy_wrapper
							})

						// children_data - render_children_data from API
							ts_object_instance.get_children_data({
								pagination		: null,
								children		: root_terms
							})
							.then(function(){
								// ts_object: render element children
								ts_object_instance.render_children({
									clean_children_container : false
								})
								.then(()=>{
									// remove loading
									loading_node.remove()
								})
							})
					})
				}//end iterate hierarchy_sections
		}//end for (let i = 0; i < typology_length; i++) typology_nodes

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end render_content_data



/**
* SORT_ROOT_TERMS
* Sort elements by order value and alphabetic ascending.
* If order value is the same, sort by target_section_name
* @return int 1|-1
*/
const sort_root_terms = function (a, b) {
	// If first value is same
	if (a.order == b.order) {
		// sort by target_section_name like 'Onomastic' ascending
		return new Intl.Collator().compare(a.target_section_name, b.target_section_name)
	} else {
		// order by order value from lowest to highest
		return a.order - b.order
	}
}//end sort_root_terms



/**
* GET_BUTTONS
* @param object self
* 	area instance
* @return DocumentFragment fragment
*/
const get_buttons = function(self) {

	// ar_buttons list from context
		const ar_buttons = self.context?.buttons
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
		const mousedown_handler = (e) => {
			e.stopPropagation()
			event_manager.publish('toggle_search_panel_'+self.id)
		}
		filter_button.addEventListener('mousedown', mousedown_handler)
		// ui.create_dom_element({
		// 	element_type	: 'span',
		// 	class_name		: 'button white search',
		// 	parent			: filter_button
		// })
		// filter_button.insertAdjacentHTML('beforeend', get_label.find)

	// other_buttons_block
		const other_buttons_block = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'other_buttons_block',
			parent			: buttons_container
		})

	// other buttons
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
					parent			: other_buttons_block
				})
				const click_handler = (e) => {
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
				}
				button_node.addEventListener('click', click_handler)
		}//end for (let i = 0; i < ar_buttons_length; i++)

	// tools
		ui.add_tools(self, other_buttons_block)


	return fragment
}//end get_buttons



// @license-end
