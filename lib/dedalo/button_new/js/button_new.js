// JavaScript Document

/**
* BUTTON_NEW  CLASS
*/
var button_new = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/button_new/trigger.button_new.php';

	
	// NEW
	this.New = function (obj) {
	
		var tipo 		= $(obj).data('tipo'),
			target_div	= $('#global_info')

		if ($(target_div).length<1) {
			return alert("New: error target_div not found!")
		}
		
		var mode 	= 'New';
		var mydata	= { 
			'mode': mode, 
			'tipo': tipo , 
			'top_tipo': page_globals.top_tipo
		};

		var received_data = null;				
		
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
		.done(function(received_data) {
		
		  	// Search 'error' string in response
			var error_response = /error/i.test(received_data);

			// If received_data contain 'error' show alert error with (received_data) else reload the page
			if(error_response) {
				// Alert error
				alert("[New] Request failed: \n" + received_data + $(received_data).text() );
			}else{
				// Espected int value >0
				if(received_data>0) {
					// Go to edit record page
					var url_redirect 	 = '?t='+tipo+'&id=' + received_data ;
					window.location.href = url_redirect ;	
				}else{
					alert("[New] Error: id: " + received_data + " received is not valid")
				}													
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[New] Request failed: " + textStatus ;
			target_div.append(" <span class='error'>Error on new matrix " + msg + "</span>");
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	}//end this.New



};//end button_new
