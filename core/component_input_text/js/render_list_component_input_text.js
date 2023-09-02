// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_input_text} from './view_default_list_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_ip_list_input_text} from './view_ip_list_input_text.js'



/**
* RENDER_LIST_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_list_component_input_text = function() {

	return true
}//end render_list_component_input_text



/**
* LIST
* Render component node to use in list
* @param object options
* @return HTMLElement wrapper
*/
render_list_component_input_text.prototype.list = async function(options) {

	const self = this

	// self.context.fields_separator
		if (!self.context.fields_separator) {
			self.context.fields_separator = ', '
		}

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'text':
			return view_text_input_text.render(self, options)

		case 'mini':
			return view_mini_input_text.render(self, options)

		case 'ip':
			return view_ip_list_input_text.render(self, options)

		case 'default':
		default:
			return view_default_list_input_text.render(self, options)
	}
}//end list



// @license-end
