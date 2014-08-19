// JavaScript Document

/**
* BUTTON_TRIGGER  CLASS
*/
var button_trigger = new function() {	

	//this.trigger_url = DEDALO_LIB_BASE_URL + '/button_trigger/trigger.button_trigger.php';
	
	
	this.trigger = function (button_obj) {
	
		var tipo		= $(button_obj).data('tipo'),
			propiedades = $(button_obj).data('propiedades');

		if (typeof propiedades.url =='undefined') {
			alert("Wrong url data [propiedades]")
		}else{
			var trigger_url = DEDALO_LIB_BASE_URL + propiedades.url;
		}
		//return alert(trigger_url)
		//console.log(propiedades);
		//alert( "propiededes:\n" + JSON.stringify(propiedades) )
			
		var target_div	= $('#button_trigger_'+tipo);
		var wrap_div 	= target_div;

		if ($(target_div).length<1) {
			return alert("New: error target_div not found!")
		}
		
		var mode 		= 'trigger';
		var mydata		= propiedades;

		var data_response = null;

		html_page.loading_content( wrap_div, 1 );
		$(target_div).html('').fadeIn(300).addClass('button_trigger_response_loading');

		// AJAX REQUEST
		$.ajax({
		  	url			: trigger_url,
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
				alert("[trigger] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				$(wrap_div).html(data_response).removeClass('button_trigger_response_loading').css('cursor','pointer').on('dblclick', '', function(event) {
					//event.preventDefault();
					/* Act on the event */
					$(this).fadeOut(300, function(){ $(this).html('')});
				});;											
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[trigger] Request failed: " + textStatus ;
			target_div.append(" <span class='error'>Error on call trigger " + msg + "</span>");
		 	alert( msg );
		})
		// ALLWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		})

	}//end this.New



};//end button_trigger
