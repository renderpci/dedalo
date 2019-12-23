


/**
* WIDGET_SUM_DATES
*/
var widget_sum_dates = new function() {


	/**
	* ACTIVATE_LISTENER_VALUE
	*/
	this.activate_listener_value = function(component_target_tipo) {
			
		$(function() {
			var reference_input	= document.querySelector('.css_wrap_portal[data-tipo="' + component_target_tipo + '"] > .content_data') // > .content_data .table_portal_rows_list
			//  console.log(reference_input);
			if (reference_input) {	

				// Remove listener to avoid duplicates
				reference_input.removeEventListener('change', widget_sum_dates.update_state)				
				
				// Add listner change
				reference_input.addEventListener("change", widget_sum_dates.update_state, false);				
			}
		});	
	};//end activate_listener_value



	/**
	* UPDATE_STATE
	*/
	this.update_state = function(e) {
		
		// Select current widget element
		var widget_sum_dates = document.getElementById('widget_sum_dates')
		
		// Update info (reload component info)
		var js_promise = component_info.update_info(widget_sum_dates)
			//js_promise.then(function() { })
	};//end update_state
	
	

		

}//end widget_sum_dates


