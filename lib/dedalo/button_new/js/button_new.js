// JavaScript Document

/**
* BUTTON_NEW  CLASS
*/
var button_new = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/button_new/trigger.button_new.php';

	
	// NEW
	this.New = function (obj) {
	
		var tipo	= $(obj).data('tipo'),
			id;	
			
		var target_div	= $('#global_info');

		if ($(target_div).length<1) {
			return alert("New: error target_div not found!")
		}
		
		var mode 		= 'New';
		var mydata		= { 'mode': mode, 'tipo': tipo };

		var data_response = null;				
		
		if (DEBUG) console.log("New data vars: " + 'mode:'+ mode+ ' tipo:'+ tipo);

		var wrap_div = $('.css_section_wrap').first();

		html_page.loading_content( wrap_div, 1 );

		// AJAX REQUEST
		$.ajax({
		  	url			: this.trigger_url,
			data		: mydata,
			type		: "POST",
		  	dataType	: "html"
		})
		// DONE
		.done(function(data_response) {
		
		  	// Search 'error' string in response
			var error_response = /error/.test(data_response);							

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(error_response != false) {
				// Alert error
				alert("[New] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				// Espected int value >0
				if(data_response>0) {
					// Go to edit record page
					var url_redirect 	 = '?tipo='+tipo+'&id=' + data_response ;
					window.location.href = url_redirect ;	
				}else{
					alert("[New] Error: id: " + data_response + " received is not valid")
				}													
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[New] Request failed: " + textStatus ;
			target_div.append(" <span class='error'>Error on new matrix " + msg + "</span>");
		 	alert( msg );
		})
		// ALLWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	}//end this.New



};//end button_new
