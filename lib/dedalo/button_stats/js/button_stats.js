// JavaScript Document

/**
* BUTTON_STATS  CLASS
*/
var button_stats = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/button_stats/trigger.button_stats.php';

	
	// Stats
	this.Stats = function (button_obj) {

		//return console.log(button_obj)
	
		var context_tipo	= $(button_obj).data('tipo'),
			div_main_list 	= $('DIV.main_list'),
			fecha			= $(button_obj).siblings('INPUT.input_stats_date').val();				

		if(typeof context_tipo == 'undefined') {
			return alert("Stats: error context_tipo is empty!")
		}
		if ($(div_main_list).length<1) {
			return alert("Stats: error div_main_list not found!")
		}

		// Hide div_main_list (Listados de registros con sus accesorios -search,paginator,rows-)
		$(div_main_list).hide();
		$('.tm_list_wrap').hide();
		
		if( $('#stats_info').length<1 ) {
			// Create stats divcontainer id=stats_info
			var target_div = $( "<div id='stats_info'/>");
			$(target_div).insertBefore( div_main_list );
		}else{
			target_div = $('#stats_info');
		}		

		target_div.html('<div class="loading_stats"> Loading..</div>');//return;

		
		var mode 		= 'Stats';
		var mydata		= { 'mode': mode, 'context_tipo': context_tipo, 'fecha':fecha };

		var data_response = null;
		
		//if (DEBUG) console.log("Stats data vars: " + 'mode:'+ mode+ ' context_tipo:'+ context_tipo);

		//var wrap_div = $('.css_section_wrap').first();

		html_page.loading_content( $('body'), 1 );

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
				alert("[Stats] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				//console.log(data_response)
				//return false;
				target_div.html(data_response)
			}
			html_page.loading_content( $('body'), 0 );
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[Stats] Request failed: " + textStatus ;
			target_div.append(" <span class='error'>Error on new matrix " + msg + "</span>");
			alert( msg );
		})
		// ALLWAYS
		.always(function() {
			html_page.loading_content( $('body'), 0 );
		})

	}//end this.Stats


	/**
	* Generate
	* launch trigger to generate stats based on input date (same as cron)
	*/	
	this.Generate = function (button_obj) {

		var fecha 		= $(button_obj).siblings('INPUT.input_stats_date').val(),
			window_url	= DEDALO_LIB_BASE_URL + '/diffusion/diffusion_section_stats/trigger.diffusion_section_stats.php/?mode=save_stats_data&launcher=dedalo_generate&date='+fecha ,	
			window_name	= "Trigger generate stats";

		if(!confirm("Overwrite any existing versions of processing statistics for date "+fecha+"?")) return false;

		// Open and focus window
		var trigger_stats_window=window.open(window_url,window_name);
		trigger_stats_window.focus()
	}




};//end button_stats
