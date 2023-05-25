// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'



/**
* VIEW_MINI_LIST_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const view_mini_list_radio_button = function() {

	return true
}//end view_mini_list_radio_button



/**
* RENDER
* Render node to be used in current mode
* @return HTMLElement wrapper
*/
view_mini_list_radio_button.render = async function(self, options) {

	// Value as string
		const value_string = self.data.value

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})


	return wrapper
}//end render



// @license-end
