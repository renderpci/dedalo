





var component_number = new function() {

	
	this.save_arguments = {}
	


	this.Save = function(component_obj) {

		if (page_globals.modo == 'edit' || page_globals.modo == 'tool_lang') {

			// Exec general save
			component_common.Save(component_obj, this.save_arguments);

			// Update possible dato in list (in portal x example)
			component_common.propagate_changes_to_span_dato(component_obj);
		}
	};
	

}//end component_number






