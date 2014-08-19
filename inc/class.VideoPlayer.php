<?php

#require_once('../Connections/config.php');
		
die("VideoPlayer: DEPRECATED ");


class VideoPlayer {
	
	protected $reelID;
	protected $captacionID;
	
	protected $flash_player_path;
	protected $time_in;
	protected $time_out;
	protected $poster_frame;
	protected $src_movie_file;
	
	protected $autoplay;
	protected $width;
	protected $height;	
	protected $controls;	
	protected $provider;			# default http
	protected $controlbar;
	
	protected $str_flashVars;
	
	
	function __construct($reelID, $time_in=false, $time_out=false, $captacionID=false ) {
		
		die(__METHOD__ . " DEPRECATED . Use media_engine instead ");
		
		if(!$captacionID) {			
			require_once('../reels/class.RecordObj_reels.php');
			$RecordObj_reels	= new RecordObj_reels($reelID);	
			$captacionID 		= $RecordObj_reels->get_captacionID();
		}
		
		$this->flash_player_path		= 'http://player.longtailvideo.com/player.swf';
		$this->time_in					= $time_in;
		$this->time_out					= $time_out;
		$this->poster_frame				= $GLOBALS['patImages'] . $captacionID . '.jpg';
		
		if($GLOBALS['path_pseudo_streaming']) {
			$this->src_movie_file		= $GLOBALS['path_pseudo_streaming'] . intval($captacionID) . '.mov';
		}else{
			$this->src_movie_file		= $GLOBALS['video_pathNoS'] . intval($captacionID) . '.mov';
		}
		
		$this->src_movie_file		= $GLOBALS['video_pathNoS'] . intval($captacionID) . '.mov';		
	
		$this->autoplay					= true;
		$this->width					= '720';
		$this->height					= '404';		
		$this->controls					= true;
		$this->provider					= 'http';		
		$this->controlbar				= 'over';	
	}
	
	
	# BUILD PLAYER VIDEO FOR EVERYBOBY
	function build_player_video_for_everybody() {
		
		$this->str_flashVars = $this->build_str_flashVars();
		
		if($this->controls==true) {
			$controls = 'controls="controls"';
		}else{
			$controls = '';
		}
		
		
		
		$html = ''; 
		
		$html .= "\n<!-- \"Video For Everybody\" http://camendesign.com/code/video_for_everybody -->\n";
		$html .= "<video {$controls} autoplay=\"{$this->autoplay}\" poster=\"{$this->poster_frame}\" width=\"{$this->width}\" height=\"{$this->height}\" >\n";
		
		$html .= "<source src='{$this->src_movie_file}' type='video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"' />\n";
		
		$html .= "<object type=\"application/x-shockwave-flash\" data=\"{$this->flash_player_path}\" width=\"{$this->width}\" height=\"{$this->height}\" >\n";
		$html .= "<param name=\"movie\" value=\"{$this->flash_player_path}\" />\n";
		$html .= "<param name=\"allowFullScreen\" value=\"true\" />\n";
		$html .= "<param name=\"wmode\" value=\"transparent\" />\n";
		$html .= "<param name=\"flashVars\" value=\"{$this->str_flashVars}\" />\n";              
		$html .= "<img alt=\"Dédalo VideoPlayer\" src=\"{$this->poster_frame}\" width=\"{$this->width}\" height=\"{$this->height}\" title=\"No video playback capabilities, please update your browser\" />\n";              
		$html .= "</object>\n";
		
		$html .= "</video>\n\n";
				
    	return $html ;	
	}
	
	
	# BUILD STRING FLASH VARS
	function build_str_flashVars() {
		
		$params 	 = array();
		
		$params[] = 'autostart={$this->autoplay}';
		$params[] = 'controlbar={$this->controlbar}';
		$params[] = 'provider={$this->provider}';
		$params[] = 'image={$this->poster_frame}';
		$params[] = 'file={$this->src_movie_file}';
		
		$str_flashVars = implode('&',$params); 
		
		if(is_string($str_flashVars)) return urlencode($str_flashVars);	
		
		return false;		
	}
	
	
	
}
?>