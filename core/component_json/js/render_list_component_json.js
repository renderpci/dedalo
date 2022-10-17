/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {view_default_list_json} from './view_default_list_json.js'
	import {view_mini_json} from './view_mini_json.js'


/**
* RENDER_LIST_COMPONENT_json
* Manage the components logic and appearance in client side
*/
export const render_list_component_json = function() {

	return true
}//end render_list_component_json



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_list_component_json.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_json.render(self, options)


		case 'default':
		default:
			return view_default_list_json.render(self, options)
	}

	return null
}//end list
