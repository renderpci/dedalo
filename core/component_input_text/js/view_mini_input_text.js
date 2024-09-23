// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'



/**
* VIEW_MINI_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_mini_input_text = function() {

	return true
}//end view_mini_input_text



/**
* RENDER
* Render node to be used in current mode
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_mini_input_text.render = async function(self, options) {

	// short vars
		const data					= self.data
		const value					= data.value || []
		const fallback_value		= data.fallback_value || []
		const fallback				= get_fallback_value(value, fallback_value)
		const with_lang_versions	= self.context.properties.with_lang_versions ?? false

	// transliterate components
	// add the translation of the data
		const transliterate_value = (with_lang_versions && self.data.transliterate_value && value.length)
			? ' (' + self.data.transliterate_value + ')'
			: ''

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {})

		const fallback_length = fallback.length
		for (let i = 0; i < fallback_length; i++) {

			const value_string = fallback[i] + transliterate_value

			const content_value = ui.create_dom_element({
				element_type	: 'span',
				inner_html		: value_string,
				parent			: wrapper
			})

			// component_dataframe
			if(self.properties.has_dataframe){

				content_value.classList.add('has_dataframe')

				const component_dataframe = await get_dataframe({
					self			: self,
					section_id		: self.section_id,
					section_tipo	: self.section_tipo,
					// tipo_key		: self.tipo,
					section_id_key	: i,
					view			: 'mini'
				})

				if(component_dataframe){
					self.ar_instances.push(component_dataframe)
					const dataframe_node = await component_dataframe.render()
					content_value.appendChild(dataframe_node)
				}
			}

			// separator
			if( i !== value.length -1 ){
				ui.create_dom_element({
					element_type	: 'span',
					inner_html		: self.context.fields_separator,
					parent			: content_value
				})
			}
		}//end for (let i = 0; i < fallback_length; i++)


	return wrapper
}//end mini



// @license-end
