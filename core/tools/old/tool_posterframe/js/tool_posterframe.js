"use strict";
/**
*	TOOL_POSTERFRAME
*
*
*/
var tool_posterframe = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_CORE_URL + '/tools/tool_posterframe/trigger.tool_posterframe.php' ;


	/**
	* GENERATE POSTERFRAME
	*/
	this.generate_posterframe = function(button_obj, current_time_in_seconds) {

		//if(window.self !== window.top) return alert("Please exec in top window");
		
		var video_id 		= $(button_obj).data('video_id'),
			quality			= $(button_obj).data('quality'),
			parent			= $(button_obj).data('parent');

		if(SHOW_DEBUG===true) console.log("->generate_posterframe vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);		
		
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
				if($(wrap_div).length===1) {
					let wrapper_id 		= $(wrap_div).attr('id')
					let my_arguments 	= null
					let varcallback 	= null
					top.component_common.load_component_by_wrapper_id(wrapper_id, my_arguments, varcallback);	//wrapper_id, my_arguments, callback
				}else{
					console.log("Error: wrap div not found! Sorry, no component update is done.");
				}
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on generate_posterframe data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
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

		if(SHOW_DEBUG===true) console.log("->delete_posterframe vars: " +video_id+' '+quality);		

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
					myarguments = null,
					callback 	= null;
				top.component_common.load_component_by_wrapper_id(wrapper_id, myarguments, callback);
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on delete_posterframe data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div_tool, 0 );
		})

	};//end delete_posterframe



	/**
	* GENERATE_IDENTIFYING_IMAGE
	*/
	this.generate_identifying_image = function(button_obj, current_time_in_seconds) {

		//if(window.self !== window.top) return alert("Please exec in top window");
		
		var video_id 	= button_obj.dataset.video_id,
			quality		= button_obj.dataset.quality,
			parent		= button_obj.dataset.parent

		var select 		= document.getElementById('identifying_image_selector'),
			select_val 	= select.value
			

		if(SHOW_DEBUG===true) console.log("->generate_identifying_image vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);		
		
		// TC
		var timecode = parseFloat( current_time_in_seconds );
		// Minimun tc fix
		if(timecode==0) timecode = 0.001;		

		var mydata		= { 'mode' 		: 'generate_identifying_image',
							'video_id' 	: video_id,
							'quality' 	: quality ,
							'timecode' 	: timecode,
							'parent' 	: parent,
							'select_val': select_val,
							'top_tipo' 	: page_globals.top_tipo
						}
						//return console.log(mydata);

		
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

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(/error/i.test(received_data)) {
				// Warning msg
				var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
					inspector.show_log_msg(msg);
					alert( $(msg).text() )
			}else{
				// Notification msg ok
				var msg = "<span class='ok'>"+received_data+"</span>";
					inspector.show_log_msg(msg);				
			}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on generate_identifying_image data:" + error_data + "</span>";				
			inspector.show_log_msg(msg);
			if(SHOW_DEBUG===true) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div_tool, 0 );
		})

	};//end generate_identifying_image



};//end tool_posterframe