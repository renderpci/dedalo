





var component_security_administrator = new function() {

	this.save_arguments = {}
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		//console.log( $(component_obj) ) ; 
		//console.log( $(component_obj).prop('checked') ) ; 
		//return false;

		// Exec general save
		component_common.Save(component_obj, this.save_arguments);
	};


}//end component_security_administrator



