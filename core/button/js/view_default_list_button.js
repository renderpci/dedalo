// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'



/**
* VIEW_DEFAULT_LIST_BUTTON
* Manages the component's logic and appearance in client side
*/
export const view_default_list_button = function() {

	return true
}//end view_default_list_button



/**
* RENDER
* Render component node to use in list
* @return HTMLElement wrapper
*/
view_default_list_button.render = async function(self, options) {
console.log('self:', self);

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_component ${'wrapper_'+self.type} _${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} ${self.mode} ${self.view}`,
			inner_html		: self.label
		})



	return wrapper
}//end list


// @license-end
