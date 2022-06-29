/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../common/js/ui.js'



/**
* RENDER_TOOLBAR
* Called from services to render generic toolbar
* @para object options
* @return DOM node fragment
*/
	// export const render_toolbar = function() {

	// 	const toolbar_container = ui.create_dom_element({
	// 		element_type	: 'div',
	// 		class_name		: 'toolbar'
	// 	})

	// 	return toolbar_container
	// }//end render_toolbar



/**
* RENDER_BUTTON
* @param object button_config
* 	Defined in render_edit function 'get_custom_buttons'
* @return DOM node button_node
*/
export const render_button = function(button_config) {

	// button_config
		const name				= button_config.name
		const image				= button_config.options.image
		const text				= button_config.options.text || ''
		const class_name		= button_config.options.class_name
			? ' ' + button_config.options.class_name
			: ''
		const tooltip			= button_config.options.tooltip
		const onclick			= button_config.options.onclick
		const manager_editor	= button_config.manager_editor

	// button_node
		const button_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'toolbar_button ' + name + class_name,
			inner_html 		: text
		})

	// icon svg
	 	if(text==='') {
	 		// button_icon
		 	ui.create_dom_element({
				element_type	: 'img',
				src				: image,
				parent			: button_node
			})
	 	}


	// events
		if(manager_editor!==true && typeof onclick==='function'){
			button_node.addEventListener("click", onclick)
		}


	return button_node
}//end render_button
