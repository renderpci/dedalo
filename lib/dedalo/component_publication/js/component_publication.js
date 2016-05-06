





var component_publication = new function() {
	
	this.save_arguments = {}


	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
		
		// Exec general save
		component_common.Save(component_obj, this.save_arguments);

		this.update_color(component_obj)		
	};


	this.update_color = function(component_obj) {
		console.log(component_obj);
		var value 	  = component_obj.value,
			value_obj = JSON.parse(value)

		
	
		if (value_obj.section_id==1) {
			// yes
			component_obj.classList.add('publication_green')
		}else if (value_obj.section_id==1) {	
			// no
			component_obj.classList.add('publication_reed')
		}else{
			// undefined
		}

			console.log(value_obj);

	};
	
	

}//end component_publication

