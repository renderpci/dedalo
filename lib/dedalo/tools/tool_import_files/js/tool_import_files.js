/**
* TOOL_IMPORT_FILES CLASS
*
*
*
*/
var tool_import_files = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_import_files/trigger.tool_import_files.php'


	/**
	* IMPORT_FILES
	* On click button 'ok' exec trigger call by ajax to process uploaded files
	* @param dom object button_obj
	* @reuturl promise jsPromise
	*/
	this.import_files = function(button_obj) {

		var trigger_vars = {
				mode		 	: 'import_files',
				tipo 		 	: button_obj.dataset.tipo,
				parent 			: button_obj.dataset.parent,
				section_tipo 	: button_obj.dataset.section_tipo,
				import_mode 	: button_obj.dataset.import_mode,
				top_tipo 		: page_globals.top_tipo,
				top_id			: page_globals.top_id
			}
			if(SHOW_DEBUG===true) {
				console.log( trigger_vars ); //return
			}			
		
		// Add overlay to all page
		var wrap_section = document.getElementById('html_page_wrap')
			html_page.loading_content(wrap_section,1)

		// Hide ok button
		button_obj.style.display = 'none';

		// Add msg processing..
		var msg = document.createElement("div")
			msg.classList.add("msg_wait", "blink")
			msg.innerHTML = get_label.por_favor_espere			
			wrap_section.parentNode.appendChild(msg);


		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) console.log(response);														

							if (response && response.result===true) {
								if (button_obj.dataset.import_mode==='section') {
									window.opener.location.reload();
								}
								html_page.loading_content(wrap_section,0)
								msg.remove()
								//alert(response.msg)
								window.close()	
							}else{
								msg.innerHTML = "<span class=\"error\">Error on import</span>"
								msg.classList.remove("blink")
								if (response && response.msg) {
									msg.innerHTML += " : " + response.msg
								}							
							}													
						})

		return js_promise		
	}//end import_files




};//end class