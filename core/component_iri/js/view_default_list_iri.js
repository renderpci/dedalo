// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_DEFAULT_LIST_IRI
* Manage the components logic and appearance in client side
*/
export const view_default_list_iri = function() {

	return true
}//end view_default_list_iri



/**
* RENDER
* Render node for use in this view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_iri.render = async function(self, options) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// Value as string
		const ar_value_string	= [];
		const value_length		= value.length
		for (let i = 0; i < value_length; i++) {

			const ar_line = []

			if (value[i].title) {
				ar_line.push(value[i].title)
			}
			if (value[i].iri) {
				ar_line.push(value[i].iri)
			}

			if (ar_line.length>0) {
				ar_value_string.push(ar_line.join(' | '))
			}
		}
		const value_string = (ar_value_string && ar_value_string.length)
			? ar_value_string.join('<br>')
			: null

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})
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
						dd_modal.modal_content.style.width = '40rem'
						dd_modal.modal_content.style.top = (e.clientY - 25) + 'px'
					}
				})
			}
		})


	return wrapper
}//end render



// @license-end
