// JavaScript Document
/*
	TOOL_ADD_COMPONENT_DATA
*/


// TOOL_ADD_COMPONENT_DATA CLASS
var tool_add_component_data = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_add_component_data/trigger.tool_add_component_data.php' ;

	/**
	* ADD_DATA
	* Exec SSE petition to trigger for propagate curent value to all found records
	* @param dom object button_obj
	*/
	this.add_data = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;		

		//var $button_obj 	= $(button_obj)

		//return 	console.log( window.top.document ); //.querySelector("#dialog_page_iframe").dialog
		
		var component_tipo	= button_obj.dataset.component_tipo,
			parent 			= button_obj.dataset.parent,
			section_tipo	= button_obj.dataset.section_tipo,
			paginator_div 	= window.top.document.querySelector(".css_wrap_rows_paginator"),
			response_div 	= document.querySelector("#tool_add_component_data_response"),
			//button_cancel 	= button_obj.parentNode.querySelector(".button_cancel"),
			button_replace 	= button_obj.parentNode.querySelector(".button_replace")
			
			
		
		var mydata = {  'mode'			: 'add_data',
						'component_tipo': component_tipo,
						'parent'		: parent ,
						'section_tipo'	: section_tipo,
						'top_tipo'		: page_globals.top_tipo
					}
					//return console.log(mydata);
		var json_data = JSON.stringify( mydata )


		//var wrap_div_tool = $button_obj.parents('.wrap_tool:first');
		var wrap_div_tool = button_obj.parentNode.parentNode.parentNode.querySelector(".wrap_tool");
		//html_page.loading_content( wrap_div_tool, 1 );

		// Spinner
		//response_div.html("<div class='css_spinner'>Please wait..</div>");
		response_div.innerHTML = "<div class='css_spinner'>Please wait..</div>";
		
		// Hide button cancel
		//button_cancel.hide()
		//button_cancel.style.display = 'none';

		// Hide button replace
		//button_replace.hide()
		button_replace.style.display = 'none';

		var source  = new EventSource(tool_add_component_data.url_trigger+"?mode=add_data&json_data="+json_data);
		var msg 	= ""

		// message
		source.addEventListener('message', function(e) {
					//console.log(e);

					msg = JSON.parse(e.data);
					//console.log(msg);

					// Notification msg ok
					//response_div.html(msg);
					response_div.innerHTML = msg;

					// END SCRIPT
					if(/ok/i.test(msg)) { //data_percent >= 100 || 
						// Close connection
						source.close();
						
						// Remove paginator div from edit window (DELETE, now the selection is sustained)
						//if (paginator_div) paginator_div.remove()

						// Remove spinner
						//html_page.loading_content( wrap_div_tool, 0 );

						// Close button
						//response_div.append( "<div class=\"css_button_generic\" onclick=\"top.$('#dialog_page_iframe').dialog('close');\">"+ get_label.cerrar +"</div> ");
						//response_div.innerHTML += "<div class=\"css_button_generic\" onclick=\"top.$('#dialog_page_iframe').dialog('close');\">"+ get_label.cerrar +"</div> ";
					}

				}, false);

		// error
		source.addEventListener('error', function(e) {
			//console.log(e);
			
			// Close connection
			source.close();

			// Remove spinner
			//html_page.loading_content( wrap_div_tool, 0 );

			//alert("EventSource failed. "+ e );
			//response_div.html("<div class='error'>Sorry. Error on proccess data</div>");
			response_div.innerHTML += "<div class='error'>Sorry. Error on proccess data</div>";

		}, false);

		//source.onerror = function(e) {			
		//};
				

		/* AJAX MODEL
			var oReq = new XMLHttpRequest();

			oReq.addEventListener("progress", updateProgress);
			oReq.addEventListener("load", transferComplete);
			oReq.addEventListener("error", transferFailed);
			oReq.addEventListener("abort", transferCanceled);

			oReq.open();
	
			// ...

			// progress on transfers from the server to the client (downloads)
			function updateProgress (oEvent) {			  
			  	console.log(oEvent);
			}

			function transferComplete(evt) {
			  console.log("The transfer is complete.");
			}

			function transferFailed(evt) {
			  console.log("An error occurred while transferring the file.");
			}

			function transferCanceled(evt) {
			  console.log("The transfer has been canceled by the user.");
			}
			*/

	}//end add_data



	



};//end tool_add_component_data