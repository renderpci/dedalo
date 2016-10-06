





var component_relation_model = new function() {


	this.save_arguments = {} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		this.save_arguments.dato = this.get_dato(component_obj)

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);
	};



	/**
	* GET_DATO
	* The component value is a locator json encoded like {"type":"dd47","section_id":"2","section_tipo":"test2"}
	* @return string dato
	*/
	this.get_dato = function(component_obj) {
		
		var dato = component_obj.value
			//console.log(dato);

		return dato
	};//end get_dato






}//end component_relation_model
