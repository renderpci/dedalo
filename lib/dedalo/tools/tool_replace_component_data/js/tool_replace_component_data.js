// JavaScript Document
/*
	tool_replace_component_data
*/


// TOOL_REPLACE_COMPONENT_DATA CLASS
var tool_replace_component_data = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_replace_component_data/trigger.tool_replace_component_data.php' ;

	
	/**
	* REPLACE_DATA_AJAX
	* Exec ajax petition to trigger for propagate curent value to all found records
	* @param dom object button_obj
	*//*
	this.replace_data_ajax = function(button_obj) {
			
		if (!confirm(get_label.seguro)) return false;		

		var $button_obj = $(button_obj)
		
		var component_tipo	= $button_obj.data('component_tipo'),
			parent 			= $button_obj.data('parent'),
			section_tipo	= $button_obj.data('section_tipo'),
			paginator_div 	= top.$('.css_wrap_rows_paginator', window.opener),
			response_div 	= $('#tool_replace_component_data_response'),
			button_cancel 	= $button_obj.parent().find('.button_cancel'),
			button_replace 	= $button_obj.parent().find('.button_replace')
		
		var mydata = {  'mode'			: 'replace_data',
						'component_tipo': component_tipo,
						'parent'		: parent ,
						'section_tipo'	: section_tipo,						
						'top_tipo'		: page_globals.top_tipo
					}
					//return console.log(mydata);
		
			
		var wrap_div_tool = $button_obj.parents('.wrap_tool:first');
		html_page.loading_content( wrap_div_tool, 1 );

		// Spinner
		response_div.html("<div class='css_spinner'>Please wait..</div>");
		
		// Hide button cancel
		button_cancel.hide()

		// Hide button replace
		button_replace.hide()

		// AJAX REQUEST
		$.ajax({
			url		: tool_replace_component_data.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

				console.log(received_data);

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(/error/i.test(received_data)) {
				// Warning msg
				var msg = "<span class='error'>Error when replace_data: \n" + received_data + "</span>" ;
					response_div.html(msg);
					alert( $(msg).text() )
			}else{
				// Notification msg ok
				var msg = received_data;
					response_div.html(msg);
				
				// Remove paginator div from edit window
				paginator_div.remove()								

				// Close player window				
				//top.$('#dialog_page_iframe').dialog('close');
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on replace_data :" + error_data + "</span>";				
			response_div.html(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div_tool, 0 );
		})

	}//replace_data_ajax
	*/


	/**
	* REPLACE_DATA
	* Exec SSE petition to trigger for propagate curent value to all found records
	* @param dom object button_obj
	*/
	this.replace_data = function(button_obj) {

		if (!confirm(get_label.seguro)) return false;		

		//var $button_obj 	= $(button_obj)

		//return 	console.log( window.top.document ); //.querySelector("#dialog_page_iframe").dialog
		
		var component_tipo	= button_obj.dataset.component_tipo,
			parent 			= button_obj.dataset.parent,
			section_tipo	= button_obj.dataset.section_tipo,
			//paginator_div = top.$('.css_wrap_rows_paginator', window.opener), 
			paginator_div 	= window.top.document.querySelector(".css_wrap_rows_paginator"),
			//response_div 	= $('#tool_replace_component_data_response'),
			response_div 	= document.querySelector("#tool_replace_component_data_response"),
			//button_cancel = $button_obj.parent().find('.button_cancel'),
			button_cancel 	= button_obj.parentNode.querySelector(".button_cancel"),
			//button_replace= $button_obj.parent().find('.button_replace')
			button_replace 	= button_obj.parentNode.querySelector(".button_replace")
			
			
		
		var mydata = {  'mode'			: 'replace_data',
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
		button_cancel.style.display = 'none';

		// Hide button replace
		//button_replace.hide()
		button_replace.style.display = 'none';

		var source  = new EventSource(tool_replace_component_data.url_trigger+"?mode=replace_data&json_data="+json_data);
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
						
						// Remove paginator div from edit window
						paginator_div.remove()						

						// Remove spinner
						//html_page.loading_content( wrap_div_tool, 0 );

						// Close button
						//response_div.append( "<div class=\"css_button_generic\" onclick=\"top.$('#dialog_page_iframe').dialog('close');\">"+ get_label.cerrar +"</div> ");
						response_div.innerHTML += "<div class=\"css_button_generic\" onclick=\"top.$('#dialog_page_iframe').dialog('close');\">"+ get_label.cerrar +"</div> ";
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

	}//end replace_data



	



};//end tool_replace_component_data