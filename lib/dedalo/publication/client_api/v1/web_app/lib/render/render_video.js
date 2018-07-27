"use strict";



var render_video =  {

	
	load_video 	: function(button_obj, options) {

		if(SHOW_DEBUG===true) {
			console.log("options:",options); // return;
		}			

		var button_obj 	= options.button_obj || false
		var target_id 	= options.target_id || false
		var section_id 	= options.section_id || false
		// match. Array position in mathed rows
		var match 		= options.match || false
		// mode. search_free | null
		var mode 		= options.mode || false

		var video_container = document.getElementById(target_id)
			//video_container.style.paddingTop = "15px"
			//video_container.style.paddingBottom = "20px"
			video_container.innerHTML = '<div class="loading_video"> Loading... </div>'
	
		var q = document.getElementsByName("q")[0].value;

		var trigger_url  = page_globals.__WEB_ROOT_WEB__ + "/lib/render/trigger.render.php"
		var trigger_vars = {
			mode  			: "load_video_" + mode, // "load_video",
			q 				: q,
			lang 			: page_globals.WEB_CURRENT_LANG_CODE,
			section_id 		: section_id
		}
		if(SHOW_DEBUG===true) {
			console.log("[free_search.load_video] trigger_vars: ", trigger_url, trigger_vars); //return;
		}
	
		// Http request directly in javascript to the API is possible too..
		common.get_json_data(trigger_url, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[free_search.load_video] response:" , response);
				}

				video_container.innerHTML = ''
				
				if (!response) {
					
					console.warn("[free_search.load_video] Error. Received response data is null");
				
				}else{
			
					// Build video html and instert into video_container div
					// video_container.innerHTML = '<h4>Video player</h4><br>'
					var video = document.createElement("video")
						video.controls 	= true
						video.height 	= 404 
						video.src 		= page_globals.__WEB_BASE_URL__ + response.result[0].fragments[0].video_url
						video.poster 	= page_globals.__WEB_BASE_URL__ + response.result[0].image_url
					video_container.appendChild(video)
					// Build extended fragment text and instert into video_container div
					var fragment_text = document.createElement("div")
						fragment_text.innerHTML = '<h4>Fragment</h4>' + response.result[0].fragments[0].fragm
					video_container.appendChild(fragment_text)

					return {
						video : video,
						
					}
				}
		})
	},//end load_video
	


}//end render_video