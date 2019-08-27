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
render_section_group.prototype.edit = async function() {
	
	const self = this

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

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body',
			parent 			: wrapper
		})
		//console.log("wrapper:",wrapper);
		//console.trace()

	return wrapper
}//end edit



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_section_group.prototype.list = render_section_group.prototype.edit


