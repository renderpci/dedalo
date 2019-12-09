/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'


/**
* RENDER_SECTION_GROUP
* Manage the components logic and appearance in client side
*/
export const render_section_group = function() {


}//end render_section_group



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_section_group.prototype.edit = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// events
		wrapper.addEventListener("click", (e) => {
			e.stopPropagation()

			if (e.target.matches('.label')) {
				e.target.nextSibling.classList.toggle('hide')
			}
		}, false)

	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data")


	return content_data
}//end content_data



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_section_group.prototype.list = render_section_group.prototype.edit


