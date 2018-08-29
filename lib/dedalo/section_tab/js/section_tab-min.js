





var section_tabs = new function() {

	/**
	* SET_TAB_ACTIVE
	* Save in local storage the id of current section_tab active (on click action)
	*/
	this.set_tab_active = function( button_object ) {

		set_localStorage('section_tab_active', button_object.id)

		const section_tab_tipo = button_object.dataset.tipo
		const section_tab_wrapper = button_object.parentNode

		const section_tabs_containers 	= section_tab_wrapper.getElementsByClassName('section_tab_content')
		const section_tab_active 		= section_tab_wrapper.querySelector('span.section_tab_active')

		section_tab_active.classList.remove("section_tab_active")

		const section_tab_active_id 	= 'section_tab_content_'+section_tab_tipo

		const len = section_tabs_containers.length	

		button_object.classList.add("section_tab_active");

		for (var i = len - 1; i >= 0; i--) {
			if(section_tabs_containers[i].id === section_tab_active_id ){
				section_tabs_containers[i].style.display = 'table';
				
			}else{
				section_tabs_containers[i].style.display = 'none';				
			}
		}		

	};//end set_tab_active



	/**
	* SELECT_TAB_ACTIVE
	* Recover last section_tab active from local storage and set as checked to activate
	* and show the section tab conten
	* Called on component html is rendered in edit mode
	*/
	this.select_tab_active = function() {
		let self = this

		var cookie_tab_active = get_localStorage('section_tab_active');
		if (cookie_tab_active) {
			// Previously set on cookie
			var tab_active_element = document.getElementById(cookie_tab_active)
			if (tab_active_element)
				self.set_tab_active(tab_active_element)
				
		}else{
			// Fallback. Selects first tab input element and set as checked
			var tab_active_element = document.querySelector('span.section_tab_label')
				tab_active_element.classList.add("section_tab_active");
		}		
	};//end select_tab_active


}//end class

