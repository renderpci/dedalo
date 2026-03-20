// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, Promise, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_section_records} from '../../section/js/section.js'
	import {
		render_column_component_info
	} from './render_edit_component_portal.js'



/**
* VIEW_TEXT_LIST_PORTAL
* Manages the component's logic and appearance in client side
*/
export const view_text_list_portal = function() {

	return true
}//end view_text_list_portal



/**
* RENDER
* Render node as text view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_portal.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map = [...self.columns_map]
		if (self.add_component_info === true) {
			columns_map.push({
				id       : 'ddinfo',
				label    : 'Info',
				callback : render_column_component_info
			})
		}

	// ar_section_record
		const ar_section_record = await get_section_records({
			caller      : self,
			mode        : 'list',
			view        : self.context.view,
			columns_map : columns_map
		})
		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type : 'span',
			class_name   : `wrapper_component ${self.model} ${self.mode} portal view_${self.view || self.context.view || 'default'}`
		})

	// add all nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length > 0) {
			const fragment = new DocumentFragment()
			const rendered_nodes = await Promise.all(ar_section_record.map(rec => rec.render()))

			for (let i = 0; i < ar_section_record_length; i++) {
				const rendered_node = rendered_nodes[i]
				if (rendered_node) {
					fragment.append(...rendered_node.childNodes)
				}

				// records_separator
				if (i < ar_section_record_length - 1) {
					const separator = self.context.records_separator || ''
					if (separator) {
						const node_records_separator = document.createTextNode(separator)
						fragment.appendChild(node_records_separator)
					}
				}
			}
			wrapper.appendChild(fragment)
		}


	return wrapper
}//end render



// @license-end
