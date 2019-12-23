"use strict";
/**
* TOOL_UPDATE_CACHE
*
*
*/
var tool_update_cache = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_update_cache/trigger.tool_update_cache.php' ;


	/**
	* UPDATE_CACHE
	* @param {object} button_obj
	* @param {object} options
	*/
	this.update_cache = function(button_obj, options) {

		if (!confirm("This operation can take very long time with large databases. Are you sure?")) return false

		button_obj.classList.add('button_update_cache_loading')
		button_obj.innerHTML = " <span class=\"blink\">Updating cache. Please wait</span>"

		//$(button_obj).addClass('button_update_cache_loading')
		//$(button_obj).html(" Updating cache. Please wait ");

		const trigger_vars = {
				mode  		  : 'update_cache',
				section_tipo  : options.section_tipo,
				section_tipo  : page_globals.top_tipo,
			}
			//return console.log("[tool_update_cache.update_cache] trigger_vars",trigger_vars);

		// Return a promise of XMLHttpRequest
		let js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_update_cache.update_cache]",response);
				}

				// Clean response_div
				button_obj.innerHTML = 'Update cache finished. Reload in 3 secs'

				if (response && response.result===true) {
					var ttime = response.debug ? response.debug.exec_time : ''
					document.getElementById('log_messages').innerHTML = "<div class=\"ok\">Ok. update_cache done ["+ttime+"]</div>"
					// Reloads window	
					setTimeout(function(){
						window.location = window.location //+"&cache_updated=1"
					}, 3000)
				}else{
					document.getElementById('log_messages').innerHTML = "<div class=\"error\">Error. update_cache failed. "+response.msg+"</div>"
				}				
		})


		return js_promise
	}//end update_cache



}