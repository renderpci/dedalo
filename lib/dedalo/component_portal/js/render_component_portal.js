// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {paginator} from '../../search/js/paginator.js'
	import {common} from '../../common/js/common.js'


/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_portal = function() {

	return true
}//end render_component_portal



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_portal.prototype.edit = async function(options={
		render_level : 'full'
	}) {

	const self = this

	const render_level = options.render_level

	// content_data
		const current_content_data = await content_data(self)
		if (render_level==='content') {
			return current_content_data
		}

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_edit(self, current_content_data)

	// add paginator
		const paginator = wrapper.querySelector(".paginator")
		self.paginator.render().then(paginator_wrapper =>{
			paginator.appendChild(paginator_wrapper)
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA
* @return DOM node content_data
*/
const content_data = async function(self) {

	const ar_section_record = await self.get_ar_instances()

	// content_data
		const content_data = document.createElement("div")

	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}

	return content_data
}//end content_data



/**
* LIST
* Render node for use in list
* @return DOM node wrapper
*/
render_component_portal.prototype.list = async function() {

	const self = this

	const ar_section_record = self.ar_instances


	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div',
			class_name		: self.model + '_list ' + self.tipo + ' breakdown'
		})


	// add all nodes
		const length = ar_section_record.length
		for (let i = 0; i < length; i++) {

			const child_item = await ar_section_record[i].render()

			content_data.appendChild(child_item)
		}


	return content_data
}//end list


