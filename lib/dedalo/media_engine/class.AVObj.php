<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.MediaObj.php');



class AVObj extends MediaObj {
	
	protected $reelID ;				# reelID
	protected $quality ;			# like 'low, mid, hi, audio'
	protected $tcin ;				# like '00:23:56'	
	protected $tcout ;				# like '00:23:56'
	
	protected $streamer ;			# defined in config ($config['media']['streamer']) 
	
	protected $codecs ;				# like 'avc1.42E01E, mp4a.40.2'
	
	protected $header_data ;		# from read movie header
	
	
	function __construct($reelID, $quality=false, $tcin=NULL, $tcout=NULL) {		
		
		# GET AND SET CONFIG VALUES FROM FILE config.php
		#self::get_config();
		
		# GENERAL SETUP
		$this->tcin_var_name 	= 'vbegin';
		$this->tcout_var_name 	= 'vend';
		
		# SPECIFIC VARS
		$this->set_reelID($reelID);
		$this->set_name($reelID);
		$this->set_quality($quality);
		$this->set_tcin($tcin);
		$this->set_tcout($tcout);		
		
		$this->streamer			= $this->define_streamer();
		
		parent::__construct($reelID);
		
	}
	
	
	# MANDATORY DEFINITIONS
	protected function define_name(){
		return $this->reelID ;
	}
	protected function define_type() {
		return DEDALO_AV_TYPE;
	}
	protected function define_extension() {
		return DEDALO_AV_EXTENSION;
	}
	protected function define_media_path() {
		return $this->get_media_path();
	}
	protected function define_media_path_abs() {
		return $this->get_media_path_abs();
	}
	protected function define_mime_type() {	
		return DEDALO_AV_MIME_TYPE;
	}

	public function get_media_path() {
		return DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . '/' . $this->quality . $this->aditional_path . '/';
	}
	public function get_media_path_abs() {		
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER. '/' . $this->quality . $this->aditional_path . '/';
	}
	
	
	# AV SPECIFIC
	protected function define_streamer() {
		return DEDALO_AV_STREAMER;	
	}	
	
	
	# GET DEFAULT QUALITY
	public static function get_quality_default() {
		return DEDALO_AV_QUALITY_DEFAULT;		
	}
	
	# GET ARRAY QUALITY OPTIONS
	public static function get_ar_quality() {			
		return unserialize(DEDALO_AV_AR_QUALITY);		
	}
	
	
	
	# SET VIDEO QUALITY (low,hi,mid)
	protected function set_quality($quality) {
				
		$default	= $this->get_quality_default();
		$ar_valid 	= $this->get_ar_quality();
		
		if(!$quality) {
			$this->quality = $default;
			return $this->quality;
		}
		
		$quality 	= strtolower($quality);			
		
		if(!is_array($ar_valid)) {
			throw new Exception("config ar_valid is not defined!", 1);
		}
		
		if(!in_array($quality,$ar_valid)) {
			$quality = $default ;
		}	
		$this->quality = $quality;
		
		return $this->quality;
	}
	
	
	# QUALITY FOLDERS WITH EXISTING FILES . Return array whith quality foundeds
	public function get_ar_quality_with_file() {
		 
		$ar_quality 			= self::get_ar_quality();
		$ar_quality_with_file	= array();
		 
		if(is_array($ar_quality)) foreach($ar_quality as $quality) {
			
			$obj = new AVObj($this->reelID, $quality);
			 
			if($obj->get_file_exists()) {
				 				
				 $ar_quality_with_file[] = $quality ;
			}			 
		}		
		return $ar_quality_with_file ;	
	}
	
		
	
	# GET ARRAY QUALITY OPTIONS AS SELECT
	public static function get_ar_quality_as_select_DEPRECATED($selectedItem=false) {
		
		$ar_valid 	= self::get_ar_quality();
		
		$html  = "\n<select name=\"quality\" id=\"quality\" >";
		
		$html .= "\n <option value=\"\" ></option>";
		
		if(is_array($ar_valid)) foreach($ar_valid as $quality) {
			
			$html .= "\n <option value=\"$quality\" ";
			if($selectedItem==$quality)
			$html .= " selected=\"selected\" ";
			$html .= ">$quality";
			$html .= "</option>";
		}
		
		$html .= "\n</select>\n";
		
		return $html;
	}
	
	
	# GET MEDIA STANDAR (PAL / NTSC)
	public function get_media_standar() {
		
		# RECUPERA INFO A PARTIR DE LA LECTURA DE LA CABECERA
		$quality	= $this->get_quality();
		$ar_data 	= $this->get_ar_movie_header_info();
		$fps		= 25;
		
		if(isset($ar_data[$quality]['fps']))
		$fps 		= $ar_data[$quality]['fps'];	#echo $fps;
		
		if($fps>=29) return 'ntsc';
		if($fps==25) return 'pal';
		
		return 'pal';	# default	
	}
	
	
	# GET ASPECT RATIO (16x9 / 4x3)
	public function get_aspect_ratio() {
		
		# RECUPERA INFO A PARTIR DE LA LECTURA DE LA CABECERA
		$quality		= $this->get_quality();
		$ar_data 		= $this->get_ar_movie_header_info();
		
		$width			= 720;
		$height			= 404;
		
		if(isset($ar_data[$quality]['width']))
		$width			= $ar_data[$quality]['width'];
		
		if(isset($ar_data[$quality]['height']))
		$height			= $ar_data[$quality]['height'];
		
		$aspect_ratio	= 0;
		if($width>0 && $height>0)
		$aspect_ratio	= round( ($width / $height), 2);
		
		#echo $aspect_ratio;
		
		switch($aspect_ratio) {
			
			case '1.33'	: $aspect = '4x3';	break;
			case '1.34'	: $aspect = '4x3';	break;
			
			case '1.77'	: $aspect = '16x9';	break;
			case '1.78'	: $aspect = '16x9';	break;
			
			case '1.66'	: $aspect = '5x3';	break;
			case '1.50'	: $aspect = '3x2';	break;
			case '1.25'	: $aspect = '5x4';	break;
			
			default		: $aspect = '16x9';
		}
		
		return $aspect; # default 16x9	
	}
	
	
	# MOVIE ATOM HEADER INFO READ BY ZEND LIB
	public function get_ar_movie_header_info($debug_mode=false) {
		
		if(isset($this->header_data)) return $this->header_data;
		
		# Zend atom lib
		require_once DEDALO_ROOT . '/lib/Zend/Media/Iso14496.php';	;
		
		$local_file		= $this->get_local_full_path();		
		
		$quality 		= $this->get_quality();

		if(empty($quality)) {
			throw new Exception("quality undefined!", 1);
		}
		
		$ar_data 		= array();
		
		try {
			
			# HEADER ATOM OBJ . Librería Zend para leer información de la cabecera del movie
			$header				= new Zend_Media_Iso14496($local_file, array("base" => "moov"));	#, array("base" => "moov"));
			if(!$header)		throw new Exception('Header Atom info unreadable');
		
						
			# ARRAY OF TRACKS
			$ar_tracks			= $header->moov->getBoxesByIdentifier("trak");
			
			
			# DEBUG MODE
			if($debug_mode) {
				
				#return $header->moov->trak->mdia->minf->stbl->stsd ;
				return $ar_tracks[1]->mdia->minf->stbl->stsd ;
			}
			
			
			if(is_array($ar_tracks)) foreach($ar_tracks as $track) {							
				
				
				if($track->mdia->hdlr->handlerType == 'vide') {			# VIDEO TRACK
					
					# MOVIE DURATION . Duración general en 'tics' o unidades internas
					#$ar_data[$quality]['movie_duration']		= $header->moov->trak->mdia->mdhd->duration;
					$ar_data[$quality]['movie_duration']		= $track->mdia->mdhd->duration;
					if(!$ar_data[$quality]['movie_duration'])	throw new Exception('Error on read movie_duration');
					
					# MOVIE TIMESCALE . Time scale general 
					$ar_data[$quality]['movie_timescale']		= $track->mdia->mdhd->timescale;		#$timescale = $header->moov->trak->mdia->mdhd->timescale;
					if(!$ar_data[$quality]['movie_timescale'])	throw new Exception('Error on read movie_timescale');
					
					# SAMPLE COUNT
					#$ar_data[$quality]['sample_count']			= $header->moov->trak->mdia->minf->stbl->stts->timeToSampleTable[1]['sampleCount'];
					#if(!$ar_data[$quality]['sample_count']) 	throw new Exception('Error on calculate sample_count');
					
					# MOVIE SAMPLE DELTA
					$ar_data[$quality]['sample_delta']			= $track->mdia->minf->stbl->stts->timeToSampleTable[1]['sampleDelta'];
					if(!$ar_data[$quality]['sample_delta']) 	throw new Exception('Error on calculate sample_delta');
					
					# MOVIE WIDHT . Ancho de la pista de video en píxels
					$ar_data[$quality]['width']					= $track->tkhd->width;
					if(!$ar_data[$quality]['width']) 			throw new Exception('Error on read width');
					
					# MOVIE HEIGHT . Alto de la pista de video en píxels
					$ar_data[$quality]['height']				= $track->tkhd->height;
					if(!$ar_data[$quality]['height']) 			throw new Exception('Error on read height');	
					
					# MOVIE DURATION IN SECONDS . Duración del movie en segundos y con decimales
					$ar_data[$quality]['duration_secs']			= round( ($ar_data[$quality]['movie_duration'] / $ar_data[$quality]['movie_timescale']) , 6);
					if(!$ar_data[$quality]['duration_secs']) 	throw new Exception('Error on calculate duration_secs');			
					
					# VIDEO FPS . Fotogramas por segundo			
					$ar_data[$quality]['fps']					= round( ($ar_data[$quality]['movie_timescale'] / $ar_data[$quality]['sample_delta']) , 2);
					if(!$ar_data[$quality]['fps']) 				throw new Exception('Error on calculate fps . from (movie_timescale / sample_delta) ');
					
				
				}else if($track->mdia->hdlr->handlerType == 'soun') {	# AUDIO TRACK
					
					# AUDIO SAMPLE RATE
					$ar_data[$quality]['sample_rate']			= $track->mdia->minf->stbl->stsd->SampleDescriptionTable[12];
					if(!$ar_data[$quality]['sample_rate'])		throw new Exception('Error on read sample_rate');	
					
					# AUDIO CALIDAD BITS
					$ar_data[$quality]['sample_size_bits']		= $track->mdia->minf->stbl->stsd->SampleDescriptionTable[9];
					if(!$ar_data[$quality]['sample_size_bits'])	throw new Exception('Error on read sample_size_bits');	
					
					# AUDIO CHANELS
					$ar_data[$quality]['n_chanels']				= $track->mdia->minf->stbl->stsd->SampleDescriptionTable[8];
					if(!$ar_data[$quality]['n_chanels'])		throw new Exception('Error on read n_chanels');
					
					# MOVIE DURATION . Duración general en 'tics' o unidades internas
					if(!isset($ar_data[$quality]['movie_duration'])) {									
						$ar_data[$quality]['movie_duration']		= $track->mdia->mdhd->duration;
						if(!$ar_data[$quality]['movie_duration'])	throw new Exception('Error on read movie_duration');
					}
					
					# MOVIE TIMESCALE . Time scale general 
					if(!isset($ar_data[$quality]['movie_timescale'])) {
						$ar_data[$quality]['movie_timescale']		= $track->mdia->mdhd->timescale;
						if(!$ar_data[$quality]['movie_timescale'])	throw new Exception('Error on read movie_timescale');
					}
					
					# MOVIE DURATION IN SECONDS . Duración del movie en segundos y con decimales
					if(!isset($ar_data[$quality]['duration_secs']) && isset($ar_data[$quality]['movie_duration']) && isset($ar_data[$quality]['movie_duration'])) {
						$ar_data[$quality]['duration_secs']			= round( ($ar_data[$quality]['movie_duration'] / $ar_data[$quality]['movie_timescale']) , 6);
						if(!$ar_data[$quality]['duration_secs']) 	throw new Exception('Error on calculate duration_secs');
					}
									
				}
				
				# HEADER INFO OK
				$ar_data[$quality]['header_info']				= "ok";
				
				
			}#if(is_array($ar_tracks))			
			
					
		} catch (Exception $e) {
			
			# HEADER INFO UNREADABLE
			$ar_data[$quality]['header_info']					= "unreadable";	
			
			
			echo "<div style=\"color:#FFF;word-wrap:break-word;\">";
			if(SHOW_DEBUG)
				echo __METHOD__ . ' Exception: ',  $e->getMessage(), "<br />";
			echo " <strong> Unable to read movie information. Movie not exists or header is malformed or corrupt !</strong>";
			echo "</div>";
			
		}
		
		$this->header_data = $ar_data ;	#var_dump($ar_data);
		
		return $ar_data ;
	}



	

}
?>