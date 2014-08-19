<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.MediaObj.php');

class PosterFrameObj extends MediaObj {	
	
	protected $reelID ;			# reelID
	
	
	function __construct($reelID, $fix_no_posterframe=true) {
		
		# GENERAL SETUP			
		
		# SPECIFIC VARS
		$this->set_reelID($reelID);		
		
		parent::__construct($reelID);
		
		# IF NOT EXISTS CURRENT POSTERFRAME, SET NAME TO captacionID TO USE THIS FOTO
		if($fix_no_posterframe===true)
		$this->fix_no_posterframe_to_captacion_image();
	}
	
	
	# MANDATORY DEFINITIONS
	protected function define_name(){		
		return $this->reelID ;
	}
	protected function define_type() {
		return 'JPG';	
	}
	protected function define_extension(){		
		return 'jpg';
	}
	protected function define_media_path() {
		return DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . '/posterframe/';
	}
	protected function define_media_path_abs() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/posterframe/';
	}	
	protected function define_mime_type() {
		return 'image/jpg';
	}
	
	
	
	# FIX NO POSTERFRAME TO CAPTACION IMAGE
	protected function fix_no_posterframe_to_captacion_image_DEPERECATED() {
		/*
		if(!$this->get_file_exists()){			
			
			$RecordObj_reels 	= new RecordObj_reels($this->reelID);
			$captacionID 		= $RecordObj_reels->get_captacionID();
			
			global $patImages ;
			
			if(!$patImages) die(__METHOD__ ." <br> patImages is not defined!");
			
			$this->name 			= $captacionID;
			$this->media_path 		= $patImages;
			$this->media_path_abs 	= __ROOT__ . '/' . substr($patImages,3);
		}
		*/	
	}
	
	
	
	
	public function set_posterframe($tc) {
		
		try{			
			
			return true;
			
		}catch(Exception $e){
			
			return ('Error: '. $e->getMessage(). "\n");	
		}
	}
	



	/**
	* GET THUMB
	*/
	public function get_thumb_url($maxWidht, $maxHeight, $fx=null, $p=null, $prop=null) {

		$m 			= 'posterframe';
		$quality 	= null;
		$SID 		= $this->reelID;
		$w 			= $maxWidht;
		$h 			= $maxHeight;
		# 'm','quality','SID','w','h','fx','p','prop'
		$thumb_url = DEDALO_LIB_BASE_URL . '/media_engine/img.php?m=' .$m. '&quality=' .$quality. '&SID=' .$SID. '&w=' .$w. '&h=' .$h. '&fx=' .$fx. '&p=' .$p. '&prop=' .$prop  ;
			#dump($thumb_url,'thumb_url');

		return $thumb_url;
	}



}
?>