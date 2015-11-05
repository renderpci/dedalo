// JavaScript Document
$(document).ready(function() {

});

var component_av = new function() {

	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_av/trigger.component_av.php';

	

	/**
	* PLAYER_GET_CURRENT_TIME_IN_SECONDS
	* Alias of AVPlayer function player_get_current_time_in_seconds inside iframe '#videoFrame'
	*/
	this.player_get_current_time_in_seconds = function(){
		return videoFrame.player_get_current_time_in_seconds();
	}

	/**
	* HTML5 VIDEO FAILED . Mensaje en caso de fallo
	*/
	this.failed = function(e) {

		// video playback failed - show a message saying why
		switch (e.target.error.code) {

			case e.target.error.MEDIA_ERR_ABORTED:
				if(DEBUG) alert('Admin: You aborted the video playback.');
				console.log("-> failed:  MEDIA_ERR_ABORTED");
				break;

			case e.target.error.MEDIA_ERR_NETWORK:
				if(DEBUG) alert('Admin: A network error caused the video download to fail part-way.');
				console.log("-> failed:  MEDIA_ERR_NETWORK");
				break;

			case e.target.error.MEDIA_ERR_DECODE:
				if(DEBUG) alert('Admin: The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
				console.log("-> failed:  MEDIA_ERR_DECODE");
				break;

			case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
				if(DEBUG)	alert('Admin: The video could not be loaded, either because the server or network failed or because the format is not supported.');
				console.log("-> failed:  MEDIA_ERR_SRC_NOT_SUPPORTED (Reload in 1 seg)");
				// Recargamos el src tras unos segundos
				setTimeout(function() {
										set_and_load_media(src,1,1);	//set_and_load_media(src_target, play, exec_load)		 
									}, 500);			
				break;

			default:
				alert('An unknown error occurred.');
				break;
		}
	};





		/* UPDATE COMPONENT
		this.update_component = function(tipo) {
			
			var wraper = $('.css_wrap_av[data-tipo="'+tipo+'"]');

			if ( $(wraper).length!=1 ) {
				return alert("update_component av : error on select av wrap");
			};

			var wrapper_id = $(wraper).attr('id');
			var arguments = null;
			var callback = null;

			//alert("update_component")
			return component_common.load_component_by_wrapper_id(wrapper_id, arguments, callback);	//wrapper_id, arguments, callback
		}
		*/


		/**
		* GENERATE POSTERFRAME
		*//*
		this.generate_posterframe = function(button_obj, current_time_in_seconds) {
		
			var video_id 		= $(button_obj).data('video_id'),
				quality			= $(button_obj).data('quality');	

			if (DEBUG) console.log("->generate_posterframe vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);		
			
			// TC
			var timecode = parseFloat( current_time_in_seconds );			
			// Minimun tc fix
			if(timecode==0) timecode = 0.001;		

			var mode 		= 'generate_posterframe';
			var mydata		= { 'mode': mode, 'video_id': video_id, 'quality': quality , 'timecode': timecode };

			var image_posterframe 		= $('.av_posterframe[data-video_id="'+video_id+'"]', window.opener);
			var wrap_div 				= $(image_posterframe).parents('.wrap_component:first');
			

			//return alert( $(button_new_posterframe).length )		
			html_page.loading_content( wrap_div, 1 );

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger,
				data	: mydata,
				type	: "POST"
			})
			// DONE
			.done(function(received_data) {

				// Search 'error' string in response
				var error_response = /error/i.test(received_data);	//console.log(typeof error_response);console.log(error_response)

				//if(DEBUG) console.log(received_data)

				// Response ok
				if( error_response != 'false' ) {

					// Notification msg ok
					var msg = "<span class='ok'>"+received_data+"</span>";
						inspector.show_log_msg(msg);

					// Update image av_posterframe
					// Get src url
					var img_src = $(wrap_div).find('.av_posterframe').attr('src');

					// Force update img source when is default 0.jpg
					img_src = img_src.replace("0.jpg", video_id+'.jpg');

					// Get base path from url
					var ar = img_src.split(".jpg");	//console.log(ar);
					// Rebuild url with data for no cache
					var img_src_nocache = ar[0]+'.jpg'+ '?t=' + new Date().getTime();

					// Set same url adding var timestamp
					$(wrap_div).find('.av_posterframe').attr("src", img_src_nocache);

					if(DEBUG) console.log('->generate_posterframe img_src_nocache: '+img_src_nocache)

					// Close player window
					//media_window.close();
					top.$('#dialog_page_iframe').dialog('close');

				}else{
					// Warning msg
					var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
						inspector.show_log_msg(msg);
						alert( $(msg).text() )
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
				html_page.loading_content( wrap_div, 0 );
			})

		};//end generate_posterframe
		*/

		/**
		* DELETE POSTERFRAME
		*//*
		this.delete_posterframe = function(button_obj) {
		
			var video_id 		= $(button_obj).data('video_id'),
				quality			= $(button_obj).data('quality');	

			if (DEBUG) console.log("->delete_posterframe vars: " +video_id+' '+quality);		

			var mode 		= 'delete_posterframe';
			var mydata		= { 'mode': mode, 'video_id': video_id, 'quality': quality };

			//var wrap_div 	= $(button_obj).parents('.wrap_component:first');
			var image_posterframe 		= $('.av_posterframe[data-video_id="'+video_id+'"]', window.opener);
			var wrap_div 				= $(image_posterframe).parents('.wrap_component:first');		

			var img_src = $(wrap_div).find('.av_posterframe').attr('src');
			var no_file = /0.jpg/i.test(img_src);
			if (no_file) { return null };

			if( !confirm( get_label.borrar +' '+ get_label.fichero + ' posterframe ?') ) return false;

			html_page.loading_content( wrap_div, 1 );

			// AJAX REQUEST
			$.ajax({
				url		: this.url_trigger,
				data	: mydata,
				type	: "POST"
			})
			// DONE
			.done(function(received_data) {

				// Search 'error' string in response
				var error_response = /error/i.test(received_data);	//console.log(typeof error_response);console.log(error_response)

				//if(DEBUG) console.log(received_data)

				// Response ok
				if( error_response != 'false' ) {

					// Notification msg ok
					var msg = "<span class='ok'>"+received_data+"</span>";
						inspector.show_log_msg(msg);

					// Update image av_posterframe				
					// Get src url
					var img_src = $(wrap_div).find('.av_posterframe').attr('src');
					// Get base path from url
					var ar = img_src.split("/posterframe/");	//console.log(ar);
					// Rebuild url with 0.jpg image adding var timestamp
					var img_src_zero = ar[0]+'/posterframe/'+'0.jpg' + "?t=" + new Date().getTime() ;
					// Set same url 
					$(wrap_div).find('.av_posterframe').attr("src", img_src_zero);

					// Close window
					top.$('#dialog_page_iframe').dialog('close');

				}else{
					// Warning msg
					var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
						inspector.show_log_msg(msg);
						alert( $(msg).text() )
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
				html_page.loading_content( wrap_div, 0 );
			})

		};//end delete_posterframe
		*/





		


		


		

		


		


		
		/**
		* LOAD_MEDIA_ENGINE DEPRECATED
		
		this.load_media_engine_DEPRECATED = function(button_obj) {
			
			return this.open_media_window(button_obj, 'posterframe');
			
			//
			var video_id	= $(button_obj).data('video_id'),
				quality		= $(button_obj).data('quality'),
				tipo		= $(button_obj).data('tipo');

			var reelID		= video_id ;	//alert("reelID:"+reelID + " quality:" + quality)	
			var myurl		= DEDALO_LIB_BASE_URL + '/media_engine/av_media_player.php?reelID=' + reelID + '&quality' + quality + '&modo=posterframe'   ;	//alert(myurl)
			var target_div	= $('#media_container_'+tipo) ;
			var mydata		= { 'reelID':reelID , 'quality':quality } ;		
			
			try{
				
				//$('#media_files').hide(0); $('#media_files_flecha').toggleClass('flecha_open_tboby');			
				//$('html, body').animate({
		        //                scrollTop: ($("#posterframe").offset().top)-24 }, 300);
				
				$(target_div).attr({"src": myurl, 'height':'458'});
				
				// RESIZE IFRAME SIZE TO target_div VIDEO CONTENT HEIGHT
				$("#media_container").load(function () { //The function below executes once the iframe has finished loading
					
					var h = $("#media_container").contents().find('#wrap_edit_video').height();		//alert(h)			
					$(target_div).height(h+20);
				});
				
				$(button_obj).hide();		
			
			}catch(err){ 
				if(DEBUG) alert("Debug: load_media_engine: " +err) 
			}
				
		};
		*/


}; //end component_av


