<?php
/*
* CLASS COMPONENT AV
*/
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');


class component_av extends component_common {
	
	# Overwrite __construct var lang passed in this component
	#protected $lang = DEDALO_DATA_LANG;

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $video_id ; 
	public $video_url ;
	public $quality ;

	public $target_filename ;
	public $target_dir ;

	public $aditional_path;

	#public $AVObj;

	/**/
	function __construct($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG) {
		
		# Force allways DEDALO_DATA_NOLAN
		#$lang = $this->lang;				
		#$this->lang = $lang;

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($id)) {

			# Despeja el id si existe a partir del tipo y el parent
			$id = component_common::get_id_by_tipo_parent($tipo, $parent, $lang);
				#dump($id,'id'."para tipo:$tipo - parent:$parent - lang:$lang");

			# Si no existe, creamos un registro, si o si
			if(empty($id) && $modo=='edit') {

				if( !empty($tipo) && strlen($parent) ) {
					$matrix_table 	  = common::get_matrix_table_from_tipo($tipo);
					$RecordObj_matrix = new RecordObj_matrix($matrix_table,NULL, $parent, $tipo, $lang);	#($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $matrix_table='matrix')
					$RecordObj_matrix->set_parent($parent);
					$RecordObj_matrix->set_tipo($tipo);
					
					# TRADUCIBLE
					# Si el elemento no es traducible, lo crearemos como lag 'DEDALO_DATA_NOLAN'. En otro caso aplicamos el idioma de los adatos actual
					$RecordObj_ts 	= new RecordObj_ts($tipo);
					$traducible 	= $RecordObj_ts->get_traducible();
					if ($traducible=='no') {
						$lang = DEDALO_DATA_NOLAN;
					}
					$RecordObj_matrix->set_lang($lang);
					
				
					#####################################################################################################
					# VIDEO COUNTER NUMBER 

					# Store section dato as array(key=>value)
					# Current used keys: 'counter_number', 'created_by_userID', 'created_date'
					$ar_dato  = array();	
					$ar_dato['counter']				= counter::get_counter_value($tipo)+1;	#counter::get_new_counter_value($tipo); 
						#dump($ar_dato,"ar-dato for tipo $this->tipo "); die();
					if(SHOW_DEBUG) {
						error_log("Updated counter (to ".$ar_dato['counter'].") of current component_av (tipo:$tipo - parent:$parent - lang:$lang)");
					}

					# END VIDEO COUNTER NUMBER
					######################################################################################################
					
					# Dato
					$RecordObj_matrix->set_dato($ar_dato);

					$RecordObj_matrix->Save();
					$id = $RecordObj_matrix->get_ID();


					# VIDEO COUNTER NUMBER UPDATE ########################################################################
					# If all is ok, update value (counter +1) in structure 'propiedades:counter'
					if ($id>0) {
						counter::update_counter($tipo);
					}


					# DEBUG
					if(SHOW_DEBUG===true) {
					$msg = "INFO: Created component_av record $id with: ($tipo, $parent, $lang)";
					error_log($msg);
					}
				}else{
					$msg = "Impossible create new component_av record ";
					if(SHOW_DEBUG===true) {
					$msg .= " ($id,$parent,$tipo,$lang)";
					}
					throw new Exception($msg, 1);
				}
			}
		}

		# ya tenemos registro en matrix, a continuar...
		parent::__construct($id, $tipo, $modo, $parent, $lang);

		# Set and fix current video_id
		$this->video_id = $this->get_video_id();


		# Build AVObj
		#$this->AVObj = new AVObj($this->video_id, $quality=false);
		
		#dump($this);
	}
	
	
	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_transcription
		$this->ar_tools_name[] = 'tool_transcription';

		# Add tool_av_versions
		$this->ar_tools_name[] = 'tool_av_versions';

		# Add tool_posterframe
		$this->ar_tools_name[] = 'tool_posterframe';
		
		return parent::get_ar_tools_obj();
	}
	

	/**
	* GET VIDEO ID
	* 
	*/
	public function get_video_id() {

		if(isset($this->video_id)) return $this->video_id;
		
		$ar_dato 		= $this->get_dato();
		
		if (empty($ar_dato['counter'])) {
			return 0;
			
			$msg = "av counter_number unavailable !";			
			#throw new Exception("counter_number unavailable !", 1);
			return $msg;
			#return "<span class=\"error\">$msg</span>";	
		}

		return $this->tipo .'-'. $ar_dato['counter'];
	}

	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_AV_QUALITY_DEFAULT;
		return $this->quality;
	}

	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->video_id .'.'. DEDALO_AV_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $this->get_quality() ;
		#return $this->AVObj->get_media_path_abs();
	}
	
	/**
	* GET_VIDEO_URL
	*/
	public function get_video_url($quality=false) {
		
		#return $this->AVObj->get_media_path();

		if(!$quality)
		$quality 	= $this->get_quality();
		$video_id 	= $this->get_video_id();

		return DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
	}
	
	/**
	* GET_VIDEO_PATH
	*/
	public function get_video_path($quality=false) {

		#return $this->AVObj->get_media_path_abs();

		if(!$quality)
		$quality 	= $this->get_quality();
		$video_id 	= $this->get_video_id();

		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
	}
	

	/**
	* GET_VIDEO SIZE
	*/
	public function get_video_size($quality=false) {
		
		if(!$quality)
		$quality 	= $this->get_quality();
		$video_id 	= $this->get_video_id();

		$filename 	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER. '/' . $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;

		if ( !file_exists( $filename )) {
			return false ;
		}
		
		try {	
			$size		= @filesize($filename) ;
			if(!$size)	throw new Exception('Unknow size!') ;
		} catch (Exception $e) {
			#echo '',  $e->getMessage(), "\n";
			#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;
			return false;
		}		
		$size_kb		= round($size / 1024) ;
		
		if($size_kb <= 1024) return $size_kb . ' KB' ;
				
		return round($size_kb / 1024) . ' MB' ;
	}
	


	/**
	* GET_POSTERFRAME_URL
	*/
	public function get_posterframe_url() {	
		
		$quality 	= $this->get_quality();
		$video_id 	= $this->get_video_id();

		$file 		= DEDALO_MEDIA_BASE_PATH .DEDALO_AV_FOLDER.'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION ;

		if(!file_exists($file)) {
			return DEDALO_LIB_BASE_URL . '/themes/default/0.jpg';
		}

		return DEDALO_MEDIA_BASE_URL .DEDALO_AV_FOLDER.'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION ;
	}
	
	

	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array DEDALO_AV_AR_QUALITY (Order by quality big to small)
	*/	
	public function get_source_quality_to_build($target_quality) {
		
		$ar_quality_source_valid = array();
		$ar_quality 			 = unserialize(DEDALO_AV_AR_QUALITY);
			#dump($ar_quality,'$ar_quality');		

		foreach($ar_quality as $current_quality) {

			# Current file
			$filename = $this->get_video_path($current_quality);			
			
			if (file_exists($filename)) {

				# Add current quality as source valid 
				$ar_quality_source_valid[] = $current_quality;
					#dump($filename,'$file_exists');
			}else{

				# Return first value found inside array of quality
				if(!empty($ar_quality_source_valid)) foreach ($ar_quality_source_valid as $quality_source) {

					if ($current_quality == $target_quality) return $quality_source;						
				}
			}
			
		}#end foreach($ar_quality as $quality)
		
		return false;
	}
	
	


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		
		$dato = self::get_dato();
		/*
		$separator = ' ,  ';
		if($this->modo=='list') $separator = '<br>';

		if (is_array($valor)) {
			# return "Not string value";
			$string  	= '';
			$n 			= count($valor);
			foreach ($valor as $key => $value) {

				if(is_array($value)) $value = print_r($value,true);
				$string .= "$key : $value".$separator;
			}
			$string = substr($string, 0,-4);
			return $string;

		}else{
			
			return $valor;
		}
		*/
		if(isset($dato['counter'])) {
			$valor = $this->tipo.'-'.$dato['counter'];
		}else{
			$valor = $this->tipo;
		}

		return $valor;
	}


	
}
?>