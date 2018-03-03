"use strict";
/**
* COMPONENT_RADIO_BUTTON
*
*
*/
var component_radio_button = new function() {

	this.radio_button_objects 	= {}
	this.save_arguments 		= {}



	/**
	* GET_DATO
	* update 13-01-2018
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = []

		// ul list of inputs
		let	li_nodes = wrapper_obj.getElementsByTagName('li') //wrapper_obj.querySelector('ul.radio_button_ul_list')
	
		// li elements
		//let li_nodes = parent_ul.childNodes

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let current_radio_button 		 = li_nodes[i].getElementsByTagName('input')[0]
			let current_radio_button_checked = current_radio_button.checked
			if(current_radio_button_checked===true){
				dato.push( JSON.parse(current_radio_button.value) )
			}
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

		if (dato_parsed===null) {
			// Empty dato. Nothig to do
		}else if (!Array.isArray(dato_parsed)) {
			console.error("Invalid dato for search (must be an array):", dato);
		}else{
			for (var i = 0; i < dato_parsed.length; i++) {
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

		var self = this		
		
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_radio_button:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato

		// Exec general save
		var js_promise = component_common.Save(component_obj, self.save_arguments);

			js_promise.then(function(response) {

					// mandatory test
					self.mandatory(wrap_div.id)

				}, function(xhrObj) {
				  	console.log(xhrObj);
				});

		return js_promise
	};	



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) when content is empty
	*/
	this.mandatory = function(id_wrapper) {

		var wrapper = document.getElementById(id_wrapper)
			if (wrapper===null) {
				console.log("Error on select wrapper for id: "+id_wrapper);	
				return false;
			}

		var radio_button_ul_list = wrapper.querySelector('ul.radio_button_ul_list')
		var ar_input_obj 	  	 = wrapper.querySelectorAll('input.css_radio_button')

		if (this.is_empty_value(ar_input_obj)===true) {
			radio_button_ul_list.classList.add('mandatory')
		}else{
			radio_button_ul_list.classList.remove('mandatory')
		}			
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(ar_input_obj) {
	
		var len = ar_input_obj.length
		for (var i = len - 1; i >= 0; i--) {
			if (ar_input_obj[i].checked===true) {
				return false
			}
		}

		return true;
	};//end is_empty_value




}//end class