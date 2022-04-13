/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
	// import {render_tree_data} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_AREA
* Manages the area apperance in client side
*/
export const render_area = function() {

	return true
};//end render_area



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_area.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const current_content_data = get_content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// buttons
		//const current_buttons = await buttons(self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.area.build_wrapper_edit(self, {
			content_data : current_content_data
			//buttons 	 : current_buttons
		})


	return wrapper
};//end edit



/**
* LIST
* Alias of edit
* @return DOM node
*/
render_area.prototype.list = async function(options={render_level:'full'}) {

	return this.edit(options)
};//end list



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const fragment = new DocumentFragment()


	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
			  content_data.appendChild(fragment)


	return content_data
};//end content_data


