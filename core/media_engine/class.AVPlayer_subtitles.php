<?php
require_once( dirname(dirname(__FILE__)) .'/config/config.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVPlayer.php');



die("Deactivated class. Use AVPlayer version !!");




class AVPlayer_subtitles extends AVPlayer {
	

	# PLAYER SUBTITLES
	private function get_player_subtitles_code($ar_tracks=false) {
				
		
		# VIDEO CODE FOR HTML 5	
			
			$videoCode_html5  ='';
			$videoCode_html5 .= "<!-- HTML 5 TAG CODE -->";
			$videoCode_html5 .= "\\n<video id=\"wrap_{$this->playerID}\" width=\"{$this->width}\" height=\"{$this->height}\" preload=\"{$this->preload}\" {$this->get_html5_controls_code()} poster=\"{$this->poster}\" {$this->autoplay} >";
			$videoCode_html5 .= "\\n <source src=\"{$this->src}\" {$this->get_html5_source_type_code()} >";
			
			# test only
			$i = 1;
			$ar_tracks[$i]['src']		= '../write/xml/1_lg-cat.srt';
			$ar_tracks[$i]['srclang'] 	= 'es';
			$ar_tracks[$i]['label']		= 'spanish';
			$ar_tracks[$i]['default']	= 'default';
			
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
			
			# SUBTITLES
			$aditional_vars = '';
			if($this->SubtitlesObj) {
				
				$subtitles_file = $this->SubtitlesObj->get_xmlPath() . $this->SubtitlesObj->get_xmlFileName();
				
				$ar_vars['plugins']				= "captions-2";
				$ar_vars['captions.file']		= $subtitles_file;
				$ar_vars['captions.color']		= "#cccccc";
				$ar_vars['captions.fontSize']	= "11";
				
				# round flashvars array for set values							
				foreach($ar_vars as $key=>$value) {								
					if($value) 	$aditional_vars .= "\"$key\":\"$value\",";
				}										
			}
			
			$videoCode_jwplayer  = '';
			$videoCode_jwplayer  .= "jwplayer(\"wrap_{$this->playerID}\").setup({ ";
			$videoCode_jwplayer  .= "	\"id\"			: \"{$this->playerID}\", ";
			$videoCode_jwplayer  .= "	\"width\"		: \"{$this->width}\", ";
			$videoCode_jwplayer  .= "	\"height\"		: \"{$this->height}\", ";
			$videoCode_jwplayer  .= "	\"file\"		: \"{$this->src}\", ";
			$videoCode_jwplayer  .= "	\"image\"		: \"{$this->poster}\", ";
			$videoCode_jwplayer  .= "	\"autostart\"	: \"{$this->autoplay}\", ";
			$videoCode_jwplayer  .= "	\"provider\"	: \"http\", ";
			$videoCode_jwplayer  .= "	  $aditional_vars ";
			$videoCode_jwplayer  .= "	\"modes\"		: [{ type: \"flash\", src: \"../lib/jwplayer/player.swf\" }] ";
			$videoCode_jwplayer  .= "}); //jwplayer ";			
			
		
		# JAVASCRIPT AND CSS CODE
		
			$html  = '';				
			$html .= "
					<script type=\"text/javascript\">
				
						var videoCode_html5		= '$videoCode_html5';
						var videoCode_jwplayer	= '$videoCode_jwplayer';
						var wrap_ID				= 'wrap_{$this->playerID}';	
							
					</script>
					  ";
			/*			  
			#$html .= "\n<script language=\"JavaScript\" type=\"text/javascript\" charset=\"utf-8\" src=\"/dedalo/media_engine/js/player_subtitles.js\"></script>";
			#$html .= "\n<link rel=\"stylesheet\" href=\"/dedalo/media_engine/css/player_subtitles.css\" />";
			*/
		
		return $html;
	}
	
	
	
	
}

?>