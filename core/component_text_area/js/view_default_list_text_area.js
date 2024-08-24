// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_DEFAULT_LIST_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_default_list_text_area = function() {

	return true
}//end view_default_list_text_area



/**
* RENDER
* Render node for use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_text_area.render = async function(self, options) {

	// short vars
		const data				= self.data
		const value				= data.value || []
		const fallback_value	= data.fallback_value || []
		const fallback			= get_fallback_value(value, fallback_value)
		const value_string		= fallback.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			// value_string : value_string
		})
		if (self.show_interface.read_only!==true) {
			wrapper.addEventListener('click', function(e){
				e.stopPropagation()

				// modal way
					// lang. Use lang from data instead from context because the problem with component_text_area context lang
					const lang = self.data && self.data.lang
						? self.data.lang
						: self.lang
					// modal
					ui.render_edit_modal({
						self		: self,
						e			: e,
						lang		: lang, // to use in new instance
						callback	: (dd_modal) => {
							dd_modal.modal_content.style.width = '90%'

							dd_modal.on_close = () => {
								// force to preserve the editing language (can be different from the language in list mode)
								self.lang = lang
								// refresh whole component
								self.refresh({
									autoload : false
								})
							}
						}
					})
			})
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  wrapper.appendChild(content_data)
			  // set pointers
			  wrapper.content_data = content_data

	// value
		ui.create_dom_element({
			element_type	: 'span',
			inner_html		: value_string,
			parent			: content_data
		})


	return wrapper
}//end render



// @license-end
