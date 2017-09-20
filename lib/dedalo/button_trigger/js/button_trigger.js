/**
* BUTTON_TRIGGER CLASS
*
*
*
*/
var button_trigger = new function() {	


	this.executing = false;


	/**
	* TRIGGER
	*
	*/
	this.trigger = function (button_obj) {

		if (button_trigger.button_trigger === true) {
			console.log("[button_trigger.trigger] Please wait process finish");
			return false;
		}
		
		var tipo		= button_obj.dataset.tipo
		var	propiedades = JSON.parse( button_obj.dataset.propiedades )		
			propiedades.section_tipo = page_globals.section_tipo

		// Check trigger_url
		if (typeof propiedades.trigger_url == "undefined") {
			return alert("[button_trigger.trigger] Error Wrong url data [propiedades]")
		}else{
			var trigger_url = DEDALO_LIB_BASE_URL + propiedades.trigger_url;
		}

		// Check trigger mode
		if (typeof propiedades.mode == "undefined") {
			return alert("[button_trigger.trigger] Error Wrong mode data [propiedades]")
		}
		
		var target_div = document.getElementById('button_trigger_'+tipo);
			if (!target_div) {
				return alert("[button_trigger.trigger] Error target_div not found!");
			}	

		// Spinner ON		
		target_div.innerHTML 	 = ''
		target_div.style.display = 'block'
		target_div.classList.add("button_trigger_response_loading")
		html_page.loading_content( target_div, 1 )

		// Set active
		button_trigger.button_trigger = true;
		

		// Assign trigger vars from propiedades
		var trigger_vars = cloneDeep(propiedades)
			console.log("[button_trigger.trigger] trigger_vars", trigger_vars);

		// PROMISE JSON XMLHttpRequest
		var js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {
				console.log("[component_state.update_state_locator] response.debug", response, trigger_url);
				console.trace();
			}

			if (response && response.result) {
				var msg = response.msg
			}else{
				// Notify to log messages in top of page
				var msg = "<span class='error'>[button_trigger.trigger] ERROR. Null response</span>";
			}

			// msg show
			target_div.innerHTML  	= msg
			target_div.classList.remove("button_trigger_response_loading");
			target_div.style.cursor = 'pointer'
			target_div.addEventListener("dblclick", function(){
				this.innerHTML 	   = ''
				this.style.display = 'none'
			}, false);

			// Spinner OFF
			html_page.loading_content( target_div, 0 );
			button_trigger.button_trigger = false;
		}, function(error) {
			// log
			console.log("[component_state.update_state_locator] Error.", error);
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " update_state_locator</span>" + error );
			
			// Spinner OFF
			html_page.loading_content( target_div, 0 );
			button_trigger.button_trigger = false;
		})


		return js_promise
	}//end this.trigger



};//end button_trigger