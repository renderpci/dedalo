// JavaScript Document
var t 					= null ;	// window time interval
var video_current_state	= null ;	// current state (pause, play)
var tc_div_id			= 'TCdiv';	// div where show timecode like 00:12:32
var durationMinutos		= null;		//alert("Loaded media_player.js");


///////// KEY UP //////////////////
$(document).keyup(function(event) {
	
	// CONTROL VIDEO PLAY / PAUSE BY KEY 'ESC' (DEFAULT 27)	   
	if (event.which == parseInt(av_media_player_play_pause_key) ) {
		videoPlay(event)	//alert(event.which)		
	} 
	
	// PLAY PAUSE BY SPACEBAR KEY (32)
	/*if (event.which == 32) {
		player_toggle_play_pause() //alert(event.which)alert(event.which)		
	}*/

	// CREATE POSTERFRAME BY P KEY (80)
	if (event.which == 80) {
		if ($('.btn_posterframe').length>0) {
			$('.btn_posterframe').trigger('click');	
		}		
	}
	//alert(event.which)
});
///////// DOM READY //////////////////
$(function() {
	
	try{		
	
		switch(get_modo()) {			
						
			// QUICKTIME PLUG-IN
			case "qt"		: 	load_video_controls(); 
								break;
							
			// JWPLAYER
			case 'jwplayer' :	load_video_controls(); 
								break;
								
			// HTML5 STANDAR					
			case "html5"	:	set_and_load_media(src,0); // src defined in AVPlayer		  
								load_video_controls();															
								// SET LISTENER TO TRIGGER SHOW VIDEO CONTROLS ON VIDEO METADATA IS LOADED
								// loadeddata , loadedmetadata, canplay
								var listener_name = 'loadedmetadata'; 
								/*
								RegisterListener(listener_name, function(e) {
									load_video_controls();		//alert('launched listener: ' + listener_name )					
								});
								*/
								break;
			
			// MEDIAELEMENT PLAYER
			case "mediaelement":load_video_controls();
								break;
							
		}	
	
	}catch(err){
		if(DEBUG) $('#debugMovie').append("DEBUG: ready switch: " + err +"<br>");
		//alert('ready switch: ' + err);
	}	
	
	if(DEBUG) {
		$('#loading_msg').append(" [waiting event:" + listener_name + "] [preload:" + preload +"]" ) ;
		$('#debugMovie').css('visibility',"visible");
		//document.getElementById('debugMovie').style.visibility = "visible";
	}
	
	// BUTTON play / stop
	var button_play_pause_obj = $('.play_pause');
	$(document.body).on('click', button_play_pause_obj.selector, function(e){	
		player_toggle_play_pause()
	});

	// SET KEYS
	av_media_player.fix_keys();
	
});
///////// ON LOAD //////////////////
window.addEventListener("load", function (event) {
	
	try{
			
		switch(get_modo()) {
												
			// QUICKTIME PLUG-IN
			case "qt"		:	start_tc_generator();
								break;
			
			// JWPLAYER
			case 'jwplayer' :	//load_video_controls(); //alert(videoObj_selector().readyState)
								start_tc_generator();								
								break;
			
			// HTML5 STANDAR					
			case "html5"	:	start_tc_generator();
								break;
								
			// MEDIAELEMENT PLAYER
			case "mediaelement":start_tc_generator();
								break;	
		}
				
	}catch(err){
		if(DEBUG) $('#debugMovie').append("DEBUG: window.onload " + err +"<br>");
	}
	if(DEBUG) $('#debugMovie').append("DEBUG: modo: " + modo + "<br>");	
	if(DEBUG) console.log("-> window load completed ");
	
	update_button_play_pause_label();

	resize_window();

	
});


var av_media_player_play_pause_key 	= get_localStorage('av_playpause_key');
var av_media_player_insert_tc_key 	= get_localStorage('tag_insert_key');


var av_media_player = new function() {

	var default_av_media_player_play_pause_key 	= 27 ,	// ESC
		default_av_media_player_insert_tc_key	= 113 ;	// F2

	
	/**
	* FIX KEYS
	*/
	this.fix_keys = function() {

		if (av_media_player_play_pause_key==null) {
			av_media_player_play_pause_key = default_av_media_player_play_pause_key;	if(DEBUG) console.log("->fix_keys fixed play_pause: "+av_media_player_play_pause_key) ;
		};
		if (av_media_player_insert_tc_key==null) {
			av_media_player_insert_tc_key = default_av_media_player_insert_tc_key;		if(DEBUG) console.log("->fix_keys fixed insert_tc: "+av_media_player_insert_tc_key) ;
		};

		// KEYCODE VALUES SET TO INPUTS
		var key_string = String.fromCharCode(av_media_player_play_pause_key);	//alert(key_string + " for "+av_media_player_play_pause_key)
		$('input[name=play_pause]').val( av_media_player_play_pause_key);
		$('input[name=insert_tc]').val(av_media_player_insert_tc_key);

		// KEY CODE TO NAME SPAN INFO
		$('span.play_pause_name').first().text( keycode.getKeyCodeValue(av_media_player_play_pause_key) );
		$('span.insert_tc_name').first().text( keycode.getKeyCodeValue(av_media_player_insert_tc_key) );

		// SET HANDLER TO INPUTS
		$('input[name=play_pause]').keyup(function(event) {		   
			av_media_player_play_pause_key = event.which;
			$(this).val(av_media_player_play_pause_key).blur();			
			$('span.play_pause_name').first().text( keycode.getKeyCodeValue(av_media_player_play_pause_key) );
			// store cookie
			set_localStorage('av_playpause_key',av_media_player_play_pause_key);

			$(this).click(function() {
				$(this).select()
			});	
		})
		$('input[name=play_pause]').click(function() {$(this).select();});

		$('input[name=insert_tc]').keyup(function(event) {		   
			av_media_player_insert_tc_key = event.which;
			$(this).val(av_media_player_insert_tc_key).blur()
			$('span.insert_tc_name').first().text( keycode.getKeyCodeValue(av_media_player_insert_tc_key) );
			// store cookie
			set_localStorage('tag_insert_key',av_media_player_insert_tc_key);		
		})
		$('input[name=insert_tc]').click(function() {$(this).select();});
	}
	

	/**
	* KEYCODE OBJ
	*/
	var keycode = {
		
		getKeyCode : function(e) {
	        var keycode = null;
	        if(window.event) {
	            keycode = window.event.keyCode;
	        }else if(e) {
	            keycode = e.which;
	        }
	        return keycode;
	    },
	    getKeyCodeValue : function(keyCode, shiftKey) {
	        shiftKey = shiftKey || false;
	        var value = null;
	        if(shiftKey === true) {
	            value = this.modifiedByShift[keyCode];
	        }else {
	            value = this.keyCodeMap[keyCode];
	        }
	        return value;
	    },
	    getValueByEvent : function(e) {
	        return this.getKeyCodeValue(this.getKeyCode(e), e.shiftKey);
	    },
	    keyCodeMap : {
	        8:"backspace", 9:"tab", 13:"return", 16:"shift", 17:"ctrl", 18:"alt", 19:"pausebreak", 20:"capslock", 27:"escape", 32:" ", 33:"pageup",
	        34:"pagedown", 35:"end", 36:"home", 37:"left", 38:"up", 39:"right", 40:"down", 43:"+", 44:"printscreen", 45:"insert", 46:"delete",
	        48:"0", 49:"1", 50:"2", 51:"3", 52:"4", 53:"5", 54:"6", 55:"7", 56:"8", 57:"9", 59:";",
	        61:"=", 65:"a", 66:"b", 67:"c", 68:"d", 69:"e", 70:"f", 71:"g", 72:"h", 73:"i", 74:"j", 75:"k", 76:"l",
	        77:"m", 78:"n", 79:"o", 80:"p", 81:"q", 82:"r", 83:"s", 84:"t", 85:"u", 86:"v", 87:"w", 88:"x", 89:"y", 90:"z",
	        96:"0", 97:"1", 98:"2", 99:"3", 100:"4", 101:"5", 102:"6", 103:"7", 104:"8", 105:"9",
	        106: "*", 107:"+", 109:"-", 110:".", 111: "/",
	        112:"f1", 113:"f2", 114:"f3", 115:"f4", 116:"f5", 117:"f6", 118:"f7", 119:"f8", 120:"f9", 121:"f10", 122:"f11", 123:"f12",
	        144:"numlock", 145:"scrolllock", 186:";", 187:"=", 188:",", 189:"-", 190:".", 191:"/", 192:"`", 219:"[", 220:"\\", 221:"]", 222:"'"
	    },
	    modifiedByShift : {
	        192:"~", 48:")", 49:"!", 50:"@", 51:"#", 52:"$", 53:"%", 54:"^", 55:"&", 56:"*", 57:"(", 109:"_", 61:"+",
	        219:"{", 221:"}", 220:"|", 59:":", 222:"\"", 188:"<", 189:">", 191:"?",
	        96:"insert", 97:"end", 98:"down", 99:"pagedown", 100:"left", 102:"right", 103:"home", 104:"up", 105:"pageup"
	    }
	};//end keycode obj


	this.toggle_config_player_content = function() {
		$(".config_player_content").fadeToggle("fast",function(){
			resize_window()
		});
	}


}//end av_media_player class







function resize_window() {
	
	var alturaOffset  = 80 ;
	var anchuraOffset = 10 ;
	
	// solo firefox y chrome
	if (navigator.userAgent.indexOf('Firefox') != -1 || navigator.userAgent.indexOf('Chrome') != -1){ alturaOffset = 89 ; anchuraOffset = 15 ; }	
	
	//var w = document.getElementById('wrapGeneral').offsetWidth + anchuraOffset ;
	//var h = document.getElementById('wrapGeneral').offsetHeight + alturaOffset ;
	var w = $('#wrap_edit_video').width()  + anchuraOffset
	var h = $('#wrap_edit_video').height() + alturaOffset ;		//alert(w + " "+ h);
	
	window.resizeTo(w, h);
}



// SET AND LOCATE MEDIA
function set_and_load_media(src_target, play, exec_load) {	
	
	if( videoObj_selector() ) {
		
		videoObj_selector().setAttribute("src", src_target);	//alert(src_target)	// src defined in AVPlayer		  
		
		if(exec_load==1)
		videoObj_selector().load();
		
		//videoObj_selector().setAttribute("controls","controls");
		if(play==1) player_play(videoObj_selector());
		
	}else{
		$('#loading_msg').append(" Error on set_and_load_media " ) ;	
	}
}


// LOAD VIDEO CONTROLS
function load_video_controls() {
	
	document.getElementById(tc_div_id).innerHTML = '00:00:00';
	
	$('#loading_msg').fadeOut(300, function() {
									
									$('#video_controls').fadeIn(600, function() {
			
										// GET DURATION OF MOVIE
										get_movie_duration();

										// SET PAGE GLOBALS	video_duration_secs						
										top.page_globals.video_duration_secs = parseInt(videoObj_selector().duration);
										if (top.DEBUG) {
											console.log("video_duration_secs: "+top.page_globals.video_duration_secs);
										}
										
										// GO TO TIME IF EXISTS TCIN			
										if(tcin && tcin!=-1) goto_time(tcin);
										
										// STATE VIDEO CONTROLS LOADED								
										video_controls_loaded = true;
									});

	}).remove();
	if(top.DEBUG) console.log("-> load_video_controls completed");		
}



// GET CURRENT MODO (html5,qt,flash)
function get_modo() {
	
	var modo_default = 'html5';
	
	if( typeof modo=='undefined' || !modo || modo==null ) {
		$('#debugMovie').append("DEBUG: get_modo: modo if not defined! Set default ("+modo_default+")<br>");
		return modo_default;
	}
	return modo ;
}



// CONTROL VIDEO FROM BUTTONS VIDEO BELOW
function controlVideo(action) {
	
	var videoObj = videoObj_selector();		//alert('videoObj: ' + videoObj + ' ' +action)
	
	try {			 
		if(action=='play') {
			
			player_play(videoObj);
						
		}else if(action=='pause') {	
					
			player_pause(videoObj);	
			
		}else{
			
			var seconds = parseFloat(action);
			player_seek_seconds(videoObj,seconds);			
		}
			
	}catch(err){		
		
		if(DEBUG)
		$('#debugMovie').append("DEBUG: controlVideo: " + err + " - " +videoObj + '<br>');
		
		alert("Media is not accessible.");		
	}	
}

// UPDATE LABEL BUTTON PLAY-PAUSE
function update_button_play_pause_label() {
	
	var state = player_get_video_current_state();
		
	switch(state) {
		
		case 'play'		:	$('.play_pause').html('Stop');	break;
		case 'pause'	:	$('.play_pause').html('Play');	break;
		default			:	$('.play_pause').html('Play');	break;	
	}	
	if(DEBUG) console.log("-> state: " +state);		
}


// CONTROL VIDEO FROM TEXT EDITOR TINYMCE
function videoPlay(e) {
	
	try{		
				
		var keyCode		= e.keyCode ;		//alert('videoPlay:' + e)			
		
		// TINYMCE KEY ESC
		//if(keyCode=="27") { // caracter: ESC				
			
			var current_state 			= player_get_video_current_state(),
				videoObj				= videoObj_selector(),
				av_rewind_secs_cookie 	= get_localStorage('av_rewind_secs')

			var secs_val = av_rewind_secs_cookie ? av_rewind_secs_cookie : 3; // Default 3 sec
			var seconds  = -Math.abs(secs_val); // To negative value
				//console.log(seconds);
			
			if(current_state=='play'){									
				player_pause(videoObj);		//if(DEBUG) console.log(myVideo.paused)
				player_seek_seconds(videoObj,seconds);			
			}else{
				player_play(videoObj);		//if(DEBUG) console.log(videoObj.paused);		
			}
			return;				
		//}// caracter: ESC (27) fin	
		
	
	}catch(error){
		$('#debugMovie').append("DEBUG: videoPlay: " + error +'<br>');
	}
	if(DEBUG) console.log("->videoPlay called keyCode: "+keyCode)	
}

// GET_AND_WRITE_TC_TAG (TINYMCE KEY F2 char 113)
function get_and_write_tc_tag(e) {	
	
	// FRAME PLAYER
	var video_frame_obj = top.videoFrame;
	if ( $(video_frame_obj).length<1 ) {
		return alert("Error on read TC. 'videoFrame' is not available");
	}	
		// leemos el código de tiempo actual del movie
		var tc = top.videoFrame.tcEtiqueta ;
		if(tc=='0') tc = '00:00:00';
	
	// TEXT EDITOR
	var ed = top.tinyMCE.activeEditor ;	
	if ( $(ed).length<1 ) {
		return alert("Error on access text editor. 'activeEditor' is not available");
	}	
		// componemos y escribimos la etiqueta en la posición actual del cursor
		//ed.selection.setContent(' <img id="[TC_'+tc+'_TC]" src="../../../inc/btn.php?t=[TC_'+tc+'_TC]" class="tc" /> ' );
		var img_html = top.component_text_area.build_tc_img(tc);
		ed.selection.setContent( img_html );
	
	if(DEBUG) console.log("->get_and_write_tc_tag: "+img_html);
	return true;
}




var last_secs = {};
function seconds_to_TIMECODE( secs ) {

	// If is already calculated, return value (avoid calculate more than once for second)
	if (last_secs.secs==secs) {
		return last_secs.TIMECODE
	}

	var sec_num = parseInt(secs, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    var time    = hours+':'+minutes+':'+seconds;

	// Overwrite and store var last_secs  
    last_secs = {
    	'secs'  : secs,
    	'TIMECODE' : time
    }

    //console.log(secs+" - "+time); //console.log(last_secs);
    return time;
}

// WRITE CURRENT TC IN TARGET DIV 
function write_current_tc() {
		
	try{			
		
		var videoObj 				= videoObj_selector();		
		var target_div 				= document.getElementById(tc_div_id);
		var current_time_in_seconds = parseInt( player_get_current_time_in_seconds(videoObj) );
			
		
		if(current_time_in_seconds != null) {
			/*
				var tcs  		= current_time_in_seconds ;
				
				var tcm 		= tcs/60 ; tcm.toFixed(2);	
				var tcmE 		= parseInt(tcm);	
				var tcmRestos 	= tcm - tcmE ;
				var segundos 	= Math.round(tcmRestos*60);
				
				var tch 		= tcs/3600 ; tch.toFixed(4);	
				var tchE 		= parseInt(tch);
				var tchRestos 	= tch - tchE ;
				var minutos 	= parseInt(tchRestos*60)
				var horas 		= parseInt(tchE) ;
				
				if (horas < 0 	|| horas >59) 		horas 	 = 0;
				if (minutos < 0	|| minutos >59) 	minutos  = 0;
				if (segundos < 0|| segundos >59) 	segundos = 0;
				
				if(horas<10)	horas 		= "0" + horas;
				if(minutos<10)	minutos 	= "0" + minutos;		
				if(segundos<10)	segundos	= "0" + segundos;
				
				tcEtiqueta = horas + ':' + minutos + ':' +  segundos ;
				*/
			
			tcEtiqueta = seconds_to_TIMECODE(current_time_in_seconds);				
			
			if(tcEtiqueta!=-1 && tcEtiqueta!=null){
				target_div.innerHTML = tcEtiqueta ;				//if(DEBUG) div.innerHTML += " [" + i++ + "]";
				return true;
			}else{					
				target_div.innerHTML = '00:00:00' ;
				return true;
			}
												
		}//if(current_time_in_seconds>0)		
		
	}catch(err){ 
		window.clearInterval(t);
		document.getElementById('debugMovie').innerHTML += "DEBUG: Error in write_current_tc:  " + err +'<br>';		
		console.log(err);
	}
}




// EVENT LOG
function event_log() {
		
	//var ar_listener = Array('canplay','canplaythrough','durationchange','ended','loadeddata','loadedmetadata','loadstart','progress','waiting');
	var ar_listener = Array('canplay','canplaythrough','loadeddata','loadedmetadata');
	
	for(var i=0;i<ar_listener.length;i++) {
	
		var listener = ar_listener[i];	
		
		RegisterListener(listener, function(e) {
			$('#debugMovie').append(" - " + listener + " ") ;
			$('#debugMovie').append("[" + listener + "]") ;	
			$('#debugMovie').append("<br />");		
		});/**/		
		
	}
}


// GET CURRENT TIME VALUE FROM TC DIV
function get_current_time_div_value() {	
	//return $(tc_div_id).html();
	return $('#TCdiv').html();
}


// GO TO TIMECODE (USED IN TINYMCE TEXT EDITOR)
function goto_time(timecode) {	
	return player_goto_timecode(videoObj_selector(),timecode);
}




// HTML5 VIDEO mensaje en caso de fallo
function failed(e) {
	
	//if(nivel != 11) return null;
	
	// video playback failed - show a message saying why
	switch (e.target.error.code) {
	 
		case e.target.error.MEDIA_ERR_ABORTED:
		   //if(nivel == 10) alert('Admin: You aborted the video playback.');
		   console.log("-> failed:  MEDIA_ERR_ABORTED");
		   break;
		 
		case e.target.error.MEDIA_ERR_NETWORK:
		   //if(nivel == 10) alert('Admin: A network error caused the video download to fail part-way.');
		   console.log("-> failed:  MEDIA_ERR_NETWORK");
		   break;
		 
		case e.target.error.MEDIA_ERR_DECODE:
		   //if(nivel == 10) alert('Admin: The video playback was aborted due to a corruption problem or because the video used features your browser did not support.');
		   console.log("-> failed:  MEDIA_ERR_DECODE");
		   break;
		   
		case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
			//if(nivel == 10)	alert('Admin: The video could not be loaded, either because the server or network failed or because the format is not supported.');
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
}
 

// LOAD PLAYER BY TYPE
function load_player_type(type) {
	
	var current_url 	= window.location.href ;
	
	var ar_current_url	= current_url.split('&');
	
	var string_final 	= new String("");
	
	for(var i=0;i<ar_current_url.length;i++) {
		
		var fragment = ar_current_url[i];//alert(fragment)
		if( fragment.indexOf("player_type") == -1 ) {
			string_final +=  ar_current_url[i] + '&';
		}
	}
	
	var final_url	= string_final + "player_type=" + type ;//alert(current_url + " - " + string_final);
		
	window.location	= final_url;	
}

// REMOVE BACKGROUND
function remove_background() {
		
	$('body').css({ 'background-image': 'none !important','background-color': 'transparent !important' });
}


// LOAD PLAYER COMMANDS
//document.write('<script type="text/javascript" src="../media_engine/js/player_commands.js"><\/script>');

// EVENTS <VIDEO> INFO . http://dev.w3.org/html5/spec/webappapis.html#handler-oncanplay


// Quicktime DOM events ////////////////////////////////////////////
// More info in 
// http://developer.apple.com/library/mac/#documentation/QuickTime/Conceptual/QTScripting_JavaScript/bQTScripting_JavaScri_Document/QuickTimeandJavaScri.html#//apple_ref/doc/uid/TP40001526-CH001-SW5
////////////////////////////////////////////////////////////////////



/* PARÁMETROS DOM QUICKTIME PLUG-IN (http://developer.apple.com/library/mac/#documentation/QuickTime/Conceptual/QTScripting_JavaScript/bQTScripting_JavaScri_Document/QuickTimeandJavaScri.html) 

      qt_begin — The plug in has been instantiated and can interact with JavaScript.

      qt_loadedmetadata — The movie header information has been loaded or created. The duration, dimensions, looping state, and so on are now known.   

      qt_loadedfirstframe — The first frame of the movie has been loaded and can be displayed. (The frame is displayed automatically at this point.)  

      qt_canplay — Enough media data has been loaded to begin playback (but not necessarily enough to play the entire file without pausing).   

      qt_canplaythrough — Enough media data has been loaded to play through to the end of the file without having to pause to buffer, assuming data continues to come in at the current rate or faster. (If the movie is set to autoplay, it will begin playing now.)

      qt_durationchange — The media file's duration is available or has changed. (A streaming movie, a SMIL movie, or a movie with a QTNEXT attribute may load multiple media segments or additional movies, causing a duration change.)

      qt_load — All media data has been loaded.

      qt_ended — Playback has stopped because end of the file was reached. (If the movie is set to loop, this event will not occur.)

      qt_error — An error occurred while loading the file. No more data will be loaded.

      qt_pause — Playback has paused. (This happens when the user presses the pause button before the movie ends.)

      qt_play — Playback has begun.

      qt_progress — More media data has been loaded. This event is fired no more than three times per second.

      				This event occurs repeatedly until the qt_load event or qt_error event. The last progress event may or may not coincide with the loading of the last media data. Use the progress function to monitor progress, but do not rely on it to determine whether the movie is completely loaded. Use the qt_load function in conjunction with the qt_progress function to monitor load progress and determine when loading is complete.

      qt_waiting — Playback has stopped because no more media data is available, but more data is expected. (This usually occurs if the user presses the play button prior to the qt_canplaythrough event. It can also occur if the data throughput slows during movie playback, and the buffer runs dry.)

      qt_stalled — No media has been received for approximately three seconds.

      qt_timechanged — The current time has been changed (current time is indicated by the position of the playhead).

      qt_volumechange — The audio volume or mute attribute has changed.
*/