/**
* COMPONENT_AV
*
*
*
*/
var component_av = new function() {


	// URL TRIGGER
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_av/trigger.component_av.php';



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init


	
	/**
	* PLAYER_GET_CURRENT_TIME_IN_SECONDS
	* Alias of AVPlayer function player_get_current_time_in_seconds inside iframe '#videoFrame'
	*/
	this.player_get_current_time_in_seconds = function(){
		return videoFrame.player_get_current_time_in_seconds();
	};



	/**
	* HTML5 VIDEO FAILED . Mensaje en caso de fallo
	*/
	this.failed = function(e) {

		// video playback failed - show a message saying why
		switch (e.target.error.code) {

			case e.target.error.MEDIA_ERR_ABORTED:
				if(SHOW_DEBUG===true) alert('Admin: You aborted the video playback.');
				console.log("-> failed:  MEDIA_ERR_ABORTED");
				break;

			case e.target.error.MEDIA_ERR_NETWORK:
				if(SHOW_DEBUG===true) alert('Admin: A network error caused the video download to fail part-way.');
				console.log("-> failed:  MEDIA_ERR_NETWORK");
				break;

			case e.target.error.MEDIA_ERR_DECODE:
				if(SHOW_DEBUG===true) alert('Admin: The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
				console.log("-> failed:  MEDIA_ERR_DECODE");
				break;

			case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
				if(SHOW_DEBUG===true)	alert('Admin: The video could not be loaded, either because the server or network failed or because the format is not supported.');
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



	this.video_play_toggle = function (video_obj) {
       if (video_obj.paused) {
          video_obj.play();
          //button.textContent = "||";
       } else {
          video_obj.pause();
          //button.textContent = ">";
       }
    };



    /**
    * GET_VIDEO_STREAMS_INFO
    * @return 
    */
    this.get_video_streams_info = function(video_path, target_id) {

    	var trigger_vars = {
    		mode 		: 'get_video_streams_info',
    		video_path 	: video_path
    	}

    	var video_info = document.getElementById(target_id)
    		video_info.style.display = ""    
    		video_info.innerHTML 	 = "Loading.."

    	common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
    		if(SHOW_DEBUG===true) {
    			console.log("[component_av.get_video_streams_info] response",response)
    		}
    		
    		if (response && response.result) {    			
    			
    			video_info.innerHTML = JSON.stringify(response.result, null, 2)

    		}else{
    			console.log("[get_video_streams_info] Error on get_video_streams_info. " , response);
    		}
    	})
    };//end get_video_streams_info


		
}//end component_av