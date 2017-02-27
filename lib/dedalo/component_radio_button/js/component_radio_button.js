





var component_radio_button = new function() {

	this.radio_button_objects 	= {}
	this.save_arguments 		= {}


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Get dato specific
		this.save_arguments.dato = this.get_dato(component_obj);

		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {

				// mandatory test
				component_radio_button.mandatory(wrap_div.id)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});
	};



	/**
	* GET_DATO
	* @return string dato
	*/
	this.get_dato = function(component_obj) {

		var dato = component_obj.value

		return dato
	};//end get_dato



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




}//end component_radio_button