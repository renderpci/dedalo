// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_ar_raw_data_value} from './render_edit_component_date.js'



/**
* VIEW_MINI_DATE
* Manage the components logic and appearance in client side
*/
export const view_mini_date = function() {

	return true
}//end view_mini_date



/**
* RENDER
* Render node to be used in current view
* @return HTMLElement wrapper
*/
view_mini_date.render = async function(self, options) {

	// Value as string
		const ar_value		= get_ar_raw_data_value(self)
		const value_string	= ar_value.join(self.context.fields_separator)

	// wrapper
		const wrapper = ui.component.build_wrapper_mini(self, {
			value_string : value_string
		})

	return wrapper
}//end render



// @license-end
