// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {get_dataframe} from '../../component_common/js/component_common.js'



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
		const data					= self.data
		const value					= data.value || []
		const fallback_value		= data.fallback_value || []
		const fallback				= get_fallback_value(value, fallback_value)
		const with_lang_versions	= self.context.properties.with_lang_versions || false

	// transliterate components
	// add the translation of the data
		const transliterate_value = (with_lang_versions && self.data.transliterate_value && value.length)
			? ' (' + self.data.transliterate_value + ')'
			: ''

		// const value_string = fallback.join(self.context.fields_separator) + transliterate_value

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self)
		if (self.show_interface.read_only!==true) {
			wrapper.addEventListener('click', function(e){
				e.stopPropagation()

				// dataframe detection
				if (ui.inside_dataframe(self)) {
					return false
				}

				const wrapper_width	= wrapper.getBoundingClientRect().width
				if (wrapper_width >= self.minimum_width_px) {
					// inline way
					self.change_mode({
						mode	: 'edit',
						view	: 'line'
					})
				}else{
					// modal way
					ui.render_edit_modal({
						self		: self,
						e			: e,
						callback	: (dd_modal) => {
							dd_modal.modal_content.style.width = '25rem'
							dd_modal.modal_content.style.top = (e.clientY - 25) + 'px'
						}
					})
				}
			})
		}

		const fallback_length = fallback.length
		for (let i = 0; i < fallback_length; i++) {

			const value_string = fallback[i] + transliterate_value

			const content_value = ui.create_dom_element({
				element_type	: 'span',
				inner_html		: value_string,
				parent			: wrapper
			})

			// component_dataframe
				if(self.properties.has_dataframe) {

					content_value.classList.add('has_dataframe')

					const component_dataframe = await get_dataframe({
						self			: self,
						section_id		: self.section_id,
						section_tipo	: self.section_tipo,
						// tipo_key		: self.tipo,
						section_id_key	: i
					})
					if(component_dataframe) {
						// add dataframe to existing component instances
						self.ar_instances.push(component_dataframe)
						// render dataframe
						component_dataframe.render()
						.then(function(dataframe_node){
							content_value.appendChild(dataframe_node)
						})
					}
				}

			// separator
				if( i < value.length -1 ) {
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
