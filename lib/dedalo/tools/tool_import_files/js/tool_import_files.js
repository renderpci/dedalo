
// TOOL_IMPORT_FILES CLASS
var tool_import_files = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_import_files/trigger.tool_import_files.php?top_tipo='+page_globals.top_tipo ;


	/**
	* IMPORT_FILES
	* On click button 'ok' exec trigger call by ajax to process uploaded files
	* @param dom object button_obj
	* @reuturl promise jsPromise
	*/
	this.import_files = function(button_obj) {		

		var mydata = {
			'mode'		 		: 'import_files',
			'tipo' 		 		: button_obj.dataset.tipo,
			'parent' 			: button_obj.dataset.parent,
			'section_tipo' 		: button_obj.dataset.section_tipo,			
			'top_tipo' 			: page_globals.top_tipo,
			'top_id' 			: page_globals.top_id
			}
			//return console.log( mydata )

		
		// Add overlay to all page
		var wrap_section = document.getElementById('html_page_wrap')
			html_page.loading_content(wrap_section,1)

		// Hide ok button
		button_obj.style.display = 'none';

		// Add msg processing..
		var msg = document.createElement("div");
			msg.innerHTML = get_label.por_favor_espere
			msg.setAttribute("class", "msg_wait");
			wrap_section.parentNode.appendChild(msg);	

		var jsPromise = Promise.resolve(

			// AJAX REQUEST
			$.ajax({
				url		: tool_import_files.url_trigger ,
				data	: mydata ,
				type 	: "POST"
			})
			// DONE
			.done(function(received_data) {
				// DEBUG CONSOLE Console log
				if (DEBUG) {
					console.log("->Save response: ")
					console.log(received_data);
				}

				//tool_import_files.import_files_end()
				//window.opener.location.reload();
				window.history.back(-1)
			})
			// FAIL ERROR 
			.fail(function(error_data) {
				console.log(error_data);
				button_obj.style.display = 'block';
				// Remove msg processing..
				wrap_section.parentNode.removeChild(msg);
			})
			// ALWAYS
			.always(function() {
				html_page.loading_content(wrap_section,0)
			})

		)//end promise

		return jsPromise;

	}//end import_files








};//end class