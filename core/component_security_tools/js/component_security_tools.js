





var component_security_tools = new function() {


	this.save_arguments = {} // End save_arguments


	this.Save = function(component_obj) {

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);
	};


};//end component_security_tools
