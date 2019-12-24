/**
* TOOL_IMPORT_KML CLASS
*
*
*
*/ 
var tool_import_kml = new function() {

	// Tool triger
	this.url_trigger = DEDALO_CORE_URL + '/tools/tool_import_kml/trigger.tool_import_kml.php'
	// section tipo of current tool
	this.section_tipo
	

	/**
	* UPLOAD_COMPLETE
	* @param e event
	*/
	this.upload_complete = function(e) {		

		var button_import = document.getElementById("button_import")
			button_import.classList.add("vissible")
			button_import.addEventListener("click", function (event) {
				tool_import_kml.process_file(event)
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
	
		var trigger_vars = {
				mode 				: 'process_file',
				target_file_path  	: dedalo_upload.target_file_path,
				target_file_name 	: dedalo_upload.target_file_name,
				section_tipo 		: tool_import_kml.section_tipo,
				button_import_tipo  : tool_import_kml.button_import_tipo,
			}
			

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_import_kml.process_file] process_file",response)
				}

				if (response && response.msg!==null) {
					response_div.innerHTML = response.msg
				}else{
					response_div.innerHTML = "Error on process file response. Try again"
				}
		})

		return js_promise
	};//end process_file


	
}//end class tool_import_kml