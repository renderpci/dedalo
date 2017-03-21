/**
* COMPONENT_PUBLICATION
* Manages the component's logic and apperance in client side
*
*
*/
var component_publication = new function() {
	
	// Object vars
	this.save_arguments = {}

	// value_yes and value_no are set in component html
	this.value_yes
	this.value_no


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = (component_obj.checked===true) ? this.value_yes : this.value_no

		//console.log(this.save_arguments);
		this.save_arguments.show_spinner = false
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		//this.update_color(component_obj)		
	};


	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		alert("123")
		return false;
		obj_wrap.classList.add("selected_wrap");
	};



	/**
	* UPDATE_COLOR
	* Config DEDALO_PUBLICATION_ALERT to true (1) or false (0) to control this feature
	*//*
	this.update_color = function(component_obj, wrapper) {
	
		if (typeof page_globals.DEDALO_PUBLICATION_ALERT!="undefined" && page_globals.DEDALO_PUBLICATION_ALERT===1) {

			var value 	  = component_obj.value
			var	value_obj = JSON.parse(value)
			
			if (!wrapper) {
				var wrapper = component_common.get_wrapper_from_element(component_obj)
			}
			//var label = wrapper.querySelector('label.css_label')
			if (value_obj.section_id==="1") {
				// yes
				//wrapper.classList.add("publication_green")
				wrapper.classList.remove("publication_warning")
			}else if (value_obj.section_id==="2") {	
				// no
				//wrapper.classList.remove("publication_green")//.add("publication_red")
				wrapper.classList.add("publication_warning")
			}else{
				// undefined
			}
		}
		
		return false
	};*/



	/**
	* CHECK_PUBLICATION
	* @return 
	*//*
	this.check_publication = function(wrapper_id) {
		
		var wrapper 	  = document.getElementById(wrapper_id)
		var radio_buttons = wrapper.querySelectorAll('input.css_component_publication')

		var len = radio_buttons.length
		for (var i = len - 1; i >= 0; i--) {
			if( radio_buttons[i].checked ) {
				component_publication.update_color(radio_buttons[i], wrapper)
			}
		}
	};//end check_publication
	*/


}//end component_publication