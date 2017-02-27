




// TOOL_SUBTITLES CLASS
var tool_subtitles = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_subtitles/trigger.tool_subtitles.php' ;

	
	$(function(){

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

		var section_tipo 		= $(button_obj).data('section_tipo')
		var section_id 			= $(button_obj).data('section_id')
		var component_tipo 		= $(button_obj).data('component_tipo')
		var line_lenght 		= $('#tool_subtitles_line_lenght').val()
		var video_duration_secs = page_globals.video_duration_secs

		var wrap = document.querySelector('.text_area_tool_transcription');
			if (!wrap) {
				return alert("Error on locate text area wrapper")
			} 
		var lang = wrap.dataset.lang
		
		var mydata = {  
					'mode' 					: 'build_subtitles_text',
					'section_tipo' 			: section_tipo,
					'section_id' 			: section_id ,
					'component_tipo' 		: component_tipo,
					'line_lenght' 			: line_lenght,
					'video_duration_secs' 	: video_duration_secs,
					'top_tipo' 				: page_globals.top_tipo,
					'lang' 					: lang
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
					
			//$(target_div).html(received_data);
			//console.log( JSON.parse(received_data) );
			var data = JSON.parse(received_data);
			if (data.result=='ok' && data.url) {
				$(target_div).html(data.msg);
				var windowObjectReference;
				var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
				windowObjectReference = window.open(data.url, "Subtitle", strWindowFeatures);

				// Add created subtitles to video
				tool_subtitles.add_subtitle_track_to_video()

			}else{
				var msg = "<span class='error'>Error when build_subtitles_text: \n" + data.msg + "</span>" ;
				$(target_div).html(msg);
			}		
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



	/**
	* ADD_SUBTITLE_TRACK_TO_VIDEO
	* @return 
	*/
	this.add_subtitle_track_to_video = function() {

		var text_area 		= document.querySelector('.text_area_tool_transcription');
			if (!text_area) {
				console.log("Error on get text area element in DOM");
				return false;
			}

		var videoFrame	= document.getElementById('videoFrame');
		var video_obj	= videoFrame.contentWindow.document.querySelector('video');
			if (!video_obj) {
				console.log("Error on get text video element in DOM");
				return false;
			}

		var trigger_vars = {
			mode 		 	: 'add_subtitle_track_to_video',
			lang 		 	: text_area.dataset.lang,
			section_tipo 	: text_area.dataset.section_tipo,
			section_id 	 	: parseInt(text_area.dataset.parent),
			component_tipo 	: text_area.dataset.tipo,
		}
		//return 	console.log(trigger_vars);

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
							if(SHOW_DEBUG===true) {
								console.log(response);
							}
							
							if (!response) {
								console.log("NUll is received from add_subtitle_track_to_video");
								return false;
							}

							// Get current subtitles track and deletes always
							var subtitle_track 		= video_obj.querySelector('track')
								if (subtitle_track) {
									// Delete old track
									subtitle_track.parentNode.removeChild(subtitle_track)
								}

							// No subtitles found for current lang
							if (response.result===false) {
								return false;
							}else{
								// Avoid cache
								response.url = response.url + '?' + new Date().getTime()

								// Creates new track
								var new_track = document.createElement('track')
									new_track.label 	= response.lang_name
									new_track.srclang 	= response.lang
									new_track.src 		= response.url
									new_track.default	= ''

									// Add new track to video
									video_obj.appendChild(new_track)

								if(SHOW_DEBUG===true) {
									console.log("-> Added subtiltes track lang: \n"+response.url)
								}
							}													
						})

		return js_promise
	};//end add_subtitle_track_to_video





};//end tool_subtitles class
