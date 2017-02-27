





var tool_update_cache = new function() {

	
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_update_cache/trigger.tool_update_cache.php' ;


	/**
	* UPDATE_CACHE
	*
	*/
	this.update_cache = function(button_obj, options) {

		if (!confirm("This operation can take very long time with large databases. Are you sure?")) return false

		button_obj.classList.add('button_update_cache_loading')
		button_obj.innerHTML = " <span class=\"blink\">Updating cache. Please wait</span>"

		//$(button_obj).addClass('button_update_cache_loading')
		//$(button_obj).html(" Updating cache. Please wait ");		

		var trigger_vars = {
				mode  		  : 'update_cache',
				section_tipo  : options.section_tipo,
				section_tipo  : page_globals.top_tipo,
			}
			//return console.log(trigger_vars);

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) {
								console.log(response);
							}

							// Clean response_div
							button_obj.innerHTML='Finished. Reloading..'

							// Reloads window
							window.location = window.location+"&cache_updated=1"							
						})
		return js_promise
	}//end update_cache


};