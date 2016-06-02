





var component_check_box = new function() {

	this.save_arguments = {} // End save_arguments
	this.component_obj  = null
	

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
		
		// Set current component_obj
		this.component_obj = component_obj;

		// Get dato specific
		this.save_arguments.dato = this.get_dato();

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

	};



	/**
	* GET_DATO
	*/
	this.get_dato = function() {
		
		var checkedValues = []; 
		var name 		  = this.component_obj.getAttribute("name");		
		var inputElements = document.getElementsByName(name);
		for(var i=0; inputElements[i]; ++i){
		      if(inputElements[i].checked){
				var val = inputElements[i].value
				checkedValues.push( JSON.parse(val) )
		      }
		}			
		//console.log(checkedValues)

		// stringify final array, not only elements
		return JSON.stringify( checkedValues );
	};



}//end component_check_box