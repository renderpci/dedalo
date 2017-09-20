"use strict";
/**
* COMPONENT_CHECK_BOX
*
*
*/
var component_check_box = new function() {

	this.save_arguments = {} // End save_arguments
	this.input_obj  = null
	

	/**
	* SAVE
	*/
	this.Save = function(input_obj) {
		
		// Fix/Set current input_obj
		this.input_obj = input_obj;

		// Get dato specific
		let dato = this.get_dato(input_obj)
			//console.log("dato",dato); return;	

		// Set save_arguments.dato (stringify)
		this.save_arguments.dato = JSON.stringify(dato)
		
		// Exec general save
		component_common.Save(input_obj, this.save_arguments)
	};



	/**
	* GET_DATO
	*/
	this.get_dato = function(input_obj) {

		let wrap = component_common.get_wrapper_from_element(input_obj)
		
		let ar_checked_values 	= []; 
		//let name 		  		= input_obj.getAttribute("name");	
		let input_elements 		= wrap.getElementsByTagName("input");
		let len 		  		= input_elements.length
		for(var i=0; i < len; ++i) {
			if(input_elements[i].checked) {
				ar_checked_values.push( JSON.parse(input_elements[i].value) )
			}
		}

		return ar_checked_values;
	};//end get_dato



}//end component_check_box