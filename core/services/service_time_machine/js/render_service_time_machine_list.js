/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {view_default_time_machine_list} from './view_default_time_machine_list.js'
	import {view_mini_time_machine_list} from './view_mini_time_machine_list.js'



/**
* RENDER_SERVICE_TIME_MACHINE_LIST
* Manages the component's logic and appearance in client side
*/
export const render_service_time_machine_list = function() {

	return true
}//end render_service_time_machine_list



/**
* LIST
* Render node for use in list
* @return DOM node|null wrapper
*/
render_service_time_machine_list.prototype.list = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_time_machine_list.render(self, options)

		case 'default':
		default:
			return view_default_time_machine_list.render(self, options)
	}

	return null
}//end list
