


/**
* WIDGET_SUM
*/
var widget_sum = new function() {


	// LOCAL VARS
	this.url_trigger = DEDALO_CORE_URL + '/extras/muvaet/widgets/sum/trigger.sum.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(widget_id) {
		// Overwrites default behaviour of form submit button

		// From component wrapper
		var widget = document.getElementById(widget_id)
		var wrap_div = find_ancestor(widget, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(widget);
				return alert("widget_sum:init: Sorry: wrap_div dom element not found")
			}

		var update_info_button = wrap_div.querySelector('.update_info')
			update_info_button.setAttribute( "onClick", "widget_sum.reset(this)" )
	};//end init
	


	/**
	* ACTIVATE_LISTENER_VALUE
	*/
	this.activate_listener_value = function(component_target_tipo) {
				
		var reference_input	= document.querySelector('input[data-tipo="' + component_target_tipo + '"]')
		if (reference_input) {	

			// Remove listener to avoid duplicates
			reference_input.removeEventListener('change', this.add_sum_ev)				
			
			// Add listner change
			reference_input.addEventListener("change", this.add_sum_ev, false);
		}		
	};//end activate_listener_value



	/**
	* ADD_SUM_EV
	*/
	this.add_sum_ev = function(e) {

		// Select current widget element
		var widget_sum = document.getElementById('widget_sum')
		
		// Update info (reload component info)
		var js_promise = component_info.update_info(widget_sum)
			//js_promise.then(function() { })
	};//end add_sum_ev



	/**
	* RESET
	* @return 
	*/
	this.reset = function(section_tipo) {
		
		var trigger_vars = {
			mode 		 : 'reset_cache',
			section_tipo : section_tipo
		}

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
					console.log("widget_sum response",response);
			}

			widget_sum.add_sum_ev() // reloads component info
		})

	};//end reset
	
	

		

}//end widget_sum