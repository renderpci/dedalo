"use strict";
/**
* component_check_box
*
*
*/
var component_check_box = new function() {

	this.save_arguments = {} // End save_arguments
	this.input_obj  = null
	

	/**
	* GET_DATO
	* update 13-01-2018
	*/
	this.get_dato = function(wrapper_obj) {
	
		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_check_box:get_dato] Error. Invalid wrapper_obj");
			return false
		}
		
		let dato = []
		
		const input_elements  = wrapper_obj.getElementsByTagName("input")
		const len 		  	  = input_elements.length
		for(let i=0; i < len; ++i) {
			if(input_elements[i].checked) {
				//dato.push( JSON.parse(input_elements[i].value) )
				let element = input_elements[i]
				if(element.value.length>1) {
					let locator = null;
					try {
					  locator = JSON.parse(element.value)
					} catch (e) {
					  console.log(e.message); // "missing ; before statement"
					  //return alert(e.message) 
					}
					if(locator)	dato.push( locator )
				}
			}
		}
		return dato;
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
			console.error("Invalid dato for search (must be an array):", dato)
		}else{
			search_value = JSON.stringify(dato_parsed)
		}
		
		//let search_value = JSON.stringify(dato_parsed)
		//console.log("[component_check_box.get_search_value_from_dato] search_value:",search_value,dato);

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}
		
		// Fix/Set current input_obj
		self.input_obj = component_obj

		let dato = self.get_dato(wrap_div)
			console.log("[checkbox] dato",dato);	

		// Set save_arguments.dato (stringify)
		self.save_arguments.dato = dato
		
		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments)

			//console.log("js_promise:",js_promise);
		return js_promise
	};//end Save



}//end component_check_box