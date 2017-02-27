// JavaScript Document

var nivel = 0;
if(DEBUG) {
	nivel=10;
}

// VIDEO OBJ SELECTOR
function videoObj_selector() {
	
	var videoObj = null;
	
	switch( get_modo() ) {
				
		// QUICKTIME PLUG-IN
		case "qt"		: 	videoObj	= document.getElementById(playerID);
							if( videoObj=='undefined' || videoObj==-1 || videoObj==null ) videoObj = document.getElementById('videoObj');
							break;							
		
		// JWPLAYER
		case "jwplayer"	: 	//videoObj 	= document.getElementsByTagName('video')[0];	//alert(videoObj)
							videoObj 	= jwplayer('wrap_'+playerID);
							break;	
		
		// HTML5 STANDAR					
		case "html5"	: 	videoObj 	= document.getElementsByTagName('video')[0];
							break;
							
		// MEDIAELEMENT PLAYER
		case "mediaelement":videoObj 	= document.getElementsByTagName('video')[0];
							if( videoObj=='undefined' || videoObj==-1 || videoObj==null ) videoObj = document.getElementById(playerID);
							break;
							
		default			:	alert("modo is not defined ! [videoObj_selector] ");		
													
	}
	
	if( videoObj=='undefined' || videoObj==-1 || videoObj==null ) {
		$('#debugMovie').append("DEBUG: ERROR videoObj not found: " + videoObj + ' - modo:' + get_modo() +'<br>' );
		return null;
	}
	
	return videoObj ;	
};

// PLAY
function player_play(videoObj) {
	
	if(videoObj==null) videoObj = videoObj_selector();		//alert("modo: "+ get_modo() );
	
	switch( get_modo() ) {
				
		// QUICKTIME PLUG-IN
		case "qt"		: 	videoObj.Play();
							start_tc_generator();
							break;							
		
		// JWPLAYER
		case "jwplayer"	: 	videoObj.play();							
							break;	
		
		// HTML5 STANDAR					
		case "html5"	: 	videoObj.play();
							break;
							
		// MEDIAELEMENT PLAYER
		case "mediaelement":if(!videoObj.play()) $(videoObj).each(function() { $(this)[0].player.play(); });								
							break;
													
	}
	
	video_current_state = 'play';	//console.log(videoObj +" " + video_current_state);	//alert(video_current_state)
	update_button_play_pause_label()
};

// PAUSE
function player_pause(videoObj) {
	
	if(videoObj==null) videoObj = videoObj_selector();
	
	switch( get_modo() ) {
				
		// QUICKTIME PLUG-IN
		case "qt"		:	videoObj.Stop();	
							window.clearInterval(t);
							break;
		
		// JWPLAYER
		case "jwplayer"	:	videoObj.pause();
							break;		
		
		// HTML5 STANDAR
		case "html5"	: 	videoObj.pause();		
							break;		
		
		// MEDIAELEMENT PLAYER
		case "mediaelement":if(!videoObj.pause()) $(videoObj).each(function() { $(this)[0].player.pause(); });
							break;
	}
	
	video_current_state = 'pause';	//console.log(videoObj +" " + video_current_state);	//alert(video_current_state)
	update_button_play_pause_label()
};


// GOTO TIMECODE USED BY TINYMCE TC TAGS AND TCIN JUMP
function player_goto_timecode(videoObj, timecode, timecode_in_seconds) {
	
	if(videoObj==null) 
	var videoObj 	= videoObj_selector();
	
	if(timecode_in_seconds>0) {
		var seconds 	= parseFloat(timecode_in_seconds);		
	}else{
		var seconds 	= parseFloat(tc2secs(timecode));
	}
	
	//console.log("player_goto_timecode: timecode: "+ timecode + " - seconds: " + seconds);	
	
	try {
		switch( get_modo() ) {
				
			// QUICKTIME PLUG-IN
			case "qt"		: 	var tics = seconds * videoObj.GetTimeScale();	
								videoObj.SetTime( tics );			//alert("tc:"+ tc + "\nsecs:" + seconds + "\ntics:" + tics );
								write_current_tc();
								break;	
			
			// JWPLAYER
			case "jwplayer"	:	videoObj.seek( Math.round(seconds) );
								console.log('-> Saltado a '+  Math.round(seconds) + ' [player_goto_timecode jwplayer]');
								break;
			
			// HTML5 STANDAR
			case "html5"	:	videoObj.currentTime = seconds;
								console.log('-> Saltado a '+  seconds + ' [player_goto_timecode html5]' );
								break;
			
			// MEDIAELEMENT PLAYER
			case "mediaelement":/*RegisterListener('loadedmetadata', videoObj.setCurrentTime(seconds));*/								
								videoObj.addEventListener('loadedmetadata', function(e) {             
									videoObj.setCurrentTime(seconds); //alert("Not implemented catch here");
								}, false);										
								break;				
		}
		return true;		
			
	}catch(err){
		
		switch( get_modo() ) {
			
			// QUICKTIME PLUG-IN					
			case "qt"		:	window.setTimeout(function(e){
									player_goto_timecode(videoObj,timecode);
								},1000);
								return;
			
			// JWPLAYER
			case "jwplayer"	:	alert("Not implemented catch here for jwplayer");
								break;
													
			// HTML5 STANDAR
			case "html5"	:	if(!videoObj.readyState || videoObj.readyState < 3) {
									player_play(videoObj);
									RegisterListener('canplay', function(e) {
																	videoObj.currentTime = seconds;	//alert(e)
																});
								}else{
									videoObj.currentTime = seconds;	
								}								
								return;
								
			// MEDIAELEMENT PLAYER
			case "mediaelement":/*RegisterListener('canplay', videoObj.setCurrentTime(seconds));*/								
								videoObj.addEventListener('canplay', function(e) {             
									videoObj.setCurrentTime(seconds); //alert("Not implemented catch here");
								}, false);
								break;			
						
		}								
		if(nivel==10)  $('#debugMovie').append("player_goto_timecode: " + err +'<br>');
		
	}	//console.log('-> player_goto_timecode: '+ timecode);
};


// GOTO TIMECODE USED BY BUTTON CONTROLS
function player_seek_seconds(videoObj,seconds) {
	
	if(videoObj==null) 
	var videoObj 	= videoObj_selector();
	var seconds 	= parseFloat(seconds);
	
	try {		
		switch( get_modo() ) {	
			
			// QUICKTIME PLUG-IN										
			case "qt"		: 	var tics = seconds * videoObj.GetTimeScale();
								if( (videoObj.GetTime() + tics) <0) {
									videoObj.SetTime('0');
								}else{
									videoObj.SetTime( videoObj.GetTime() + tics );	
								}
								write_current_tc();
								break;
								
			// JWPLAYER
			case "jwplayer"	:	videoObj.seek( Math.round( videoObj.getPosition() + seconds ) );
								break;
			
			// HTML5 STANDAR
			case "html5"	:	//videoObj.currentTime = Math.round(videoObj.currentTime + seconds);
								videoObj.currentTime = parseFloat(videoObj.currentTime + seconds);
								break;								
			
			// MEDIAELEMENT PLAYER
			case "mediaelement":videoObj.setCurrentTime( Math.round(videoObj.currentTime + seconds) );	
								break;
		}
		//console.log("player_seek_seconds " + seconds);
	}catch(err){
		
		if(nivel==10) $('#debugMovie').append("DEBUG: player_seek_seconds: " + err +'<br>')				
	}
};


// GET CURRENT TIME IN SECONDS
function player_get_current_time_in_seconds(videoObj) {
	
	if(videoObj==null) 
	var videoObj 				= videoObj_selector();
	var current_time_in_seconds = null;
	
	try {
		switch( get_modo() ) {
					
			// QUICKTIME PLUG-IN
			case "qt"		:	var time_units			= videoObj.GetTime();		//alert(time_units)// get time in tics	
								current_time_in_seconds	= parseInt(time_units / videoObj.GetTimeScale()) ;
								break;
								
			// HTML5 STANDAR
			case "html5"	:	current_time_in_seconds	= parseFloat(videoObj.currentTime);	
								break;
													
			// JWPLAYER
			case "jwplayer"	: 	current_time_in_seconds	= parseInt(videoObj.getPosition()); //alert(videoObj.getPosition())
								//$('#debugMovie').append("DEBUG: current_time_in_seconds: " + parseInt( videoObj.getPosition()) +'<br>');							
								break;
								
			// MEDIAELEMENT PLAYER
			case "mediaelement":current_time_in_seconds	= parseInt(videoObj.currentTime) ; //alert(current_time_in_seconds);								
								break;
									
		} //console.log(videoObj +" " + current_time_in_seconds);
		//if(nivel==10) $('#debugMovie').append("DEBUG: current_time_in_seconds: " + current_time_in_seconds +'<br>')
		return(current_time_in_seconds);
		
	}catch(err){
		
		if(nivel==10) $('#debugMovie').append("DEBUG: Error current_time_in_seconds: " + err +'<br>')				
	}	
};


	
// START TC GENERATOR
function start_tc_generator() {
	
	try{
		$('#debugMovie').append('DEBUG: start_tc_generator: started <br>');
					
		switch( get_modo() ) {
				
			// QUICKTIME PLUG-IN
			case "qt"		:	if(t!=null) window.clearInterval(t);	// eliminamos el intervalo si estuviera activo			
								var videoObj = videoObj_selector();		// alert("start_tc_generator")
								var status	 = null;										
								if(videoObj.GetPluginStatus()) status = videoObj.GetPluginStatus();	//alert(status)
								if(status!='Complete' && status!='Playable') {				
									setTimeout(function() {
										start_tc_generator();				  			 
									}, 1000);
									return;
								}
								// ejecutamos el generador y lector de tc cada 1000 ms
								t = window.setInterval(function() {
									var tc = write_current_tc();
									if(!tc || tc==-1) window.clearInterval(t);
								},1000);								
								break;
			
			// HTML5 STANDAR					
			case "html5"	:	RegisterListener('timeupdate', write_current_tc);
								break;											
			
			// JWPLAYER					
			case "jwplayer"	:	videoObj_selector().onTime( function() {
									write_current_tc();	//$('#debugMovie').append("DEBUG: start_tc_generator: <br>");	
								});
								break;
			
			// MEDIAELEMENT PLAYER
			case "mediaelement":RegisterListener('timeupdate', write_current_tc);	//alert("not implemented ! (start_tc_generator)");
								/*
								videoObj.addEventListener('timeupdate', function(e) {             
									write_current_tc();
								}, false);
								*/																
								break;								
		}				
		
	}catch(err){
		if(nivel==10) $('#debugMovie').append('DEBUG: start_tc_generator: ' + err +'<br>');		
		alert("Video is not accessible. Press 'Play' to load (start_tc_generator)");			
	}	
};


// GET MOVIE DURATION
// RESET VALUES
var durationMinutos	= null;
var durationSecs	= null;
function get_movie_duration() {
		
	//var durationMinutos = null;
	var videoObj = videoObj_selector();
	
	try {
		
		switch( get_modo() ) {	
				
			// QUICKTIME PLUG-IN		
			case "qt"		:	if( videoObj.GetDuration() ) {
										
										var duration	= videoObj.GetDuration();
										var timeScale	= videoObj.GetTimeScale(); 		//alert("duration:"+duration + " - timeScale:" +timeScale)
										
										if(duration==2147483647 && timeScale==600 && isInitmovie==0) {
											isInitmovie = 1 ;
											window.setTimeout(function(){ 
																	getMovieDuration();
															  },2000);
											$('#debugMovie').append(" received init movie... try again" +'<br>');
											return false;	
										}else if(duration && timeScale) {					
											durationMinutos = parseInt( (duration / timeScale) / 60 );										
										}								
								}else{
									$('#debugMovie').append("DEBUG: Duration: videoObj not found!" +'<br>');
									alert("videoObj not found!");	
								}
								break;
								
			// HTML5 STANDAR
			case "html5"	:	function html5_get_duration() {
				
									// Set global var durationSecs
									durationSecs = parseInt(videoObj_selector().duration);
									
									return parseInt(parseFloat(videoObj_selector().duration) / 60);
								}
								if(videoObj_selector().readyState>0) durationMinutos = html5_get_duration();														
								//RegisterListener('loadedmetadata', html5_get_duration );																											
								break;
								
			// JWPLAYER					
			case "jwplayer"	:	//videoObj.onPlay(function() {									
									
									if(durationMinutos==null) {									
										var duration	= videoObj.getDuration();	//alert("duration: "+duration)										
										durationMinutos	= parseInt( duration / 60 );
										//$('#debugMovie').append( "durationMinutos: " + durationMinutos + " min" +'<br>');
									}
									if(durationSecs==null) {									
										var duration	= videoObj.getDuration();	//alert("duration: "+duration)
										durationSecs	= parseInt(duration);
										//$('#debugMovie').append( "durationSecs: " + durationSecs + " secs" +'<br>');
									}									
									
								//});
											
								break;
								
			// MEDIAELEMENT PLAYER					
			case "mediaelement":videoObj_selector().addEventListener('loadedmetadata', function(e) {
									durationMinutos = parseInt(parseFloat(videoObj_selector().duration) / 60) ;
								}, false);
								break;			
		}
	
	}catch(err){
		if(nivel==10) $('#debugMovie').append("DEBUG: ERROR getMovieDuration: " + err +'<br>');
	}
	
	$('#debugMovie').append( "Duration [get_movie_duration]: " + durationMinutos + " min" + ' / ' + durationSecs + 'secs <br>');	//alert(durationMinutos)
	//console.log("-> get_movie_duration:"+ durationMinutos + ' / ' +durationSecs);
	return durationMinutos ;		
};



// TC 2 SECONDS . CONVERT TC LIKE 00:12:19.878 TO TOTAL SECONDS LIKE 139.878	
function tc2secs(tc) {	
	if(is_int(tc)) return tc ;
	
	//var tc = "00:09:52.432";	
	var total_segundos;
	var ar 		= tc.split(":");
	var ar_ms 	= tc.split(".");
		
	var horas 		= 0;	if(parseFloat(ar[0])>0) horas		= parseFloat(ar[0]);
	var minutos 	= 0;	if(parseFloat(ar[1])>0) minutos 	= parseFloat(ar[1]);
	var segundos	= 0;	if(parseFloat(ar[2])>0) segundos 	= parseFloat(ar[2]);
	var mseconds	= 0;	if(parseFloat(ar_ms[1])>0) mseconds = parseFloat(ar_ms[1]);
	
	var total_segundos 		= parseFloat( (horas * 3600) + (minutos * 60) + segundos +'.'+ mseconds) ;
	//alert("\nar:" + ar + "\nhoras:"+horas +"\nminutos:"+minutos +"\nsegundos:"+segundos +"\total_segundos:"+total_segundos )
	return total_segundos ;	
};


// IS INT VERIFY
function is_int(value){ 
  if((parseFloat(value) == parseInt(value)) && !isNaN(value)){
      return true;
  } else { 
      return false;
  } 
};


// VIDEO CURRENT STATE (play,stop..)
function player_get_video_current_state() {	
	return video_current_state;
};



// SKIP RESTRICTED TIMECODE RANGES
// Activa el listener que ejecuta la validación del tc actual
function skip_restricted_timecode_ranges() {	//seconds_in, seconds_out	
	try{
		$('#debugMovie').append('DEBUG: Fired skip_restricted_timecode_ranges: started in modo ['+modo+']<br>');	
		console.log("-> Fired skip_restricted_timecode_ranges");	
					
		switch( get_modo() ) {
			
			// HTML5 STANDAR				
			case "html5"	:	RegisterListener('timeupdate', validate_current_time_in_seconds	);								
								break;
			
			// JWPLAYER					
			case "jwplayer"	:	videoObj_selector().onTime( function() {									
									validate_current_time_in_seconds();
								});
								break;					
		}				
		
	}catch(err){
		if(nivel==10) {
			$('#debugMovie').append('DEBUG: skip_restricted_timecode_ranges: ' + err +'<br>');
			console.log('ERROR: skip_restricted_timecode_ranges: ' + err);	
			//alert("Video is not accessible. Press 'Play' to load (skip_restricted_timecode_ranges) " + modo );
		}
	}
};



// VALIDATE CURRENT TIME IN SECONDS
// Verifica el tc recibido. Si se encuantra en el rango prohibido, salta hasta el final del rango prohibido
// var ar_restricted_tc = new Array();	//new Array('5,15','31,41');
var margin_secs = null;
function validate_current_time_in_seconds() {
	
	var current_time_in_seconds = player_get_current_time_in_seconds();
		
	// Verifications global vars are defined
	if(ar_restricted_tc==null || ar_restricted_tc=='undefined' || ar_restricted_tc.length <1)	return null;	
	if(tcin==null || tcin=='undefined')															return alert("Error on validate_current_time_in_seconds : tcin not defined!");	
	
	
	
	// Duración en segundos del clip get . Fija la variable global durationSecs
	if(durationSecs==null || durationSecs<1) {
		get_movie_duration();			
	}
		
	// Duración solicitada
	var duracion_solicitada_secs = parseInt(tcout - tcin);
	if(duracion_solicitada_secs==0) duracion_solicitada_secs = durationSecs;	
	
		//console.log("-> Duración clip: " + durationSecs + ' - solicitada: ' + duracion_solicitada_secs  + ' [validate_current_time_in_seconds]');
	
	// Corrección keyframe en el video (marge de hasta 3 segs)
	// Si la duración del clip obtenido no se corresponde con la duración solicitada (margen de error en el corte de entrada porque ha de ser un keyframe) lo restamos del tiempo actual para compensar	
	if( margin_secs == null && durationSecs != duracion_solicitada_secs ) {
		
		margin_secs =  parseInt(duracion_solicitada_secs - durationSecs) ;
		
			$('#debugMovie').append( ' duracion_solicitada_secs:' + duracion_solicitada_secs + ' - duracion real:' + durationSecs + ' - margin_secs:'+margin_secs+'<br>');		
			//console.log(" durationSecs: " + durationSecs + " - suma: " + (tcout - tcin) + " - margen_secs: " + margen_secs )	
	}
	
	// var tcin is defined globally by media_engine
	var offset_seconds						= parseInt(tcin);						//console.log("tcin: " +tcin);
	var current_time_in_seconds_absolute	= parseInt(current_time_in_seconds);	// + parseInt(offset_seconds) - parseInt(margen_secs);		console.log( "current_time_in_seconds_absolute: " + current_time_in_seconds_absolute );	

	
	for(i in ar_restricted_tc) {		
		
		var ar_tc_seconds	= ar_restricted_tc[i].split(",");
		var seconds_in		= parseInt(ar_tc_seconds[0] - offset_seconds + margin_secs) ;
		var seconds_out		= parseInt(ar_tc_seconds[1] - offset_seconds + margin_secs) ;		
		
			//console.log("-> seconds in:" + ar_tc_seconds[0] + ',' + seconds_in  + '	out:' + ar_tc_seconds[1] + ',' + seconds_out + '	current_time:' + current_time_in_seconds_absolute )		
			
		if( parseInt(current_time_in_seconds_absolute) >= parseInt(seconds_in) && parseInt(current_time_in_seconds_absolute) < parseInt(seconds_out) ) {	//
			
			//var seconds_out_relative	= seconds_out + offset_seconds ;			
			//var seconds_out_relative	= (seconds_out - offset_seconds) + margin_secs ;
			var time_to_jump_secs = seconds_out + 1 ;
			
			// CorrecciÓn necesaria para JWPLAYER (IMPORTANTE)
			if(get_modo()=='jwplayer') time_to_jump_secs = time_to_jump_secs + 2;
				
				console.log('-> Jumping from: ' + current_time_in_seconds_absolute + ' to ' + time_to_jump_secs + ' [validate_current_time_in_seconds]')	//alert("Jumping to:" +seconds_out_relative )	
			
			// JUMP TO TIMECODE
			player_goto_timecode(videoObj_selector(), null, time_to_jump_secs);
			
			return true;
		}
		//return true;
	}//for(i in ar_restricted_tc)	
};

// TOGGLE PLAY / PAUSE
var video_current_state	= null ;
function player_toggle_play_pause() {
	
	var videoObj		= videoObj_selector();
	var current_state	= player_get_video_current_state();
	
	if(current_state=='play'){									
		player_pause(videoObj);	
	}else{
		player_play(videoObj);		
	}	
};

function set_playback_rate( rate ) {

	var videoObj = videoObj_selector();

	// Format number as float, precission 1
	rate = parseFloat(rate)
	rate = rate.toPrecision(1)

	videoObj.playbackRate = rate; // Like 2.0
}



// MY REGISTER LISTENER
function RegisterListener(eventName, listenerFcn) {	

	var obj = videoObj_selector();

	if ( obj )
		myAddListener(obj, eventName, listenerFcn, true);
};
// MY ADD LISTENER
function myAddListener(obj, evt, handler, captures) {

	if ( document.addEventListener )	
		obj.addEventListener(evt, handler, captures);
	
	else	
		// IE	
		obj.attachEvent('on' + evt, handler);
};

