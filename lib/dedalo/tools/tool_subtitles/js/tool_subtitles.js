// JavaScript Document

/*
	TOOL_SUBTITLES
*/




// TOOL_SUBTITLES CLASS
var tool_subtitles = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_subtitles/trigger.tool_subtitles.php' ;

	$(document).ready(function(){

		$('#tool_subtitles_line_lenght').keypress(function(event){
		    var keycode = (event.keyCode ? event.keyCode : event.which);
		    if(keycode == '13'){
		        tool_subtitles.build_subtitles_text( $('#button_build_subtitles') )
		    }
		});

		/**
		* 
		* Set in av_media_player.js -> load_video_controls
		*//*
		var myVar = setInterval(function(){ 
			if ( page_globals.video_duration_secs > 0) {
			    //console.log(page_globals.video_duration_secs);
			    clearInterval(myVar);
			}
		}, 500);
		*/
		
		//var check = document.getElementById("iframeid").contentWindow;
		//console.log(page_globals.video_duration_secs);
			//console.log( videoObj_selector() );
		//var durationSecs = parseInt(videoObj_selector().duration);
			//console.log(durationSecs);
		//top.page_globals.video_duration_secs = durationSecs;

		/*
		var myVideoPlayer = document.getElementById('player_rsc35_rsc167_2');
		myVideoPlayer.addEventListener('loadedmetadata', function() {
		    console.log(videoPlayer.duration);
		});
		*/
	});

	

	this.build_subtitles_text = function(button_obj) {

		var section_tipo 		= $(button_obj).data('section_tipo'),
			section_id 			= $(button_obj).data('section_id'),
			component_tipo 		= $(button_obj).data('component_tipo'),
			line_lenght 		= $('#tool_subtitles_line_lenght').val(),
			video_duration_secs = page_globals.video_duration_secs ;

		
		var mydata = {  
					'mode': 'build_subtitles_text',
					'section_tipo': section_tipo,
					'section_id': section_id ,
					'component_tipo': component_tipo,
					'line_lenght': line_lenght,
					'video_duration_secs': video_duration_secs,			
					'top_tipo':page_globals.top_tipo
					};
					//return console.log(mydata);

		var target_div = $('#subtitles_response');

		html_page.loading_content( target_div, 1 );	

		// AJAX REQUEST
		$.ajax({
			url		: tool_subtitles.url_trigger,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {
				
			/*
			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			
			if(error_response) {
				// Warning msg
				var msg = "<span class='error'>Error when build_subtitles_text: \n" + received_data + "</span>" ;					
				alert( $(msg).text() )
			}else{
			*/			
				//$(target_div).html(received_data);
				//console.log( JSON.parse(received_data) );
				var data = JSON.parse(received_data);
				if (data.result=='ok' && data.url) {
					$(target_div).html(data.msg);
					var windowObjectReference;
					var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";					
					windowObjectReference = window.open(data.url, "Subtitle", strWindowFeatures);								
				}else{
					var msg = "<span class='error'>Error when build_subtitles_text: \n" + data.msg + "</span>" ;
					$(target_div).html(msg);
				}
			//}			
		})
		// FAIL ERROR
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on build_subtitles_text data:" + error_data + "</span>";				
			alert(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( target_div, 0 );
		})

	}//end build_subtitles_text





};//end tool_subtitles class
