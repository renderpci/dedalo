"use strict";
/**
* TOOL_SUBTITLES
*
*
*/
var tool_subtitles = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_subtitles/trigger.tool_subtitles.php' ;

	
	//$(function(){
	window.ready(function(){

		$('#tool_subtitles_line_lenght').keypress(function(event){
		    let keycode = (event.keyCode ? event.keyCode : event.which);
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


	
	/**
	* BUILD_SUBTITLES_TEXT
	*/
	this.build_subtitles_text = function(button_obj) {

		let section_tipo 		= button_obj.dataset.section_tipo
		let section_id 			= button_obj.dataset.section_id
		let component_tipo 		= button_obj.dataset.component_tipo
		let line_lenght 		= document.getElementById("tool_subtitles_line_lenght").value	//$('#tool_subtitles_line_lenght').val()
		//let video_duration_secs = page_globals.video_duration_secs

		let wrap = document.querySelector('.text_area_tool_transcription');
			if (!wrap) {
				return alert("[tool_subtitles.build_subtitles_text] Error on locate text area wrapper")
			} 
		let lang = wrap.dataset.lang
		
		let trigger_vars = {  
					mode 				: 'build_subtitles_text',
					section_tipo 		: section_tipo,
					section_id 			: section_id ,
					component_tipo 		: component_tipo,
					line_lenght 		: line_lenght,
					//video_duration_secs : video_duration_secs,
					top_tipo 			: page_globals.top_tipo,
					lang 				: lang
			}
			//return console.log("[tool_subtitles.build_subtitles_text] trigger_vars",trigger_vars);

		let target_div = document.getElementById('subtitles_response')

		html_page.loading_content( target_div, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[tool_subtitles.build_subtitles_text] response", response);
				}
				
				if (response) {
					
					if (response.result===true && response.url) {

						target_div.innerHTML = response.msg

						var windowObjectReference;
						var strWindowFeatures = "menubar=no,location=yes,resizable=yes,scrollbars=yes,status=yes";
						windowObjectReference = window.open(response.url, "Subtitle", strWindowFeatures);

						// Add created subtitles to video
						tool_subtitles.add_subtitle_track_to_video()

					}else{
						let msg = "<span class='error'>Error when build_subtitles_text: \n" + response.msg + "</span>" ;
						target_div.innerHTML = msg
					}

				}else{
					console.log("[tool_subtitles.build_subtitles_text] NUll is received");
				}

		}, function(error) {
			console.log("[tool_subtitles.build_subtitles_text] error",error)
		})


		return js_promise
	}//end build_subtitles_text



	/**
	* ADD_SUBTITLE_TRACK_TO_VIDEO
	* @return 
	*/
	this.add_subtitle_track_to_video = function() {

		var text_area 		= document.querySelector('.text_area_tool_transcription');
			if (!text_area) {
				console.log("[tool_subtitles.add_subtitle_track_to_video] Error on get text area element in DOM", text_area);
				return false;
			}

		var videoFrame	= document.getElementById('videoFrame');
		var video_obj	= videoFrame.contentWindow.document.querySelector('video');
			if (!video_obj) {
				console.log("[tool_subtitles.add_subtitle_track_to_video] Error on get text video element in DOM", video_obj);
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
					console.log("[tool_subtitles.add_subtitle_track_to_video] response", response);
				}
				
				if (response) {
					
					// Get current subtitles track and deletes always
					var subtitle_track = video_obj.querySelector('track')
						if (subtitle_track) {
							// Delete old track
							subtitle_track.parentNode.removeChild(subtitle_track)
						}

					// No subtitles found for current lang
					if (response.result===true) {
					
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
							console.log("[tool_subtitles.add_subtitle_track_to_video] -> Added subtiltes track lang: \n", response.url)
						}
					}else{
						if(SHOW_DEBUG===true) {
							//console.warn("[tool_subtitles.add_subtitle_track_to_video] ", response.msg)
						}
					}
				}else{
					console.error("[tool_subtitles.add_subtitle_track_to_video] NUll is received from add_subtitle_track_to_video");
				}

		}, function(error) {
			console.log("[tool_subtitles.add_subtitle_track_to_video] error",error)
		})


		return js_promise
	};//end add_subtitle_track_to_video





};//end tool_subtitles class