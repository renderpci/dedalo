/**
* DESCRIPTORS
*
*
*
*/
var descriptors = new function() {



	this.trigger_url = DEDALO_LIB_BASE_URL + '/extras/oh/widgets/descriptors/trigger.descriptors.php';



	/**
	* LOAD_TERMS
	* @return promise
	*/
	this.load_terms = function(button_obj) {

		var response_div = button_obj.parentNode //.querySelector('.descriptors_container')
			response_div.innerHTML = '<div class="descriptors_button">Loading..</div>'
			

		var trigger_vars = {
			mode 		 			 : 'load_terms',
			component_tipo 			 : button_obj.dataset.component_tipo,
			section_tipo 			 : button_obj.dataset.section_tipo,
			section_id 	 			 : button_obj.dataset.section_id,
			component_portal_tipo 	 : button_obj.dataset.component_portal_tipo,
			component_text_area_tipo : button_obj.dataset.component_text_area_tipo,
		}
		//return  console.log(trigger_vars);
		
		var jsPromise = common.get_json_data(descriptors.trigger_url, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log(response.result);
				}
				
				response_div.innerHTML = response.result

				// Hide button
				button_obj.remove()

				// Open list action exec
				var tab_title = response_div.querySelector('.tab_title')
				if (tab_title) {
					tab_title.click()
				}				
			})

	return jsPromise
	};//end load_terms


	
}//end descriptors