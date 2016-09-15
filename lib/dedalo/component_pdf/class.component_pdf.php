<?php
/*
* CLASS COMPONENT PDF
*/
require_once(DEDALO_LIB_BASE_PATH . '/media_engine/class.PdfObj.php');


class component_pdf extends component_common {
	

	# file name formated as 'tipo'-'order_id' like dd732-1
	public $pdf_id ; 
	public $pdf_url ;
	public $quality ;

	public $target_filename ;
	public $target_dir ;

	public $initial_media_path;	# A optional file path to files to conform path as /media/images/my_initial_media_path/<1.5MB/..

	public $PdfObj ; # Instance of PdfObj with current data 

	
	# COMPONENT_PDF COSNTRUCT
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {
		
		if(SHOW_DEBUG) {
			$start_time = microtime(1);
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		$dato = $this->get_dato();
			#dump(empty($dato)," dato $modo");

		$need_save=false;
		if($this->parent>0 && !isset($dato->section_id)) {

			#####################################################################################################
			# DEFAULT DATO
			$locator = new locator();
				$locator->set_component_tipo($this->tipo);
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($this->parent);			
			# END DEFAULT DATO
			######################################################################################################

			# Dato
			$this->set_dato($locator);
			$need_save=true;
		}#end if(empty($dato->counter) && $this->parent>0)


			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no no están estas variables asignadas)

			# Set and fix current video_id
			$this->pdf_id = $this->get_pdf_id();

			# INITIAL MEDIA PATH SET
			$this->initial_media_path = $this->get_initial_media_path();
				#dump($this->initial_media_path, ' this->initial_media_path');

			# ADITIONAL_PATH : Set and fix current aditional image path
			$this->aditional_path = $this->get_aditional_path();
				#dump($this->aditional_path,'$this->aditional_path');

			# PDFOBJ : Add a PdfObj obj
			$this->PdfObj = new PdfObj( $this->pdf_id, $this->get_quality(), $this->aditional_path, $this->initial_media_path );
				#dump($this->PdfObj,"PdfObj en construct");


		if ($need_save) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			# DEBUG
			if(SHOW_DEBUG) {
				$total=round(microtime(true)-$start_time,3);
				$name = RecordObj_dd::get_termino_by_tipo($this->tipo,true);
				error_log("DEBUG INFO ".__METHOD__." Saved $name with dato ".$locator->get_flat()." of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");
			}		
		}#end if ($need_save)
		
		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

	}#end __construct



	/**
	* GET_ADITIONAL_PATH
	* Calculate image aditional path from 'propiedades' json config.
	*/
	public function get_aditional_path() {

		static $ar_aditional_path;

		#if(isset($ar_aditional_path[$this->pdf_id])) return $ar_aditional_path[$this->pdf_id];
		if(isset($this->aditional_path)) return $this->aditional_path;

		$propiedades = $this->get_propiedades();

		if (isset($propiedades->aditional_path)) {

			$component_tipo 	= $propiedades->aditional_path;
			$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

			$component 	= component_common::get_instance($component_modelo, $component_tipo, $this->parent, 'edit', DEDALO_DATA_NOLAN, $this->section_tipo);
			$dato 		= trim($component->get_dato());			

			# Add / at begin if not exits
			if ( substr($dato, 0, 1) != '/' ) {
				$dato = '/'.$dato;
			}

			# Remove / at end if exists
			if ( substr($dato, -1) === '/' ) {
				$dato = substr($dato, 0, -1);
			}
			#dump($dato,'$dato');

			$ar_aditional_path[$this->pdf_id] = $dato;
			
			if(isset($propiedades->max_items_folder) && empty($dato)) {

						$max_items_folder  = $propiedades->max_items_folder;
						$parent_section_id = $this->parent;

						$ar_aditional_path[$this->pdf_id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

						$component->set_dato( $ar_aditional_path[$this->pdf_id] );
						$component->Save();
					}

		}else{
			$ar_aditional_path[$this->pdf_id] = false;
		}

		return $this->aditional_path = $ar_aditional_path[$this->pdf_id];
	}



	/**
	* GET_INITIAL_MEDIA_PATH
	*
	*/
	public function get_initial_media_path() {
		$component_tipo = $this->tipo;
		$parent_section = section::get_instance($this->parent,$this->section_tipo);
		$propiedades 	= $parent_section->get_propiedades();
			#dump($propiedades," propiedades component_tipo:$component_tipo"); 
			#dump($propiedades->initial_media_path->$component_tipo," ");

		if (isset($propiedades->initial_media_path->$component_tipo)) {
			$this->initial_media_path = $propiedades->initial_media_path->$component_tipo;
			# Add / at begin if not exits
			if ( substr($this->initial_media_path, 0, 1) != '/' ) {
				$this->initial_media_path = '/'.$this->initial_media_path;
			}
		}else{
			$this->initial_media_path = false;
		}
		return $this->initial_media_path;
	}



	# GET DATO : Format {"counter":1}
	public function get_dato() {
		$dato = parent::get_dato();
		return (object)$dato;
	}



	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		return $this->valor = $this->get_pdf_id() ;
	}
	


	/**
	* GET PDF ID
	* Por defecto se construye con el tipo del component_image actual y el número de orden, ej. 'dd20_rsc750_1'
	* TODO:  Se puede sobreescribir en propiedades con json ej. {"image_id":"dd851"} y se leerá del contenido del componente referenciado
	*/
	public function get_pdf_id() {

		if(isset($this->pdf_id)) return $this->pdf_id;
		
		$dato = $this->get_dato();
		if (!isset($dato->section_id)) {
			if(SHOW_DEBUG) {
				#dump($dato, ' dato ++ '.to_string());
				trigger_error(__METHOD__." Component dato (parent:$this->parent,section_tipo:$this->section_tipo) is empty for: ".to_string($dato));
			}
			return 0;	
		}
		$locator  = new locator($dato);
		$pdf_id	  = $locator->get_flat($dato);

		# Add lang
		if ($this->traducible=='si') {
		$pdf_id .= '_'.DEDALO_DATA_LANG;
		}
		

		return $this->pdf_id = $pdf_id;
	}


	
	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_PDF_QUALITY_DEFAULT;
		return $this->quality;
	}



	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->pdf_id .'.'. DEDALO_PDF_EXTENSION ;
	}
	public function get_target_dir() {
		#return DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $this->get_quality() ;
		return $this->PdfObj->get_media_path_abs();
	}
	


	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();

		# Add tool_image_versions
		$this->ar_tools_name[] = 'tool_pdf_versions';
		$this->ar_tools_name[] = 'tool_transcription';
		
		return parent::get_ar_tools_obj();
	}



	/**
	* GET_PDF_URL
	*/
	public function get_pdf_url($quality=false) {
		/*
		if(!$quality)
		$quality 	= DEDALO_PDF_QUALITY_DEFAULT;
		$pdf_id 	= $this->get_pdf_id();
		
		#$file 		= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $quality .'/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;
		#if(!file_exists($file)) $pdf_id = '0';

		$final_file	= DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER .'/'. $quality .'/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;

		return $final_file;
		*/

		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();

			#dump($this->PdfObj,"PdfObj");dump($this,"this");
		if (!isset($this->PdfObj)) {
			throw new Exception("Error Processing Request (get_pdf_url)", 1);			
		}

		$PdfObj = (object)$this->PdfObj;
		$PdfObj->set_quality($quality);

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		$file 		= $PdfObj->get_local_full_path();
		#if(!file_exists($file)) $pdf_id = '0';
	
		return $PdfObj->get_media_path() . $pdf_id .'.'. $PdfObj->get_extension();
	}


	
	/**
	* GET_PDF_PATH complete absolute file path like '/Users/myuser/works/Dedalo/pdf/standar/dd152-1.pdf'
	* @param string $quality default false
	* @return string $pdf_path
	*/
	public function get_pdf_path($quality=false) {
		/*
		if(!$quality) {
		$quality 	= $this->get_quality();	
		}
		
		$pdf_id 	= $this->get_pdf_id();
		$pdf_path 	= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $quality . '/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;

		return $pdf_path;
		*/
		if(!$quality) {
		$quality = $this->get_quality();	
		}		

		$PdfObj = $this->PdfObj;
		$PdfObj->set_quality($quality);
			
		return $PdfObj->get_local_full_path();
	}

	/**
	* GET_PDF_SIZE
	* Alias of $ImageObj->get_size()
	*/
	public function get_pdf_size($quality=false) {
		
		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();
		$PdfObj 	= new PdfObj($pdf_id, $quality, $this->aditional_path, $this->initial_media_path);
		return $PdfObj->get_size();
	}

	/**
	* GET_FILE_EXISTS
	*/
	public function get_file_exists($quality=false) {

		if(!$quality)
		$quality 	= $this->get_quality();
		$pdf_id 	= $this->get_pdf_id();
		$PdfObj 	= new PdfObj($pdf_id, $quality, $this->aditional_path, $this->initial_media_path);
		
		return $PdfObj->get_file_exists();
	}

	

	


	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files() {

		$date=date("Y-m-d_Hi");

		#
		# PDF remove
		$ar_quality = (array)unserialize(DEDALO_PDF_AR_QUALITY);		
		foreach ($ar_quality as $current_quality) {
			# media_path
			$media_path = $this->get_pdf_path($current_quality);
			if(SHOW_DEBUG) {
				#dump($media_path, ' media_path $current_quality:'.$current_quality);
			}
			if (!file_exists($media_path)) continue; # Skip
			
			# move / rename file
			#$folder_path_del 	= DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER .'/'. $current_quality . '/deleted';
			$folder_path_del 	= $this->get_target_dir()  . 'deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$pdf_id 			= $this->get_pdf_id();
			$media_path_moved 	= $folder_path_del . "/$pdf_id" . '_deleted_' . $date . '.' . DEDALO_PDF_EXTENSION;			
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
				error_log($msg);
				dump($msg, ' msg');
			}
		}#end foreach
		

		return true;
	}#end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	*/
	public function restore_component_media_files() {

		#
		# PDF restore
		$ar_quality = (array)unserialize(DEDALO_PDF_AR_QUALITY);
		foreach ($ar_quality as $current_quality) {

			# media_path
			$media_path = $this->get_target_dir().'/deleted';
			$pdf_id 	= $this->get_pdf_id();
			if(SHOW_DEBUG) {
				#dump($media_path, "media_path $current_quality:$current_quality - get_pdf_id:$pdf_id");
			}
			$file_pattern 	= $media_path.'/'.$pdf_id.'_*.'.DEDALO_PDF_EXTENSION;
			$ar_files 		= glob($file_pattern);
			if(SHOW_DEBUG) {
				#dump($ar_files, ' ar_files');
			}
			if (empty($ar_files)) {
				error_log("No files to restore were found for pdf_id:$pdf_id. Nothing was restored (1)");
				continue; // Skip
			}
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_pdf_path($current_quality);		
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$last_file_path to \n$new_file_path";
				error_log($msg);
				#dump($msg, ' msg');
			}

		}#end foreach

		return true;
	}#end restore_component_media_files



	/**
	* GET_PDF_THUMB
	*
	* OSX Brew problem: [soource: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096]
	* Looks like the issue is that because the PATH variable is not necessarily available to Apache, IM does not actually know where Ghostscript is located.
	* So I modified my delegates.xml file, which in my case is located in [i]/usr/local/Cellar/imagemagick/6.9.3-0_1/etc/ImageMagick-6/delegates.xml[/] and replaced
	* command="&quot;gs&quot;
	* with
	* command="&quot;/usr/local/bin/gs&quot;
	* Once the full path is specified, the command is working as desired.
	*
	* @return string | false $result
	*/
	public function get_pdf_thumb($force_create=false, $absolute=false) {

		$url = false;

		if (!defined('DEDALO_PDF_THUMB_DEFAULT')) {
			define('DEDALO_PDF_THUMB_DEFAULT', 'thumb');
		}
		
		$file_name  = $this->get_pdf_id();
		$thumb_path = DEDALO_MEDIA_BASE_PATH . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';

		#
		# THUMB ALREADY EXISTS
		if (!$force_create && file_exists($thumb_path)) {
			$url = DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';
			# ABSOLUTE (Default false)
			if ($absolute) {
				$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
			}
			return $url;
		}
		
		#
		# THUMB NOT EXISTS: GENERATE FROM PDF
		$path = $this->get_pdf_path();
		if (file_exists($path)) {

			$width  = defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 102;
			$height = defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 57;

			# Like "102x57"
			$dimensions = $width.'x'.$height.'>';

			#$flags 		= '-debug all';
			#$flags 		= " -scale 200x200 -background white -flatten ";
			$command 	= MAGICK_PATH ."convert -alpha off {$path}[0] -thumbnail '$dimensions' -background white -flatten -gravity center -unsharp 0x.5 -quality 90 $thumb_path";
			
			exec($command.' 2>&1', $output, $result);
				#dump($command, ' $command ++ '.to_string()); dump($output, ' result ++ '.to_string($result));

			if ($result==0) {
				# All is ok
				$url = DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';

				# ABSOLUTE (Default false)
				if ($absolute) {
					$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
				}
				return $url;
			}else{
				# An error occurred
				$url = false;
			}
		}

		return $url;
		
	}#end get_pdf_thumb



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {
		
		#if (empty($value)) {	
			$modelo_name = 'component_pdf';
			$component 	 = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
			$value = $component->get_html();
		#}
		return $value;

	}#end render_list_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$force_create 	= false;
		$absolute 		= true;	// otuput absolute path like 'http://myhost/mypath/myimage.jpg';
	
		$valor 			= $this->get_pdf_thumb($force_create, $absolute);	// Note this absolute url is converted to image on export

		return $valor;

	}#end get_valor_export



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA_TIPO
	* @return string | null $related_component_text_area_tipo
	*/
	public function get_related_component_text_area_tipo() {		

		$modelo_name = 'component_text_area';
		$related_component_text_area_tipo = common::get_ar_related_by_model($modelo_name, $this->tipo);

		return $related_component_text_area_tipo;
		
	}#end get_related_component_text_area_tipo




}
?>