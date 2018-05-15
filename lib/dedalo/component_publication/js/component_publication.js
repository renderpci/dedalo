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

	// Function name to call when save component data
	this.on_save


	/**
	* INIT
	* @return 
	*/
	this.init = function(config) {

		// Fix values
		this.id_wrapper = config.id_wrapper		
		this.on_save 	= config.on_save || null



	};//end init



	/**
	* GET_DATO
	* update 13-01-2018
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_iri:get_dato] Error. Invalid wrapper_obj");
			return false
		}
		
		let dato = []

		if (wrapper_obj.dataset.modo==="search") {
			// Case search mode
			// ul list of inputs
			let	li_nodes = wrapper_obj.getElementsByTagName('li') //wrapper_obj.querySelector('ul.radio_button_ul_list')
		
			const len = li_nodes.length
			for (let i = 0; i < len; i++) {
				let current_radio_button 		 = li_nodes[i].getElementsByTagName('input')[0]
				let current_radio_button_checked = current_radio_button.checked
				if(current_radio_button_checked===true){
					dato.push( JSON.parse(current_radio_button.value) )
				}
			}
		
		}else{

			let component_obj = wrapper_obj.getElementsByTagName("input")[0]
			// Edit mode (default)
			// Dato is defined in wrapper dataset (component is only a checbox without value, only for checked true/false comprobation)		
				let dato_string = (component_obj.checked===true) ? wrapper_obj.dataset.value_yes : wrapper_obj.dataset.value_no
				dato = JSON.parse(dato_string) // Override dato (parsed value is array)
		}		
	

		return dato
	};//end get_dato



	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		let search_value = ''
		let dato_parsed  = dato

		if (!Array.isArray(dato_parsed)) {
			//console("Invalid dato for search (must be an array):", dato);
		}else{
			for (let i = 0; i < dato_parsed.length; i++) {
				search_value += JSON.stringify(dato_parsed[i])
				break; // Only one value is expected
			}
		}

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		let wrapper_obj = component_common.get_wrapper_from_element(component_obj)
		this.save_arguments.dato = this.get_dato(wrapper_obj)

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



	/**
	* CHECK_RADIO
	* Used in search mode to reset radio values
	* @return bool true
	*/
	this.check_radio = function(input, event) {
		if (event.altKey===true) {
			input.checked = false
			// Fix dato as blank
			component_common.fix_dato(input,'component_publication')
		}

		return true
	};//end check_radio



}//end component_publication