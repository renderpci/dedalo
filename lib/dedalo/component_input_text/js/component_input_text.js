// JavaScript Document





var component_input_text = new function() {

	
	this.input_text_objects = []
	this.save_arguments 	= {}

	
	/**
	* SAVE
	* @param object component_obj
	*/
	this.Save = function(component_obj) {
		
		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

		jsPromise.then(function(response) {
		  	// Update possible dato in list (in portal x example)
			component_common.propagate_changes_to_span_dato(component_obj);
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});		
	};
	
		

}//end component_input_text