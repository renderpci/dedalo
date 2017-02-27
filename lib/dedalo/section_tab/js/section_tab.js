





var section_tabs = new function() {

	/**
	* SET_TAB_ACTIVE
	* Save in local storage the id of current section_tab active (on click action)
	*/
	this.set_tab_active = function( button_object ) {
		set_localStorage('section_tab_active', button_object.id)		
	};//end set_tab_active



	/**
	* SELECT_TAB_ACTIVE
	* Recover last section_tab active from local storage and set as checked to activate
	* and show the section tab conten
	* Called on component html is rendered in edit mode
	*/
	this.select_tab_active = function() {
		var cookie_tab_active = get_localStorage('section_tab_active');
		if (cookie_tab_active) {
			// Previously set on cookie
			var tab_active_element = document.getElementById(cookie_tab_active)
			if (tab_active_element)
				tab_active_element.checked = true
		}else{
			// Fallback. Selects first tab input element and set as checked
			var tab_active_element = document.querySelector('.css_section_tab_content input[type="radio"]')
				tab_active_element.checked = true
		}		
	};//end select_tab_active


}//end class