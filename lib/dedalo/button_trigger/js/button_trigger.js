// JavaScript Document


/**
* BUTTON_TRIGGER CLASS
*/
var button_trigger = new function() {	

	/**
	* TRIGGER
	*
	*/
	this.trigger = function (button_obj) {
	
		var tipo		= $(button_obj).data('tipo'),
			propiedades = $(button_obj).data('propiedades');
			propiedades.section_tipo = page_globals.section_tipo;

		if (typeof propiedades.trigger_url =='undefined') {
			return alert("Wrong url data [propiedades]")
		}else{
			var trigger_url = DEDALO_LIB_BASE_URL + propiedades.trigger_url;
		}

		var target_div	= $('#button_trigger_'+tipo),
			wrap_div 	= target_div;

		if ($(target_div).length<1) {
			return alert("trigger: error target_div not found!")
		}
		
		var mydata = propiedades;
		console.log(propiedades);

		// Spinner ON
		html_page.loading_content( wrap_div, 1 );
		$(target_div).html('').fadeIn(300).addClass('button_trigger_response_loading');

		// AJAX REQUEST
		$.ajax({
		  	url		: trigger_url,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			//if(DEBUG) console.log(received_data);

		  	// Search 'error' string in response
			var error_response = /error/i.test(received_data);			

			// If received_data contain 'error' show alert error with (received_data) else reload the page
			if(error_response) {
				// Alert error
				alert("[trigger] Request failed: \n" + received_data + $(received_data).text() );
			}else{
				$(wrap_div).html(received_data).removeClass('button_trigger_response_loading').css('cursor','pointer').on('dblclick', '', function(event) {
					//event.preventDefault();
					$(this).fadeOut(300, function(){ $(this).html('')});
				});										
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[trigger] Request failed: " + textStatus ;
			target_div.append(" <span class='error'>Error on call trigger " + msg + "</span>");
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {
			// Spinner OFF
			html_page.loading_content( wrap_div, 0 );
		})

	}//end this.trigger


};//end button_trigger
