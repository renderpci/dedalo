// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, DEDALO_CORE_URL, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		clone
	} from '../../common/js/utils/index.js'



/**
* RENDER_MENU
* @param object options
* @return HTMLElementwrapper
*/
export const render_menu = (options) => {

	// options
		const self		= options.self
		const tipo		= options.tipo

	// datalist
		const data		= self.data || []
		const datalist	= data.tree_datalist || []

	const wrapper = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'menu_mobile_wrapper'
	})

	const datalist_length = datalist.length
	for (let i = 0; i < datalist_length; i++) {
		const item = datalist[i]
		if (item.parent===tipo) {
			const node = render_menu_node(item, datalist)
			wrapper.appendChild(node)
		}
	}

	// // ontology button
	// if (self.ontology_link) {
	// 	const cloned_node = self.ontology_link.cloneNode(true);
	// 	cloned_node.classList.remove('top_item')
	// 	cloned_node.classList.add('menu_mobile_item')
	// 	cloned_node.addEventListener('click', self.open_ontology)
	// 	wrapper.append(cloned_node)
	// }


	return wrapper
}//end render_tree



/**
* RENDER_MENU_NODE
* @param object item
* sample
* {
*	label: "Hallazgos"
*	model: "section"
*	parent: "dd242"
*	tipo: "numisdata279"
* }
* @return bool
*/
const render_menu_node = (item, datalist) => {

	const fragment = new DocumentFragment()

	// item label
		const menu_item = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'menu_mobile_item',
			inner_html		: item.label,
			parent			: fragment
		})
		const mousedown_handler = function(e) {
			if (this.classList.contains('with_children')) {
				if (this.classList.contains('active')) {
					this.children_container.classList.add('hide')
					this.classList.remove('active')
				}else{
					this.children_container.classList.remove('hide')
					this.classList.add('active')
				}
			}else{
				// safe_item. Clone menu item before use it
					const safe_item = clone(item)

				// swap_tipo
					if (safe_item.config && safe_item.config.swap_tipo) {
						safe_item.tipo = safe_item.config.swap_tipo
					}

				// navigate
				event_manager.publish('user_navigation', {
					source : {
						tipo	: safe_item.tipo,
						model	: safe_item.model,
						mode	: 'list',
						// this config comes from properties (used by section_tool to define the config of the section that its called)
						config	: safe_item.config || null
					}
				})
			}
		}
		menu_item.addEventListener('mousedown', mousedown_handler)

	// children
		const children = datalist.filter(el => el.parent===item.tipo)
		const children_length = children.length
		if (children_length>0) {

			// children_container
			const children_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'menu_mobile_children_container hide',
				parent			: fragment
			})

			// update style
			menu_item.classList.add('with_children')

			// set pointer
			menu_item.children_container = children_container

			// add a copy of menu_item click-able
				const clone = menu_item.cloneNode(true);
				clone.classList.remove('with_children')
				clone.addEventListener('mousedown', mousedown_handler)
				children_container.append(clone)

			// children iterate
				for (let i = 0; i < children_length; i++) {
					const child			= children[i]
					const child_node	= render_menu_node(child, datalist)
					children_container.append(child_node)
				}
		}

	return fragment
}//end render_menu_node



// @license-end
