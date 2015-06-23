// JavaScript Document
/*
	TOOL_POSTERFRAME
*/
$(document).ready(function() {
	
	switch(page_globals.modo){
		case 'edit':				
				break;		
	}
});





// TOOL transcription CLASS
var tool_posterframe = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_posterframe/trigger.tool_posterframe.php' ;


	/**
	* GENERATE POSTERFRAME
	*/
	this.generate_posterframe = function(button_obj, current_time_in_seconds) {

		//if(window.self !== window.top) return alert("Please exec in top window");
		
		var video_id 		= $(button_obj).data('video_id'),
			quality			= $(button_obj).data('quality'),
			parent			= $(button_obj).data('parent');

		if (DEBUG) console.log("->generate_posterframe vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);		
		
		// TC
		var timecode = parseFloat( current_time_in_seconds );
		// Minimun tc fix
		if(timecode==0) timecode = 0.001;		

		var mode 		= 'generate_posterframe';
		var mydata		= { 'mode': mode,
							'video_id': video_id,
							'quality': quality ,
							'timecode': timecode,
							'parent': parent,
							'top_tipo':page_globals.top_tipo
						};

		/*
		var video_element 	= top.$('.css_av_video[data-video_id="'+video_id+'"]', window.opener);
		var wrap_div 		= $(video_element).parents('.wrap_component:first');		
			//return alert( 'css_av_video lengh: '+$(wrap_div).length )
		*/
		var wrap_div 	= top.$('.css_wrap_av[data-dato="'+video_id+'"]', window.opener);
			//console.log(wrap_div.length); return false;
			
		var wrap_div_tool = $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div_tool, 1 );	

		// AJAX REQUEST
		$.ajax({
			url		: tool_posterframe.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Warning msg
				var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);
				
				// Update image av_posterframe
				if($(wrap_div).length==1) {
					var wrapper_id 	= $(wrap_div).attr('id'),
						arguments 	= null,
						callback 	= null;
					top.component_common.load_component_by_wrapper_id(wrapper_id, arguments, callback);	//wrapper_id, arguments, callback
				}else{
					console.log("Error: wrap div not found! Sorry, no component update is done.");
				}				

				// Close player window				
				top.$('#dialog_page_iframe').dialog('close');
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on generate_posterframe data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div_tool, 0 );
		})

	};//end generate_posterframe

	/**
	* DELETE POSTERFRAME
	*/
	this.delete_posterframe = function(button_obj) {
		
		//if(window.self !== window.top) return alert("Please exec in top window");
		
		var video_id 		= $(button_obj).data('video_id'),
			quality			= $(button_obj).data('quality'),
			parent			= $(button_obj).data('parent');	

		if (DEBUG) console.log("->delete_posterframe vars: " +video_id+' '+quality);		

		var mode 		= 'delete_posterframe';
		var mydata		= { 'mode': mode,
							'video_id': video_id,
							'quality': quality,
							'parent': parent,
							'top_tipo':page_globals.top_tipo
						};
		
		var video_element 	= top.$('.css_av_video[data-video_id="'+video_id+'"]');
		var wrap_div 		= $(video_element).parents('.wrap_component:first');		
		

		if( !confirm( get_label.borrar +' '+ get_label.fichero + ' posterframe ?') ) return false;


		var wrap_div_tool = $(button_obj).parents('.wrap_tool:first');
		html_page.loading_content( wrap_div_tool, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Warning msg
				var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);

				// Update image av_posterframe
				var wrapper_id 	= $(wrap_div).attr('id'),
					arguments 	= null,
					callback 	= null;
				top.component_common.load_component_by_wrapper_id(wrapper_id, arguments, callback);	//wrapper_id, arguments, callback

				// Close window
				top.$('#dialog_page_iframe').dialog('close');
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on delete_posterframe data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div_tool, 0 );
		})

	};//end delete_posterframe



};//end tool_posterframe