// JavaScript Document



var component_input_text_multi = new function() {

	
	this.input_text_objects = []
	this.save_arguments 	= {}
	

	/**
	* SAVE
	* @param object component_obj
	* Added small delay in save to allow edit more than one element befor save
	*/
	var saving_now=false;
	this.Save = function(component_obj, event) {
		
		if (saving_now===false) {

			saving_now=true;

			// Save delay
			var delay_ms = 1500;
			setTimeout(function(){
		
				// Get dato
				component_input_text_multi.dato = component_input_text_multi.get_dato(component_obj)
					console.log(component_input_text_multi.dato);
					
				// Exec general save
				var jsPromise = component_common.Save(component_obj, component_input_text_multi.save_arguments)
					jsPromise.then(function(response) {
					  	saving_now=false;
					}, function(xhrObj) {
					  	console.log(xhrObj);
					});

			},delay_ms);//end timeOut
		}				
	};


	/**
	* GET_DATO
	*/
	this.get_dato = function(component_obj) {

		var content_data = component_obj.parentNode;
			//console.log(parent.children);
		var input_list 	 = content_data.querySelectorAll( 'input[type=text]' );
			//console.log(input_list);

		var dato = {};
		for (var i = 0; i < input_list.length; i++) {
			var child = input_list[i]
				//console.log(child);
			var name 	= child.name,
				value 	= child.value,
				format 	= child.dataset.format

			switch(format) {
				case 'int':
					dato[name] = parseInt(value) || 0;
					break;
				default:
					dato[name] = value
			}			
		}

		return dato;
	}

			

}//end component_input_text_multi