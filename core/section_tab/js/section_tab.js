/**
* SECTION_TABS
*
*
*
*/
var section_tabs = new function() {

	'use strict';



	/**
	* SET_TAB_ACTIVE
	* Save in local storage the id of current section_tab active (on click action)
	*/
	this.set_tab_active = function( button_object ) {

		// Save selected section_tab
			set_localStorage('section_tab_active', button_object.id)

		const section_tab_tipo 	  = button_object.dataset.tipo
		const section_tab_wrapper = button_object.parentNode		
		
		// section_tab_active. reset
			const section_tab_active = section_tab_wrapper.querySelector('span.section_tab_active')			
			section_tab_active.classList.remove("section_tab_active")

		// button activate
			button_object.classList.add("section_tab_active");

		// section_tabs_containers
			const tab_wrapper_nodes 	  = section_tab_wrapper.childNodes
			const tab_wrapper_nodes_len   = tab_wrapper_nodes.length
			const section_tabs_containers = []
			for (let i = 0; i < tab_wrapper_nodes_len; i++) {
				const node = tab_wrapper_nodes[i]
				if (node.classList.contains("section_tab_content")) {
					section_tabs_containers.push(node)
				}
			}
		
			const section_tabs_containers_len 	= section_tabs_containers.length
			const section_tab_active_id 		= 'section_tab_content_' + section_tab_tipo; // section_tab_active current
			for (let i = 0; i < section_tabs_containers_len; i++) {

				const container = section_tabs_containers[i]
			
				if(container.id===section_tab_active_id ){
					//container.style.display = 'table';
					container.classList.add("tab_content_active");
				}else{
					//container.style.display = 'none';
					if (container.classList.contains("tab_content_active")) {
						container.classList.remove("tab_content_active");
					}					
				}
			}		

		return true
	}//end set_tab_active



	/**
	* SELECT_TAB_ACTIVE
	* Recover last section_tab active from local storage and set as checked to activate
	* and show the section tab conten
	* Called on component html is rendered in edit mode
	*/
	this.select_tab_active = function() {
		
		const self = this

		const cookie_tab_active = get_localStorage('section_tab_active');		
		if (cookie_tab_active) {
			// Previously set on cookie
			const tab_active_element = document.getElementById(cookie_tab_active)
			if (tab_active_element)
				self.set_tab_active(tab_active_element)
				
		}else{
			// Fallback. Selects first tab input element and set as checked
			const tab_active_element = document.querySelector('span.section_tab_label')
				  tab_active_element.classList.add("section_tab_active");
				  set_localStorage('section_tab_active', tab_active_element.id)
				  self.set_tab_active(tab_active_element)
		}		
	}//end select_tab_active



}//end class