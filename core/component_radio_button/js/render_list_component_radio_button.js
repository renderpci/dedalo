// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_mini_list_radio_button} from './view_mini_list_radio_button.js'
	import {view_default_list_radio_button} from './view_default_list_radio_button.js'
	import {view_text_list_radio_button} from './view_text_list_radio_button.js'



/**
* RENDER_LIST_COMPONENT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const render_list_component_radio_button = function() {

	return true
}//end render_list_component_radio_button



/**
* LIST
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
*/
render_list_component_radio_button.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_list_radio_button.render(self, options)

		case 'text':
			return view_text_list_radio_button.render(self, options)

		case 'default':
		default:
			return view_default_list_radio_button.render(self, options)
	}
}//end list



// @license-end
