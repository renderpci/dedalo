<?php
#require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.OptimizeTC.php');

	
define('JWPLAYER_URL_JS'		, DEDALO_ROOT_WEB . '/lib/jwplayer/jwplayer.js');
define('JWPLAYER_URL_CSS'		, DEDALO_ROOT_WEB . '/lib/jwplayer/jwplayer.css');
define('JWPLAYER_URL_SWF'		, DEDALO_ROOT_WEB . '/lib/jwplayer/player_dedalo.swf');


define('JWPLAYER_URL_SKIN'		, DEDALO_ROOT_WEB . '/lib/jwplayer/beelden/beelden.xml');
define('JWPLAYER_CAPTIONATOR_JS', DEDALO_ROOT_WEB . '/lib/captionator/captionator-min.js');

define('PLAYER_SUBTITLES_JS'	, DEDALO_LIB_BASE_URL . '/media_engine/js/player_subtitles.js');
define('PLAYER_SUBTITLES_CSS'	, DEDALO_LIB_BASE_URL . '/media_engine/css/player_subtitles.css');

define('MEDIAELEMENT_URL_CSS'	, DEDALO_ROOT_WEB . '/lib/mediaelement/build/mediaelementplayer.min.css');
define('MEDIAELEMENT_URL_JS'	, DEDALO_ROOT_WEB . '/lib/mediaelement/build/mediaelement-and-player.min.js');
define('MEDIAELEMENT_URL_SWF'	, DEDALO_ROOT_WEB . '/lib/mediaelement/build/flashmediaelement.swf');

define('AC_QUICKTIME_URL_JS'	, DEDALO_LIB_BASE_URL . '/media_engine/js/AC_QuickTime.js');


class AVPlayer extends Accessors {
	
	protected $AVObj;
	protected $PosterFrameObj;
	protected $SubtitlesObj;
	
	protected $playerID;
	protected $width;
	protected $height;
	protected $controls;
	protected $autoplay;	
	protected $poster;
	protected $src;
	protected $preload;
	protected $type;
	protected $codecs;
	protected $provider;
	protected $quality;
	
	protected $tcin;
	protected $tcout;	
		
	function __construct(AVObj $AVObj, PosterFrameObj $PosterFrameObj=NULL, SubtitlesObj $SubtitlesObj=NULL) {		
		
		$this->AVObj 				= $AVObj;
		$this->PosterFrameObj		= $PosterFrameObj;
		$this->SubtitlesObj			= $SubtitlesObj;
		
		# POSTERFRAME NOT RECEIVED
		if($this->PosterFrameObj==NULL)		
		$this->PosterFrameObj		= $this->get_PosterFrameObj_from_AVObj($this->AVObj);			
		
		
		# SETUP PLAYER PREFS
		$this->playerID				= 'player_'.$AVObj->get_name();		
		$this->width				= '720';		# default 720
		$this->height				= '404';		# default 404
		$this->controls				= true;			# 'controls'
		$this->autoplay				= false;		# 'autoplay'					
		$this->src					= $this->AVObj->get_url();

		# When request, add to source url
		# Need streamer
		if ( isset($_GET['vbegin']) && isset($_GET['vend']) ) {
			$this->src .= "&vbegin=".safe_xss($_GET['vbegin']).'&vend='.safe_xss($_GET['vend']);
		}

		$this->preload				= 'none'; # auto|metadata|none	
		$this->type					= $this->AVObj->get_mime_type();	#if($this->codecs) $this->type = $this->type .';'. $this->codecs;	
		$this->codecs				= $this->AVObj->get_codecs();	
		$this->provider				= 'http';
		$this->quality				= $this->AVObj->get_quality();

		if ($this->quality=='audio') {
			$this->height			= '404';
		}	
		
		$this->poster				= $this->PosterFrameObj->get_url();
		
		$this->tcin					= OptimizeTC::TC2seg($this->AVObj->get_tcin());
		$this->tcout				= OptimizeTC::TC2seg($this->AVObj->get_tcout());	
		
		
		# CASE AUDIO
		#if($this->AVObj->get_quality()=='audio') $this->height = '16';
		
		# SET TO AUTO (Important for Safari)
		if( $this->tcin >0 ) {
			$this->set_preload('auto');		# auto|metadata|none
			dump($this->tcin,'$this->tcin');
		}
		#dump($this, ' this');
	}
	
	function get_PosterFrameObj_from_AVObj($AVObj) {					
		$PosterFrameObj	= new PosterFrameObj($AVObj->get_name());
		return $PosterFrameObj;
	}
	
	/**
	* GET_STREAMER
	* @return 
	*/
	public function get_streamer() {
		//http://192.168.0.7
		return 'http://'.DEDALO_HOST;
	}#end get_streamer
	
	
	# BUILD PLAYER 
	function build_player($modo='qt',$option=1) {
		
		/*
		DEBUG
		
		if( SHOW_DEBUG ) {
			$dbg = '<div class=\"debug\">build_player: ';
			$dbg .= "av: "		. $this->AVObj->get_media_path().$this->AVObj->get_name().'.'.$this->AVObj->get_extension();
			$dbg .= " - ";
			$dbg .= "poster: "	. $this->poster;
			$dbg .= " - ";
			$dbg .= "streamer: " . $this->AVObj->get_streamer();
			$dbg .= '</div>';
			echo $dbg ;
		}
		*/
		#dump($this->PosterFrameObj->get_file_exists());
		
		# verify media file
		if(!$this->AVObj->get_file_exists()) {
			$info_path = false;
			if( SHOW_DEBUG===true ) {
				$info_path = $this->AVObj->get_media_path().$this->AVObj->get_name().'.'.$this->AVObj->get_extension();
			}
			return "<div style=\"margin:0px;padding-top:200px;font-size:14px; color:#999999\"> Media not available <br> $info_path </div>"; #{$this->AVObj->get_media_path()}
		}
		if(!$this->PosterFrameObj->get_file_exists())
		$this->poster = $this->PosterFrameObj->get_media_path() ."0.jpg";


		# STREAMER . IF STREAMER IS DEFINED IN CONFIG FILE, USE THIS PATH AND ACCEPT TCIN AND TCOUT		
		if($this->AVObj->get_streamer() && ($modo=='subtitles' || $modo=='public') ) {
			#$this->src = $this->AVObj->get_streamer() . substr($this->src,3);			
			$this->src = $this->AVObj->get_streamer() . $this->src;	#str_replace('/dedalo/','', $this->src);
			
			if($this->tcin == 0 && $this->tcout == 0) {
				# Nothing to do				
			}else{
				if(isset($this->tcin))	$this->src .= "?{$this->AVObj->tcin_var_name}={$this->tcin}" ;			#var_dump($this->tcin);
				if(isset($this->tcout))	$this->src .= "&{$this->AVObj->tcout_var_name}={$this->tcout}" ;
			}
			
			# DEBUG
			global $host, $hostLocal;
			if( in_array($host, $hostLocal) ) {
				echo " src: ".$this->src;
			}	
			#$option = 2;
		}
		
		#echo "get_aspect_ratio:".$this->AVObj->get_aspect_ratio();
		#echo "get_media_standar:".$this->AVObj->get_media_standar();
		
		$nivel = 0;
		
		$html  = "<!-- \"Video Player -->";		
		$html .= "<script type=\"text/javascript\">
		
					// General media vars
					var quality 				= '{$this->quality}';
					var src 					= '{$this->src}';
					var posterframe_url			= '{$this->poster}';
					var nivel					= '{$nivel}';
					var playerID				= '{$this->playerID}';					
					var tcin					= '{$this->tcin}';
					var tcout					= '{$this->tcout}'; 
					var preload					= '{$this->preload}';
					var video_controls_loaded	= false;
					var isInitmovie				= 0;
					var modo 					= '$modo';
					var player_option 			= '$option';															
				  </script>";
				  
		# DIV WRAP PLAYER
		$html .= "<div id=\"wrap_{$this->playerID}\">";
		if($this->quality=='audio') {
			
			#$html .= "<img src=\"{$this->poster}\" height=\"{$this->height}\" alt=\"Posterframe {$this->poster}\" />";
			#$this->height = '24';
			#$this->height = '0';			
		}
		#dump($modo, ' modo');		
				
		switch($modo) {			
			
			# PLAYER MEDIAELEMENT
			case 'mediaelement'	: $player_code	= $this->get_mediaelement_code();						break;
			
			# JW PLAYER
			case 'jwplayer'		: $player_code	= $this->get_jwplayer_code($option);					break;
			
			# HTML5 PLAYER WHITH QUICKTIME FALLBACK
			case 'qt'			: $player_code	= $this->get_video_tag_fallback_qt_code();				break;
			
			# HTML5 PLAYER
			case 'html5'		: $player_code	= $this->get_video_tag_code();							break;
			
			# SUBTITLES PLAYER (In public player) 
			case 'subtitles'	: $player_code	= $this->get_player_subtitles_code($ar_tracks=false);	break;	
			
			# PUBLIC PLAYER 
			case 'public'		: $player_code	= $this->get_player_public_code();						break;				
			
		}
		
		$html2 = "</div><!-- /wrap_{$this->playerID} -->";

    	return $html . $player_code . $html2 ;	
	}
	
	
	
	
	# HTML5 PLAYER TYPE
	protected function get_video_tag_code() {		
		
		$html  ='';
		$html .= "<!-- HTML 5 TAG CODE -->";
		$html .= "<video id=\"wrap_{$this->playerID}\" width=\"{$this->width}\" height=\"{$this->height}\" preload=\"{$this->preload}\" {$this->get_html5_controls_code()} poster=\"{$this->poster}\" {$this->autoplay} >";
		$html .= " <source src=\"{$this->src}\" {$this->get_html5_source_type_code()} >";
		$html .= " <div class=\"message\">Sorry, you\'ll need an HTML5 Video capable browser to view this media.</div>";
		$html .= "</video>";
		
		return $html;	
	}	
       

	
	# MEDIAELEMENT PLAYER TYPE
	protected function get_mediaelement_code() {
				
		$src = $this->get_src();
		
		$html  = "\n<!-- MEDIAELEMENT CODE -->\n";
		$html .= "\n<link rel=\"stylesheet\" href=\"".MEDIAELEMENT_URL_CSS."\" />";	
		$html .= "\n<script src=\"".MEDIAELEMENT_URL_JS."\"></script>";
		$html .= "\n<script type=\"text/javascript\">
					modo = 'mediaelement';
					jQuery(document).ready(function($) {
						$('#wrap_{$this->playerID}').hide(0);
						$('video').mediaelementplayer({
							success: function(player, node) {
								$('#' + node.id + '-mode').html('mode: ' + player.pluginType);
								$('#wrap_{$this->playerID}').fadeIn(800);
							},
							error: function (evt) {
     							alert(\"Error on load media\")
    						}
						});
					});
					if(nivel==10) console.log('-> url: {$src}, ".__METHOD__." ');
					</script>";
		
		# opcion fallback simple con javascript
		$html_1 = "<video width=\"{$this->width}\" height=\"{$this->height}\" src=\"{$src}\" type=\"{$this->type}\" id=\"{$this->playerID}\" poster=\"{$this->poster}\" {$this->get_html5_controls_code()} preload=\"none\" ></video>\n";
		#$html_1 .="\n <track kind=\"subtitles\" src=\"../write/xml/1_lg-cat.srt\" srclang=\"en\" />";
					
		# opcion fallback flash sin javascript
		$html_2 = "<!-- HTML 5 TAG --> 
					<video id=\"{$this->playerID}\" width=\"{$this->width}\" height=\"{$this->height}\" preload=\"none\" {$this->get_html5_controls_code()} poster=\"{$this->poster}\" {$this->autoplay} >
		
					<!-- MP4 source must come first for iOS -->
					<source src=\"{$this->src}\" type=\"{$this->type};codecs='{$this->codecs}'\" >
								
					<!-- Fallback flash player for no-HTML5 browsers with JavaScript turned off -->					
					<object width=\"{$this->width}\" height=\"{$this->height}\" type=\"application/x-shockwave-flash\" data=\"".MEDIAELEMENT_URL_SWF."\"> 		
						<param name=\"movie\" value=\"".MEDIAELEMENT_URL_SWF."\" /> 
						<param name=\"flashvars\" value=\"controls=true&poster={$this->poster}&file={$src}\" /> 		
						<!-- Image fall back for non-HTML5 browser with JavaScript turned off and no Flash player installed -->
						<img src=\"{$this->poster}\" width=\"{$this->width}\" height=\"{$this->height}\" alt=\"Posterframe\" title=\"No video playback capabilities\" />
					</object>
						
					</video>\n";
		
		return $html . $html_1 ;	
	}
	
	
	# QT PLAYER TYPE
	protected function get_video_tag_fallback_qt_code() {
	
		$html5type  = "type=\"{$this->type}";
		if($this->codecs) {
			$html5type .= ";codecs=\'{$this->codecs}\'";
		}
		$html5type .= "\"";
		$src = $this->src;
		$html5_source_type_code = $this->get_html5_source_type_code();
		
		$subtitle_track = null;

		if(isset($_GET['subtitles_url'])){
			$subtitles_url = trim($_GET['subtitles_url']);
			$subtitle_track= "<track label=\"Subtitle\" kind=\"subtitles\" srclang=\"en\" src=\"$subtitles_url\" default>";
		}else{

			// Temporal add subtitles
				// '<track label="English" srclang="lg-eng" src="/dedalo/media_test/media_mht/av/subtitles/rsc35_rsc167_92_lg-eng.vtt?1541677237555">';				
				$path = $this->AVObj->get_media_path(); // like '/dedalo/media_test/media_mht/av/404/'
				$subtitles_url = str_replace('404', 'subtitles', $path) . $this->AVObj->get_reelID() . '_' . DEDALO_APPLICATION_LANG .'.vtt?' . time();
					#dump($subtitles_url, ' subtitles_url ++ '.to_string());
				$srclang = lang::get_alpha2_from_code(DEDALO_APPLICATION_LANG);
				$subtitle_track= "<track label=\"Subtitle\" kind=\"subtitles\" srclang=\"en\" src=\"$subtitles_url\" default>";
		}


		$width  = $this->width;
		$height = $this->height;

		$width  = '';
		$height = '';
				
		$html  = "<!-- HTML 5 TAG CODE WITH FALLBACK QUICKTIME PLUG-IN -->"; // width=\"{$this->width}\" height=\"{$this->height}\" width=\"{$this->width}\" height=\"{$this->height}\"
		$html .= "<script type=\"text/javascript\">
		
					var videoCode = new String('');
								
					if( navigator.userAgent.indexOf('Chrome') != -1 || navigator.userAgent.indexOf('AppleWebKit') != -1  || navigator.userAgent.indexOf('Gecko') != -1 ) {
			
						modo = 'html5' ;	//alert('{$src}')
						
						videoCode += '<video id=\"{$this->playerID}\" preload=\"{$this->preload}\" {$this->get_html5_controls_code()} poster=\"{$this->poster}\" {$this->autoplay} onerror=\"failed(event)\" >';	      					
						videoCode += ' <source id=\"video_mp4\" src=\"\" {$html5_source_type_code} >';
						videoCode += ' <img src=\"{$this->poster}\" alt=\"Posterframe\" title=\"No video playback capabilities\" />';
						videoCode += '$subtitle_track';
						videoCode += '</video>';			
						
					}else{
						
						modo = 'qt' ;
												
						$('#wrap_{$this->playerID}').append('<script type=\"text/javascript\" src=\"".AC_QUICKTIME_URL_JS."\"><\/script>');
						
						var controlbar_height = 16;
						if(quality=='audio') var controlbar_height = -8;					
						
						var videoCode =  QT_GenerateOBJECTText_XHTML('/dedalo/images/init.mov', '{$width}', '{$height}'+controlbar_height, '', 
						'EnableJavaScript'	, 'true',
						'postdomevents'		, 'true', 
						'emb#NAME' 			, '{$this->playerID}', 
						'obj#id' 			, 'videoObj', 
						'emb#id'			, '{$this->playerID}',
						'qtsrc'				, '{$src}',
						'cache'				,'true',
						'scale'				,'aspect',
						'controller'		,'true',
						'starttime'			,'',
						'endtime'			,'',
						'kioskmode'			,'false',
						'autostart'			,'false',
						'volume'			,'100',
						'emb#bgcolor'		,'#000000',
						'showlogo'			,'true',
						'align'				,'middle'
						);			
					}
					
					jQuery(document).ready(function($) {											
						
						switch(modo) {
							
							case 'html5' :	$('#wrap_{$this->playerID}').hide(0).append(videoCode).fadeIn(600);
											break;
											
							case 'qt' 	 : 	$('#wrap_{$this->playerID}').hide(0).append(videoCode).fadeIn(1000);
											break;
						}																				
					});
					if(SHOW_DEBUG===true) console.log('-> url: {$src}, ".__METHOD__." ');
				</script>";
				
		return $html;
	}
	
	
	# JWPLAYER PLAYER TYPE
	protected function get_jwplayer_code($option=1) {
		
		$html  = "\n<!-- JWPLAYER CODE -->";
		$html .= "\n<link rel=\"stylesheet\" href=\"".JWPLAYER_URL_CSS."\" />";	
		$html .= "\n<script type=\"text/javascript\" src=\"".JWPLAYER_URL_JS."\"></script>";		
		
		switch($option) {
			
			case 1 :	# OPTION 1 DEFAULT NO CUTS
						$src = $this->get_src();
						$html	.= "
						<script type=\"text/javascript\">
						jQuery(document).ready(function($) {
							modo = 'jwplayer';
							jwplayer('wrap_{$this->playerID}').setup({
															
								'id'			: '{$this->playerID}',
								'width'			: '{$this->width}',
								'height'		: '{$this->height}',
								'file'			: '{$src}',
								'image'			: '{$this->poster}',
								'autostart'		: '{$this->autoplay}',
								'modes'			: [
													{type: 'html5'},
													{type: 'flash', src: '".JWPLAYER_URL_SWF."'},
													{type: 'download'}
												  ]
							});
						});
						if(nivel==10) console.log('-> url: {$src}, ".__METHOD__."($option) ');				
						</script>\n";
						break;
						
			case 2 :	# OPTION 2 STREAMER MOD INSTALLED
						# Streamer is defined in config like ($config['media']['streamer'] = 'http://192.168.0.7') 
						$src = $this->AVObj->get_streamer() . $this->src;
			
						if($this->tcin) 				$src .= "?{$this->AVObj->tcin_var_name}={$this->tcin}" ;			
						if($this->tcout && $this->tcin)	$src .= "&{$this->AVObj->tcout_var_name}={$this->tcout}" ;			#echo $src;
						
						$html .= "
						<script type=\"text/javascript\">						
						jQuery(document).ready(function($) {
							modo = 'jwplayer';
							jwplayer('wrap_{$this->playerID}').setup({
								
								'id'			: '{$this->playerID}',
								'width'			: '{$this->width}',
								'height'		: '{$this->height}',								
								'file'			: '{$src}',
								'image'			: '{$this->poster}',
								'provider'		: 'http',
								'autostart'		: '{$this->autoplay}',
								'provider'		: 'http',
								'modes'			: [
													{
													  type: 'html5',
													  config: {
													   'file': '{$src}'
													  }
													},
													{
														type: 'flash',
														'provider': 'http',
														src: '".JWPLAYER_URL_SWF."'
													},												
													{
													  type: 'download',
													  config: {
													   'file': '{$src}',
													   'provider': 'http'
													  }
													}
												 ]
							}); //jwplayer							
						});
						if(nivel==10) console.log('-> url: {$src}, ".__METHOD__."($option) ');						
						</script>\n";
						break;
		}#switch($option)
		
				
		return $html ;	
	}
	
	
	
	/* PASADA A PUBLIC 
	protected function get_jwplayer_code() {		
		
		$and 		 = '&';
		$flashvars	 = '';
		$flashvars	.= $and.'autostart=false' ;
		$flashvars	.= $and.'file='. urlencode($this->src);
		#$flashvars	.= $and.'provider=http';
		$flashvars	.= $and.'image='.$this->poster;
		$flashvars	.= $and.'volume=100' ;
		#$flashvars	.= $and.'autostart=false' ;
		#$flashvars	.= $and."displayclick=fullscreen" ;
		#$flashvars	.= $and."controlbar=none" ;
		#$flashvars	.= $and.'bufferlength=1' ;
		#$flashvars	.= $and.'dock=true' ;
		
		$flashvars	 = addslashes($flashvars);
		
		$html  = "<!-- JWPLAYER CODE -->\n";
		
		$html .= "<video id=\"{$this->playerID}\" width=\"{$this->width}\" height=\"{$this->height}\" preload=\"none\" poster=\"{$this->poster}\" >\n";    
      	$html .= " <source src=\"{$this->src}\" type='video/mp4' >\n";         
    	$html .= "</video>\n"; 
	
			
		#$html .= "<link rel=\"stylesheet\" href=\"".JWPLAYER_URL_CSS."\" />";	
		$html .= "<script src=\"".JWPLAYER_URL_SWF."\"></script>";
		$html .= "<script type=\"text/javascript\">
					modo = 'jwplayer';
					jwplayer(\"{$this->playerID}\").setup({
						modes: [
							{ type: 'html5' },
							{ type: 'flash', src: '".JWPLAYER_URL_SWF."' }
						],
						//provider	: 'http',
						autostart	: false,
						flashvars	: '{$flashvars}'						
					  });					  	
					</script>";
					
		
		return $html ;	
	}
	*/
	
	
	
	/* PASADA A PUBLIC 
	# PLAYER SUBTITLES
	protected function get_player_subtitles_code($ar_tracks=false) {		
		
		$src = $this->get_src();	
		
		# VIDEO CODE FOR HTML 5	
			
			$videoCode_html5  ='';
			$videoCode_html5 .= "\\n<!-- HTML 5 TAG CODE -->";
			$videoCode_html5 .= "\\n<video id=\"wrap_{$this->playerID}\" width=\"{$this->width}\" height=\"{$this->height}\" preload=\"{$this->preload}\" {$this->get_html5_controls_code()} ";
			$videoCode_html5 .= " poster=\"{$this->poster}\" {$this->autoplay}  >";
			$videoCode_html5 .= "\\n <source src=\"{$src}\" {$this->get_html5_source_type_code()} >";
			
						
			
			# SUBTITLES
			$ar_tracks = NULL;			
			if($this->SubtitlesObj) {
				
				$ar_tracks = self::get_ar_track();
				
				if(is_array($ar_tracks)) foreach($ar_tracks as $key => $track) {
					
					$track_src		= $track['src'];
					$track_srclang	= $track['srclang'];
					$track_label	= $track['label'];
					$track_default	= $track['default'];				
					
					$videoCode_html5 .= "\\n <track kind=\"captions\" src=\"$track_src\" type=\"text/vtt\" srclang=\"$track_srclang\" label=\"$track_label\" $track_default />";			
				}
			}
				
			$videoCode_html5 .= "\\n <div class=\"message\">Sorry, you\'ll need an HTML5 Video capable browser to view this media.</div>";
			$videoCode_html5 .= "\\n</video>";
			
		
		# VIDEO CODE FOR JWPLAYER WITH CAPTIONS PLUG-IN
			
			# DEFAULT FLASH VARS
			$ar_vars['skin']				= JWPLAYER_URL_SKIN;
			$ar_vars['dock']				= "false";			
			
			# SUBTITLES
			$aditional_vars = '';
			if($this->SubtitlesObj) {
				
				$subtitles_file = $this->SubtitlesObj->get_xmlPath() . $this->SubtitlesObj->get_xmlFileName();
				
				$ar_vars['plugins']				= "captions-2";
				$ar_vars['captions.file']		= $subtitles_file;
				$ar_vars['captions.color']		= "#cccccc";
				$ar_vars['captions.fontSize']	= "11";																	
			}
			
			# round flashvars array for set values							
			foreach($ar_vars as $key=>$value) {								
				if(!empty($value)) 	$aditional_vars .= "\"$key\":\"$value\",";
			}
			
			$videoCode_jwplayer  = '';		
			$videoCode_jwplayer  .= "jwplayer(\"wrap_{$this->playerID}\").setup({ ";
			$videoCode_jwplayer  .= "	\"id\"			: \"{$this->playerID}\", ";
			$videoCode_jwplayer  .= "	\"width\"		: \"{$this->width}\", ";
			$videoCode_jwplayer  .= "	\"height\"		: \"{$this->height}\", ";
			$videoCode_jwplayer  .= "	\"file\"		: \"{$src}\", ";
			$videoCode_jwplayer  .= "	\"image\"		: \"{$this->poster}\", ";
			$videoCode_jwplayer  .= "	\"autostart\"	: \"{$this->autoplay}\", ";
			$videoCode_jwplayer  .= "	\"provider\"	: \"http\", ";
			$videoCode_jwplayer  .= "	  $aditional_vars ";
			$videoCode_jwplayer  .= "	\"modes\"		: [{ type: \"flash\", src: \"".JWPLAYER_URL_SWF."\" }] ";
			$videoCode_jwplayer  .= "});//jwplayer ";		
			
		
		# JAVASCRIPT AND CSS CODE
		
			$html  = '';				
			$html .= "
					<script type=\"text/javascript\">
				
						var videoCode_html5		= '$videoCode_html5';
						var videoCode_jwplayer	= '$videoCode_jwplayer';
						var wrap_ID				= 'wrap_{$this->playerID}';
						
						if(nivel==10) console.log('-> url: {$src}, ".__METHOD__." ');
						
						$('head').append('<link rel=\"stylesheet\" href=\"".PLAYER_SUBTITLES_CSS."\" />');
					</script>
					";
			
			#$html .= "\n<link rel=\"stylesheet\" href=\"".PLAYER_SUBTITLES_CSS."\" />";
			$html .= "\n<script src=\"".PLAYER_SUBTITLES_JS."\" type=\"text/javascript\" charset=\"utf-8\"></script>";
			#$html .= "\n<script src=\"".JWPLAYER_CAPTIONATOR_JS."\" type=\"text/javascript\" charset=\"utf-8\" ><\/script>";			
		
		return $html;
	}
	*/
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	
	protected function get_ar_track() {
			
		$i= 0;
		$ar_tracks[$i]['src']		= $this->SubtitlesObj->get_srtPath() . $this->SubtitlesObj->get_srtFileName();	#'../write/xml/1_lg-cat.srt';
		$ar_tracks[$i]['srclang'] 	= 'es';
		$ar_tracks[$i]['label']		= 'Spanish';
		$ar_tracks[$i]['default']	= 'default';
		
		return $ar_tracks;	
	}
	
	
	
	
	
	
	
	
	
	
	
	# LIKE type="video/mp4:codecs='h264.2'"  
	protected function get_html5_source_type_code() {
		
		$html5_source_type_code			 = "type=\"{$this->type}";		
		if($this->codecs)
			$html5_source_type_code		.= ";codecs=\'{$this->codecs}\'";
		$html5_source_type_code			.= "\"";
		
		return $html5_source_type_code	;
	}
	
	# LIKE controls="controls"  
	protected function get_html5_controls_code() {
		
		$html5_controls_code			= "";
		if($this->controls)
			$html5_controls_code		= "controls=\"controls\" ";
		
		return $html5_controls_code	;
	}
	
	
	
	
	
	
	
	
	
	
	
	
	
	# BUILD STRING FLASH VARS
	function build_str_flashVars() {
		
		$params 	 = array();
		
		$params[] = 'autostart={$this->autoplay}';
		$params[] = 'controlbar={$this->controlbar}';
		$params[] = 'provider={$this->provider}';
		$params[] = 'image={$this->PosterFrameObj->get_url()}';
		$params[] = 'file={$this->AVObj->get_url()}';
		
		$str_flashVars = implode('&',$params); 
		
		if(is_string($str_flashVars)) return urlencode($str_flashVars);	
		
		return false;		
		
		/*
		$html .= "<object type=\"application/x-shockwave-flash\" data=\"{$this->flash_player_path}\" width=\"{$this->width}\" height=\"{$this->height}\" >\n";
		$html .= "<param name=\"movie\" value=\"{$this->flash_player_path}\" />\n";
		$html .= "<param name=\"allowFullScreen\" value=\"true\" />\n";
		$html .= "<param name=\"wmode\" value=\"transparent\" />\n";
		$html .= "<param name=\"flashVars\" value=\"{$this->str_flashVars}\" />\n";              
		$html .= "<img alt=\"Dédalo VideoPlayer\" src=\"{$this->poster_frame}\" width=\"{$this->width}\" height=\"{$this->height}\" title=\"No video playback capabilities, please update your browser\" />\n";              
		$html .= "</object>\n";
		*/
	}
	
	
	# BUTTONS DIV
	public function get_buttons() {
		
		$html  = "<!-- Botones control de video -->";
		$html .= "<div id=\"video_controls\" class=\"select_none\">";
						
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"playin\" onClick=\"goto_time('0')\">$inicio_title</a>";
		
		if($AVObj->get_tcin())
		$html .= "  <a class=\"video_btn\" href=\"javascript:;\" id=\"playFr\"	onClick=\"goto_time('$tcin');\">$fragmento_title</a>";
						
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"play1\"	onClick=\"controlVideo('play')\">Play</a>";
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"stop1\"	onClick=\"controlVideo('pause')\">Stop</a>";
					
		$html .= "	<!-- TC Display -->
					<div id=\"TCdiv\">
						<span class=\"loading_msg blink\"> loading </span>
					</div>";
					
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"rev10\"	 onClick=\"controlVideo('-10');\"> &lt; 10 seg</a>";
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"rev5\"	 onClick=\"controlVideo('-5');\" > &lt; 5 seg</a>";        
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"ava5\"	 onClick=\"controlVideo('5');\"> 5 seg &gt;</a>";
		$html .= "	<a class=\"video_btn\" href=\"javascript:;\" id=\"ava10\"	 onClick=\"controlVideo('10');\"> 10 seg &gt; </a>";
		            
		$html .= "</div>";
		
		return $html ;
	}
	
	
	
}
?>