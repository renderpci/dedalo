





var component_radio_button = new function() {

	this.radio_button_objects = {}
	this.save_arguments = {} // End save_arguments


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		if (page_globals.modo=='edit' || page_globals.modo=='tool_time_machine') {
			// Exec general save
			component_common.Save(component_obj, this.save_arguments);
		}		
	};



	

}//end component_radio_button

