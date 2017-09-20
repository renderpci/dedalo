"use strict";
/**
* COMPONENT_PUBLICATION
* Manages the component's logic and apperance in client side
*
*/
var component_publication = new function() {

	// id_wrapper
	this.id_wrapper
	
	// Object vars
	this.save_arguments = {}

	// value_yes and value_no are set in component html
	this.value_yes
	this.value_no

	// Function name to call when save component data
	this.on_save


	/**
	* INIT
	* @return 
	*/
	this.init = function(config) {

		// Fix values
		this.id_wrapper = config.id_wrapper
		this.value_yes 	= config.value_yes
		this.value_no  	= config.value_no
		this.on_save 	= config.on_save || null
	};//end init



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = (component_obj.checked===true) ? this.value_yes : this.value_no

		//console.log(this.save_arguments);
		this.save_arguments.show_spinner = false
		
		// Exec general save
		component_common.Save(component_obj, this.save_arguments).then(function(e){
	
			if ( component_publication.on_save!==null ) {
				if(SHOW_DEBUG===true) {
					console.log("[component_publication.Save] on_save:", component_publication.on_save);
				}				
				//alert("component_publication.Save call_custom_function ");
				call_custom_function(component_publication.on_save, [e, component_obj.checked])
			}			
		});
		//this.update_color(component_obj)
	};//end Save



	/**
	* FORCE_CHANGE_TAG_STATE
	* @return 
	*/
	this.force_change_tag_state = function(event, checked) {

		// b Public - green -
		// a Normal (private)  - orange -
		let tag_state = (checked===true) ? 'b' : 'a'	

		// Emulate dom select element value
		const select_obj = {
			value : tag_state
		}
		if(SHOW_DEBUG===true) {
			//console.log("[component_publication.force_change_tag_state] select_obj",select_obj); return
		}		

		component_text_area.change_tag_state(select_obj)		
	};//end force_change_tag_state



	/**
	* SELECT_COMPONENT
	* Overwrite common method
	* @param object obj_wrap
	*/
	this.select_component = function(obj_wrap) {
		//obj_wrap.classList.add("selected_wrap");
		return false;		
	};//end select_component



}//end component_publication