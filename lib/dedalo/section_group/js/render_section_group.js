// imports
	//import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	//import {common} from '../../common/js/common.js'


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

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			id 				: self.id,
			class_name		: self.model + ' ' + self.tipo + ' ' + self.mode + ' sgc_edit'
		})

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			parent 			: wrapper,
			text_content 	: "Section group " + self.tipo
		})
		.addEventListener("click", (e) => {
			const body = e.target.parentNode.children[1]
			body.classList.toggle('hide');
		}, false)

	// body content_data
		wrapper.appendChild(current_content_data)


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("body","content_data")


	return content_data
}//end content_data



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_section_group.prototype.list = render_section_group.prototype.edit


