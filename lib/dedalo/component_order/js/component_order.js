





var component_order = new function() {


	this.save_arguments = {}
	this.trigger_url 	= DEDALO_LIB_BASE_URL + '/component_order/trigger.component_order.php';
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments = this.get_dato(component_obj);

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

			jsPromise.then(function(response) {
			  	// Update possible dato in list (in portal x example)
				//component_common.propagate_changes_to_span_dato(component_obj);
			}, function(xhrObj) {
			  	console.log(xhrObj);
			});
	};//end Save



	/**
	* GET_DATO
	* @return string dato
	*/
	this.get_dato = function(component_obj) {

		var dato = component_obj.value

		return dato
	};//end get_dato



	

}//end component_order