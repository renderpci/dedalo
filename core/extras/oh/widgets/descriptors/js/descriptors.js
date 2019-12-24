/**
* DESCRIPTORS
*
*
*
*/
var descriptors = new function() {



	this.trigger_url = DEDALO_CORE_URL + '/extras/oh/widgets/descriptors/trigger.descriptors.php';



	/**
	* LOAD_TERMS
	* @return promise
	*/
	this.load_terms = function(button_obj) {

		const response_div = button_obj.parentNode //.querySelector('.descriptors_container')
			  response_div.innerHTML = '<div class="descriptors_button">Loading..</div>'

		const trigger_url  = descriptors.trigger_url
		const trigger_vars = {
			mode 		 			 : 'load_terms',
			component_tipo 			 : button_obj.dataset.component_tipo,
			section_tipo 			 : button_obj.dataset.section_tipo,
			section_id 	 			 : button_obj.dataset.section_id,
			component_portal_tipo 	 : button_obj.dataset.component_portal_tipo,
			component_text_area_tipo : button_obj.dataset.component_text_area_tipo,
		}; //return  console.log(trigger_vars);
		
		const jsPromise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[descriptors.load_terms] response",response);
				}
				
				response_div.innerHTML = response.result

				// Hide button
				button_obj.remove()

				// Open list action exec
				//var tab_title = response_div.querySelector('.tab_title')
				//if (tab_title) {
				//	tab_title.click()
				//}

			})


		return jsPromise
	};//end load_terms



	/**
	* TOGGLE_TAB_CONTENT
	* @return 
	*/
	this.toggle_tab_content = function(button) {
		
		const tab_content = button.parentNode.querySelector(".tab_content")

		$(tab_content).toggle()

		return true
	};//end toggle_tab_content



}//end descriptors