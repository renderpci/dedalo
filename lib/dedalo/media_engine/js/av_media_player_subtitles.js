// JavaScript Document

// player_subtitles_code

/**/
var videoCode	= new String('');
var pisuerga	= 'valladolid';
								
//if( (navigator.userAgent.indexOf('Chrome') != -1 || navigator.userAgent.indexOf('AppleWebKit') != -1) && pisuerga == 'valladolid' ) {
if( (navigator.userAgent.indexOf('iPad') != -1 || navigator.userAgent.indexOf('iPhone') != -1) ) {
	
	modo = 'html5' ;	
	
	videoCode = videoCode_html5;	//alert(videoCode)
	
	$(function() {
		
		// LOAD CAPTIONATOR SCRIPT JS LIB
		$.getScript("/dedalo/lib/captionator/captionator-min.js", function() {
			
			// LOAD VIDEO CODE
			$('#'+wrap_ID).hide(0).append(videoCode).fadeIn(600);
			
			// ACTIVE CAPTIONATOR
			captionator.captionify();
	  	
		});
																								
	});
			
	
}else{
	
	modo = 'jwplayer' ;
	
	videoCode = videoCode_html5;
	
	// JWPLAYER LIBS
	//$('head').append('<link rel="stylesheet" href="/dedalo/lib/jwplayer/jwplayer.css" />');
	//$('head').append('<scr' + 'ipt type="text/javascript" src="/dedalo/lib/jwplayer/jwplayer.js"></scr' + 'ipt>');
	
	$('html').css('background-color','#333333');
	
	$(function() {		
		
		//$('#'+wrap_ID).hide(0).append(videoCode).css('background-color','#333333').delay(0).show(0, function(){
			
			//$.getScript("/dedalo/lib/jwplayer/jwplayer.js", function() { 
				eval(videoCode_jwplayer);
			//});				
				
		//});		
					
	});
	
	
}

