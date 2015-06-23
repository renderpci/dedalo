// JavaScript Document

var tool_update_cache = new function() {

	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_update_cache/trigger.tool_update_cache.php' ;


	this.update_cache = function(button_obj, options) {

		if (!confirm("This operation can take very much time with large databases. Are you sure?")) { return false;};

		$(button_obj).addClass('button_update_cache_loading')
		$(button_obj).html(" Updating cache. Please wait ");	
					
		var mode 	= 'update_cache';
		var mydata	= {
			'mode': mode,
			'section_tipo': options.section_tipo,
			'top_tipo': page_globals.top_tipo
		};


		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {			
			//alert(received_data);
			//location.reload(); cache_updated
			window.location = window.location+"&cache_updated=1"
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>ERROR: on update_cache !</span> ");
			if (DEBUG) console.log("ERROR: error_data:" +error_data );
		})
		// ALWAYS
		.always(function() {
			$(button_obj).removeClass('button_update_cache_loading');			
			//html_page.loading_content( wrap_div, 0 );
		});
		if (DEBUG) console.log("->Fired update_cache: "+ options.section_tipo + " " );
	}


};