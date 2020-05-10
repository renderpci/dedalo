


/**
* GET_ARCHIVE_WEIGHTS
*/
var get_archive_weights = new function() {


	/**
	* ACTIVATE_LISTENER_VALUE
	*/
	this.activate_listener_value = function(component_target_tipo) {
			
		$(function() {
			var reference_input	= document.querySelector('.css_wrap_portal[data-tipo="' + component_target_tipo + '"] > .content_data') // > .content_data .table_portal_rows_list
			//  console.log(reference_input);
			if (reference_input) {	

				// Remove listener to avoid duplicates
				reference_input.removeEventListener('change', get_archive_weights.update_state)				
				
				// Add listner change
				reference_input.addEventListener("change", get_archive_weights.update_state, false);				
			}
		});	
	};//end activate_listener_value



	/**
	* UPDATE_STATE
	*/
	this.update_state = function(e) {
		
		// Select current widget element
		var get_archive_weights = document.getElementById('get_archive_weights')
		
		// Update info (reload component info)
		var js_promise = component_info.update_info(get_archive_weights)
			//js_promise.then(function() { })
	};//end update_state
	
	

		

}//end get_archive_weights


