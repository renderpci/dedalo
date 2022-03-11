/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	// import {get_ar_instances} from '../../../core/section/js/section.js'
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TIME_MACHINE_LIST
* Manages the component's logic and apperance in client side
*/
export const render_time_machine_list = function() {

	return true
};//end render_time_machine_list



/**
* EDIT
* Render node for use in edit mode
* @return DOM node
*/
render_time_machine_list.prototype.edit = async function (options) {

	const self = this

	// options
		const render_level 	= options.render_level || 'full'

	// content_data
		const current_content_data = await get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			//class_name	: self.model + ' ' + self.tipo + ' ' + self.mode
			class_name		: 'wrapper_' + self.type + ' ' + self.model + ' ' + self.tipo + ' ' + self.mode
		})
		wrapper.appendChild(current_content_data)

	return wrapper
};//end render_time_machine_list



/**
* GET_CONTENT_DATA
* Rendered by time_machine using callback function from render_time_machine_list view)
* @return DOM node content_data
*/
const get_content_data = async function(self) {

	// content_data. Call time machine service render callback
		const content_data	= await self.time_machine.render()


	return content_data
};//end get_content_data


