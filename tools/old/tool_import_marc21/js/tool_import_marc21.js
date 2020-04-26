/**
* TOOL_IMPORT_MARC21 CLASS
*
*
*
*/ 
var tool_import_marc21 = new function() {

	// Tool triger
	this.url_trigger = DEDALO_CORE_URL + '/tools/tool_import_marc21/trigger.tool_import_marc21.php'
	

	/**
	* UPLOAD_COMPLETE
	* @param e event
	*/
	this.upload_complete = function(e) {
	
		var button_import = document.getElementById("button_import")
			button_import.classList.add("vissible")
			button_import.addEventListener("click", function (event) {
				tool_import_marc21.process_file(event)
			});		
	};//end upload_complete



	/**
	* PROCESS_FILE
	* @param event event
	*/
	this.process_file = function(event) {

		var response_div = document.getElementById('response_div')

		// Clean response_div
		response_div.innerHTML = '<span class="blink"> Processing.. </span>';

		var projects_value = component_filter.get_filter_checked_values()			
			if (projects_value.length<1) {
				response_div.innerHTML = "<span class=\"error\"> Error. Please, select at least one project </span>"
				return
			}
			//console.log(projects_value); return
			
		var trigger_vars = {
				mode 				: 'process_file',
				target_file_path  	: dedalo_upload.target_file_path,
				target_file_name 	: dedalo_upload.target_file_name,
				projects_value 		: JSON.stringify(projects_value)
			}
			//return console.log(trigger_vars)


		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_marc21.process_file]",response);
				}

				if (response && response.msg!==null) {
					response_div.innerHTML = response.msg
				}else{
					response_div.innerHTML = "Error on process file response. Try again"
				}						
							
		})

		return js_promise
	};//end process_file


	
}//end class tool_import_marc21