/*
	TOOL_ADD_COMPONENT_DATA
*/


// TOOL_ADD_COMPONENT_DATA CLASS
var tool_add_component_data = new function() {



	// LOCAL VARS
		this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_add_component_data/trigger.tool_add_component_data.php' ;



	/**
	* ADD_DATA
	* Exec SSE request to trigger for propagate curent value to all found records
	* @param dom object button_obj
	*/
	this.add_data = function(button_obj) {

		// confirm dialog			
			if (!confirm(get_label.seguro + " [" +  button_obj.innerHTML +"]")) {
				return false;
			}		
		
		// vars
			const component_tipo	= button_obj.dataset.component_tipo
			const parent			= button_obj.dataset.parent
			const section_tipo		= button_obj.dataset.section_tipo
			const action			= button_obj.dataset.action
			const temp_id			= button_obj.dataset.temp_id
			const response_div		= document.querySelector("#tool_add_component_data_response")
			const buttons_container = button_obj.parentNode
		
		// temporal component
			// const component_uid		= button_obj.dataset.component_uid
			// const wrapper_id		= "wrapper_" + component_uid
			// const component_wrapper	= document.getElementById(wrapper_id)
			// if (!component_wrapper) {
			// 	console.error("Error on get component wrapper:", wrapper_id);
			// 	return false
			// }
		
		// json_data
			const json_data = {
				mode			: 'add_data',
				action			: action,
				component_tipo	: component_tipo,
				parent			: parent,
				section_tipo	: section_tipo,
				temp_id			: temp_id,
				top_tipo		: page_globals.top_tipo
			}

		// wrap_div_tool
			// const wrap_div_tool = button_obj.parentNode.parentNode.parentNode.querySelector(".wrap_tool");			
			// html_page.loading_content( wrap_div_tool, 1 );

		// Spinner
			response_div.innerHTML = "<div class='css_spinner'>Please wait..</div>";
		
		// Hide buttons_container		
			buttons_container.classList.add("hide");		

		// EventSource
			const source = new EventSource(tool_add_component_data.url_trigger+"?mode=add_data&json_data="+JSON.stringify(json_data));
		
		// message
			source.addEventListener('message', function(e) {

				const msg = JSON.parse(e.data);
			
				// Notification msg ok				
				response_div.innerHTML = msg;

				// END SCRIPT
				if(/ok/i.test(msg)) { //data_percent >= 100 || 
					
					// Close connection
					source.close();
					
					// Remove paginator div from edit window (DELETE, now the selection is sustained)
					//if (paginator_div) paginator_div.remove()

					// Remove spinner
						// html_page.loading_content( wrap_div_tool, 0 );

					// show button close
						const button_close = buttons_container.parentNode.querySelector(".btn_close")
						button_close.classList.remove("hide"); 
				}
			}, false);

		// error
			source.addEventListener('error', function(e) {
			
				// Close connection
				source.close();

				// Remove spinner
					// html_page.loading_content( wrap_div_tool, 0 );

				response_div.innerHTML += "<div class='error'>Sorry. Error on proccess data</div>";

			}, false);		
				

		// AJAX MODEL 
			// var oReq = new XMLHttpRequest();

			// oReq.addEventListener("progress", updateProgress);
			// oReq.addEventListener("load", transferComplete);
			// oReq.addEventListener("error", transferFailed);
			// oReq.addEventListener("abort", transferCanceled);

			// oReq.open();
	
			// // ...

			// // progress on transfers from the server to the client (downloads)
			// function updateProgress (oEvent) {			  
			// 	console.log(oEvent);
			// }

			// function transferComplete(evt) {
			//   console.log("The transfer is complete.");
			// }

			// function transferFailed(evt) {
			//   console.log("An error occurred while transferring the file.");
			// }

			// function transferCanceled(evt) {
			//   console.log("The transfer has been canceled by the user.");
			// }
			

		return true
	}//end add_data
	


};//end tool_add_component_data