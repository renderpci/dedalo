// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {attach_item_dataframe, activate_edit_in_list} from '../../component_common/js/component_common.js'



/**
* VIEW_DEFAULT_LIST_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const view_default_list_input_text = function() {

	return true
}//end view_default_list_input_text



/**
* RENDER
* Render component node to use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_input_text.render = async function(self, options) {

	// short vars
		const data					= self.data || {}
		const entries				= data.entries || []
		const fallback_value		= data.fallback_value || []
		const fallback				= get_fallback_value(entries, fallback_value)
		const with_lang_versions	= self.context.properties.with_lang_versions ?? false
		const transliterate_value 	= self.data.transliterate_value || []

	// transliterate components
	// add the translation of the data
		const transliterate_value_text = (with_lang_versions && transliterate_value[0]?.value && entries.length > 0)
			? ' (' + transliterate_value[0].value + ')'
			: ''

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self)

	// click handler for edit mode activation
		wrapper.addEventListener('click', (e) => {
			e.stopPropagation()
			activate_edit_in_list(self, e)
		})

	// render values
		const fallback_length = fallback.length
		for (let i = 0; i < fallback_length; i++) {

			const value_string = fallback[i] + transliterate_value

			const content_value = ui.create_dom_element({
				element_type	: 'span',
				inner_html		: value_string,
				parent			: wrapper
			})

			// component_dataframe (shared literal-view glue, no-op without has_dataframe)
				await attach_item_dataframe({
					self		: self,
					item		: entries[i],
					container	: content_value
				})

			// separator
				if( i < entries.length -1 ) {
					// separator
					ui.create_dom_element({
						element_type	: 'span',
						inner_html		: self.context.fields_separator,
						parent			: content_value
					})
				}
		}


	return wrapper
}//end list



// @license-end
