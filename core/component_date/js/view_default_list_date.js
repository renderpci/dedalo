// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_ar_raw_data_value} from './render_edit_component_date.js'



/**
* VIEW_DEFAULT_LIST_DATE
* Manage the components logic and appearance in client side
*/
export const view_default_list_date = function() {

	return true
}//end view_default_list_date



/**
* RENDER
* Render node for use in list
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_date.render = async function(self, options) {

	// short vars
		// const data			= self.data || {}
		// const value			= data.value || ''
		// const value_string	= value

	const ar_value		= get_ar_raw_data_value(self)
	const value_string	= ar_value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
		if (self.show_interface.read_only!==true) {
			wrapper.addEventListener('click', function(e){
				e.stopPropagation()

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


	return wrapper
}//end render



// @license-end
