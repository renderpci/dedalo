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



	this.video_play_toggle = function (video_obj) {
       if (video_obj.paused) {
          video_obj.play();
          //button.textContent = "||";
       } else {
          video_obj.pause();
          //button.textContent = ">";
       }
    };


		
}//end component_av