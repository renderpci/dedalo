// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {activate_edit_in_list} from '../../component_common/js/component_common.js'



/**
* VIEW_DEFAULT_LIST_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const view_default_list_radio_button = function() {

	return true
}//end view_default_list_radio_button



/**
* RENDER
* Render node for use in current mode
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_list_radio_button.render = async function(self, options) {

	// short vars
		const data			= self.data || {}
		const entries		= data.entries || []
		const value_string	= entries.join(' | ')

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			value_string : value_string
		})

	// click handler for edit mode activation
		wrapper.addEventListener('click', (e) => {
			e.stopPropagation()
			activate_edit_in_list(self, e)
		})


	return wrapper
}//end render



// @license-end
