// JavaScript Document





var component_input_text = new function() {

	
	this.input_text_objects = []
	this.save_arguments 	= {}

	
	/**
	* SAVE
	* @param object component_obj
	*/
	this.Save = function(component_obj) {

		// Get dato specific
		this.save_arguments.dato = this.get_dato(component_obj);
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

			jsPromise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);
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



	
	
		

}//end component_input_text