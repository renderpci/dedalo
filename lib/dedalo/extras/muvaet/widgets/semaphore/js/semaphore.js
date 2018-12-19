


/**
* WIDGET_SEMAPHORE
*/
var widget_semaphore = new function() {



	/**
	* ACTIVATE_LISTENER_VALUE
	*/
	this.activate_listener_value = function(component_target_tipo) {
			
		$(function() {
			var reference_input	= document.querySelector('select[data-tipo="' + component_target_tipo + '"]')
			// console.log(reference_input);
			if (reference_input) {	

				// Remove listener to avoid duplicates
				reference_input.removeEventListener('change', widget_semaphore.update_state)				
				
				// Add listner change
				reference_input.addEventListener("change", widget_semaphore.update_state, false);
			}
		});	
	};//end activate_listener_value



	/**
	* update_state
	*/
	this.update_state = function(e) {

		// Select current widget element
		var widget_semaphore = document.getElementById('widget_semaphore')
		
		// Update info (reload component info)
		var js_promise = component_info.update_info(widget_semaphore)
			//js_promise.then(function() { })
	};//end update_state
	
	

		

}//end widget_semaphore