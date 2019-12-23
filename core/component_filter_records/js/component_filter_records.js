/**
* COMPONENT_FILTER_RECORDS
* Manages user access to only certain records
*
*
*/
var component_filter_records = new function() {


	this.save_arguments = {} // End save_arguments
	this.url_trigger    = DEDALO_LIB_BASE_URL + '/component_filter_records/trigger.component_filter_records.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init


	/**
	* GET_DATO
	* @return array dato
	*/
	this.get_dato = function( wrapper_obj ) {		

		// INPUTS . Select all inputs inside current wrapper
		let input_elements = wrapper_obj.querySelectorAll('input[data-role="component_filter_records_input"]')
	
		// DATO. Iterate each input and store their value in the array 'dato'
		let   dato = {}
		const len  = input_elements.length
		for (let i = 0; i < len; i++) {
			
			let element = input_elements[i]
			if(element.value.length>0) {

				// current_section_tipo
				let current_section_tipo = element.dataset.current_section_tipo

				// ar_value
				let ar_value = this.convert_value_to_ar_data(element.value) 
				
				// add
				dato[current_section_tipo] = ar_value
			}
		}
		if(SHOW_DEBUG===true) {
			console.log("dato:",dato)
		}

		return dato
	};//end get_dato



	/**
	* SAVE (Deprecated!)
	*/
	this.Save = function(component_obj) {

		let self = this

		// From component wrapper
		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_filter_records:Save: Sorry: wrap_div dom element not found")
			}

		let dato = self.get_dato(wrap_div)

		self.save_arguments.dato = dato

		// Configure component obj dataset to save in common way
		component_obj.dataset.tipo 			= wrap_div.dataset.tipo
		component_obj.dataset.section_tipo 	= wrap_div.dataset.section_tipo
		component_obj.dataset.parent 		= wrap_div.dataset.parent
		component_obj.dataset.lang 			= wrap_div.dataset.lang
		
		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments);

		js_promise.then(function(response) {
		  	// Action post save
		  	component_common.load_component_by_wrapper_id(wrap_div.id);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});


		return js_promise
	};//end Save



	/**
	* CONVERT_VALUE_TO_AR_DATA
	* @return 
	*/
	this.convert_value_to_ar_data = function(value) {
		
		var ar_parts = value.split(",");

		var ar_data = []
		var len = ar_parts.length; 	
				
		for (var i = 0; i < len; i++) {
			var current_value = parseInt(ar_parts[i])
			if (ar_data.indexOf(current_value)=== -1 && current_value>0) { // Avoid duplicates
				ar_data.push( current_value )
			}			
		}

		return ar_data
	};//end convert_value_to_ar_data
	


	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
		obj_wrap.classList.add("selected_wrap");		
		
		// If only one is present, we focus it on click wrapper
		var ar_input_text = obj_wrap.querySelectorAll('[data-role="component_filter_records_input"]')
			if (ar_input_text.length===1) {
				var input_text = ar_input_text[0]
				if(input_text) {
					input_text.focus();
				}
			}				
		
		return false;
	}//end select_component	



}//end component_filter_records