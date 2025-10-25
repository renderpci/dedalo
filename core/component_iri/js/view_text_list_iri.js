// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'



/**
* VIEW_TEXT_LIST_IRI
* Manage the components logic and appearance in client side
*/
export const view_text_list_iri = function() {

	return true
}//end view_text_list_iri



/**
* RENDER
* Render node as text. URL is return as text node
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_text_list_iri.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		const ar_value_string	= [];
		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			// dataframe
			const component_dataframe = await get_dataframe({
				self				: self,
				section_id			: self.section_id,
				section_id_key		: value[i].id,
				section_tipo_key	: self.section_tipo,
				main_component_tipo	: self.tipo,
				view				: 'line',
				mode				: 'list'
			})
			// Add dataframe instance to component dependencies array
			self.ar_instances.push(component_dataframe)
			// Render the dataframe wrapper
			const dataframe_node = await component_dataframe.render()
			// Get only the text content discarding HTML nodes
			const text_node = dataframe_node.textContent
			if (text_node) {
				ar_line.push(text_node)
			}

			// title
			if (value[i].title) {
				ar_line.push(value[i].title)
			}

			// IRI
			if (value[i].iri) {
				ar_line.push(value[i].iri)
			}

			// Line add
			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}

		const value_string = (ar_value_string.length)
			? ar_value_string.join(', ')
			: ''

	// wrapper. Set as span
		const wrapper = ui.create_dom_element({
			element_type	: 'span',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`
		})

	// Append text_node
		const text_node = document.createTextNode(value_string);
		wrapper.appendChild(text_node)


	return wrapper
}//end render



// @license-end
