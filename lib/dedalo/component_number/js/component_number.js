





var component_number = new function() {



	this.save_arguments = {}



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		if(page_globals.modo!=='edit') return false;

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

			jsPromise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});		
	};


	

}//end component_number