// import
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_inspector
* Manages the component's logic and apperance in client side
*/
export const render_inspector = function() {

	return true
}//end render_inspector



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_inspector.prototype.edit = async function(options={
		render_level : 'full'
	}) {

		const render_level = options.render_level

	// content data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'wrapper_paginator full_width css_wrap_rows_paginator text_unselectable',
		})

	// add paginator_content
		wrapper.appendChild(current_content_data)

	// events
		add_wrapper_events(wrapper, self)


	const self = this

	return 
}//end edit


/**
* ADD_WRAPPER_EVENTS
* Attach element generic events to wrapper
*/
const add_wrapper_events = (wrapper, self) => {

	// mousedown
		wrapper.addEventListener("mousedown", function(e){
			e.stopPropagation()
			//e.preventDefault()
			// prevent buble event to container element
			return false
		})


	return true
}//end add_wrapper_events



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

}// end content_data