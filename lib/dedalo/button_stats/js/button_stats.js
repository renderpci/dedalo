// JavaScript Document



/**
* BUTTON_STATS  CLASS
*/
var button_stats = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/button_stats/trigger.button_stats.php';

	
	// Stats
	this.Stats = function (button_obj) {
		
		const $stats_info 	 = $('#stats_info')
		const $button_obj 	 = $(button_obj)
		const $tm_list_wrap	 = $('.tm_list_wrap')	

		const section_list_rows_content = document.querySelector('[data-role="section_list_rows_content"]')
		const div_main_list 			= section_list_rows_content.querySelector(".css_section_list_wrap")
	
		if(!div_main_list) {
			if(SHOW_DEBUG===true) {
				console.log("div_main_list:",div_main_list);
			}
			return alert("[Stats] Sorry. div_main_list not found in dom");
		}

		// TOGGLE HIDE / SHOW STATS : If stats div is open, close and viceversa
		if ($stats_info.length>0) {
			//return diffusion_section_stats.hide_stats_content();
			$stats_info.hide();
			//$(button_obj).hide(0);
			$(div_main_list).fadeIn(150, function() {
				$tm_list_wrap.show();
				$stats_info.remove();	
			});	
			return false
		}		

		var context_tipo	= $button_obj.data('tipo'),
			fecha			= $button_obj.siblings('INPUT.input_stats_date').val();
		if(typeof context_tipo == 'undefined') {
			return alert("Stats: error context_tipo is empty!")
		}				

		// Hide div_main_list (Listados de registros con sus accesorios -search,paginator,rows-)
		$(div_main_list).hide();
		$tm_list_wrap.hide();
		
		if( $stats_info.length<1 ) {
			// Create stats div container #stats_info
			var $target_div = $("<div id='stats_info'/>");
			$target_div.insertBefore( div_main_list );
		}else{
			$target_div = $stats_info;
		}		

		$target_div.html('<div class="loading_stats blink"> Loading.. </div>');//return;
		
		const mode 		= 'Stats'
		const mydata	= { 
			mode 		 : mode,
			context_tipo : context_tipo,
			fecha 		 : fecha,
			top_tipo 	 : page_globals.top_tipo
		};
		
		//if(SHOW_DEBUG===true) console.log("Stats data vars: " + 'mode:'+ mode+ ' context_tipo:'+ context_tipo);
		//var wrap_div = $('.css_section_wrap').first();
		//html_page.loading_content( $('body'), 1 );

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_url,
			data		: mydata,
			type		: "POST",
			dataType	: "html"
		})
		// DONE
		.done(function(received_data) {
		
			// If received_data contain 'error' show alert error with (received_data) else reload the page
			if(/error/i.test(received_data)) {
				// Alert error
				alert("[Stats] Request failed: \n" + received_data + $(received_data).text() );
			}else{
				$target_div.html(
					received_data
					)
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[Stats] Request failed: " + textStatus ;
			$target_div.append(" <span class='error'>Error on stats processing: " + msg + "</span>");
			alert( msg );
		})
		// ALWAYS
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
