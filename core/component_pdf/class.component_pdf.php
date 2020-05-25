<?php
/*
* CLASS COMPONENT PDF
*/
require_once(DEDALO_CORE_PATH . '/media_engine/class.PdfObj.php');

class component_pdf extends component_media_common {


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

		if(SHOW_DEBUG===true) {
			$start_time = microtime(1);
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no no están estas variables asignadas)

			# Set and fix current video_id
			$this->pdf_id = $this->get_pdf_id();

			# INITIAL MEDIA PATH SET
			$this->initial_media_path = $this->get_initial_media_path();

			# ADITIONAL_PATH : Set and fix current aditional image path
			$this->aditional_path = $this->get_aditional_path();

			# PDFOBJ : Add a PdfObj obj
			$this->PdfObj = new PdfObj( $this->pdf_id, $this->get_quality(), $this->aditional_path, $this->initial_media_path );

		/*
		if ($need_save) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			# DEBUG
			if(SHOW_DEBUG===true) {
				$total=round(microtime(true)-$start_time,3);
				$name = RecordObj_dd::get_termino_by_tipo($this->tipo,true);
				error_log("DEBUG INFO ".__METHOD__." Saved $name with dato ".$locator->get_flat()." of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");
			}
		}//end if ($need_save)

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		*/

		return true;
	}//end __construct



	/**
	* SAVE
	* Overwrite component common method
	* This component don´t save any data for now
	* @return int $section_id
	*/
	public function Save() {

		return parent::Save();
	}//end Save


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
			$dato 		= trim($component->get_valor(0));

			# Add / at begin if not exits
			if ( substr($dato, 0, 1) != '/' ) {
				$dato = '/'.$dato;
			}

			# Remove / at end if exists
			if ( substr($dato, -1) === '/' ) {
				$dato = substr($dato, 0, -1);
			}

			$ar_aditional_path[$this->pdf_id] = $dato;

			if(isset($propiedades->max_items_folder) && empty($dato)) {

				$max_items_folder  = $propiedades->max_items_folder;
				$parent_section_id = $this->parent;

				$ar_aditional_path[$this->pdf_id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

				$component->set_dato( $ar_aditional_path[$this->pdf_id] );
				if (!empty($parent_section_id)) {
					$component->Save();
				}
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


	# GET DATO : Format
	public function get_dato() {
		$dato = parent::get_dato();
		return $dato;
	}


	# SET_DATO
	public function set_dato($dato) {

		parent::set_dato( $dato );
	}//end set_dato


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		return $this->get_pdf_id();
	}//end get_valor


	/**
	* GET_ID
	* Alias of get_pdf_id
	*/
	public function get_id() {

		return $this->get_pdf_id();
	}//end get_id


	/**
	* GET PDF ID
	* Por defecto se construye con el tipo del component_image actual y el número de orden, ej. 'dd20_rsc750_1'
	* TODO:  Se puede sobreescribir en propiedades con json ej. {"image_id":"dd851"} y se leerá del contenido del componente referenciado
	*/
	public function get_pdf_id() {

		if(isset($this->pdf_id)) return $this->pdf_id;
		$section_id = $this->get_section_id();

		if (!isset($section_id)) {
			if(SHOW_DEBUG===true) {
				error_log(__METHOD__." Component dato (parent:$this->section_id,section_tipo:$this->section_tipo) is empty for: ".to_string(''));
			}
			return 0;
		}
		$locator  = new locator();
			$locator->set_section_tipo($this->get_section_tipo());
			$locator->set_section_id($this->get_section_id());
			$locator->set_component_tipo($this->get_tipo());

		$pdf_id	  = $locator->get_flat();

		# Add lang
		if ($this->traducible==='si') {
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


	/**
	* GET_TARGET_DIR
	*/
	public function get_target_dir() {

		#return DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER .'/'. $this->get_quality() ;
		return $this->PdfObj->get_media_path_abs();
	}// end get_target_dir


	/**
	* GET_PDF_URL
	* Get pdf url for current quality
	* @param string | bool $quality
	*	optional default (bool)false
	* @param bool $test_file
	*	Check if file exists. If not use 0.jpg as output. Default true
	* @param bool $absolute
	*	Return relative o absolute url. Default false (relative)
	*/
	public function get_pdf_url($quality=false, $test_file=true, $absolute=false, $default_add=false) {

		// quality fallback to default
			if(!$quality) $quality = $this->get_quality();

		// pdf id
			$pdf_id = $this->get_pdf_id();

		// Check PdfObj
			if (!isset($this->PdfObj)) {
				throw new Exception("Error Processing Request (get_pdf_url)", 1);
			}

		// PdfObj
			$PdfObj = (object)$this->PdfObj;
			$PdfObj->set_quality($quality);

		// url
			$url = $PdfObj->get_media_path() . $pdf_id .'.'. DEDALO_PDF_EXTENSION;

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $PdfObj->get_local_full_path();
				if(!file_exists($file)) {
					if ($default_add===false) {
						return false;
					}
					$url = DEDALO_CORE_URL . '/themes/default/0.pdf';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
			}


		return $url;
	}//end get_pdf_url


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
		$pdf_path 	= DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER .'/'. $quality . '/'. $pdf_id .'.'. DEDALO_PDF_EXTENSION ;

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

			if (!file_exists($media_path)) continue; # Skip

			# move / rename file
			#$folder_path_del 	= DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER .'/'. $current_quality . '/deleted';
			$folder_path_del 	= $this->get_target_dir()  . 'deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$pdf_id 			= $this->get_pdf_id();
			$media_path_moved 	= $folder_path_del . "/$pdf_id" . '_deleted_' . $date . '.' . DEDALO_PDF_EXTENSION;
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
				error_log($msg);
			}
		}//end foreach


		return true;
	}//end remove_component_media_files



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

			$file_pattern 	= $media_path.'/'.$pdf_id.'_*.'.DEDALO_PDF_EXTENSION;
			$ar_files 		= glob($file_pattern);

			if (empty($ar_files)) {
				error_log("No files to restore were found for pdf_id:$pdf_id. Nothing was restored (1)");
				continue; // Skip
			}
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_pdf_path($current_quality);
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." \nMoved file \n$last_file_path to \n$new_file_path";
				error_log($msg);
			}

		}//end foreach

		return true;
	}//end restore_component_media_files



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
		$thumb_path = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';

		#
		# THUMB ALREADY EXISTS
		if (!$force_create && file_exists($thumb_path)) {
			$url = DEDALO_MEDIA_URL . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';
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

			if ($result===0) {
				# All is ok
				$url = DEDALO_MEDIA_URL . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';

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
	}//end get_pdf_thumb



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {

		$diffusion_value = $this->get_pdf_url(DEDALO_PDF_QUALITY_DEFAULT);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$force_create 	= false;
		$absolute 		= true;	// otuput absolute path like 'http://myhost/mypath/myimage.jpg';

		$valor 			= $this->get_pdf_thumb($force_create, $absolute);	// Note this absolute url is converted to image on export

		return $valor;
	}//end get_valor_export



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA_TIPO
	* @return string | null $related_component_text_area_tipo
	*/
	public function get_related_component_text_area_tipo() {

		$modelo_name = 'component_text_area';
		$related_component_text_area_tipo = common::get_ar_related_by_model($modelo_name, $this->tipo);

		return $related_component_text_area_tipo;
	}//end get_related_component_text_area_tipo



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() {

		$allowed_extensions = is_array(DEDALO_PDF_EXTENSIONS_SUPPORTED)
			? DEDALO_PDF_EXTENSIONS_SUPPORTED
			: unserialize(DEDALO_PDF_EXTENSIONS_SUPPORTED);

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return $original_quality
	*/
	public function get_original_quality() {

		$original_quality = defined('DEDALO_PDF_QUALITY_ORIGINAL')
			? DEDALO_PDF_QUALITY_ORIGINAL
			: DEDALO_PDF_QUALITY_DEFAULT;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_PREVIEW_URL
	* @return string $url
	*/
	public function get_preview_url() {

		$preview_url = DEDALO_CORE_URL . '/themes/default/icons/file-pdf-o.svg';

		return $preview_url;
	}//end get_preview_url



	/**
	* PROCESS_UPLOADED_FILE
	* @param object $file_data
	*	Data from trigger upload file
	* @return object $response
	*/
	public function process_uploaded_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// vars
			$original_file_name = $file_data->original_file_name; 	// like "my doc is beaty.psdf"
			$full_file_name 	= $file_data->full_file_name;		// like "test175_test65_1.pdf"
			$full_file_path 	= $file_data->full_file_path;		// like "/mypath/media/pdf/1.5MB/test175_test65_1.jpg"


		// thumb : Create pdf_thumb
			$thumb_url = $this->get_pdf_thumb( $force_create=true );


		// transcription to text automatic
			$ar_related_component_text_area_tipo = $this->get_related_component_text_area_tipo();
				#dump($ar_related_component_text_area_tipo, ' ar_related_component_text_area_tipo ++ '.$this->get_tipo().to_string());
			if (!empty($ar_related_component_text_area_tipo)) {

				$related_component_text_area_tipo 	= reset($ar_related_component_text_area_tipo);
				$related_component_text_area_model 	= RecordObj_dd::get_modelo_name_by_tipo($related_component_text_area_tipo,true);
				$target_pdf_path 				  	= $this->get_pdf_path();

				try {
					$options = new stdClass();
						$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
						#$options->first_page = (int)$pagina_inicial;		# number of first page. default is 1
					$text_from_pdf_response = (object)component_pdf::get_text_from_pdf( $options );
						#debug_log(__METHOD__." tool_transcription response ".to_string($text_from_pdf_response), logger::DEBUG);
						// dump($text_from_pdf_response, ' text_from_pdf_response ++ '.to_string());

					if( $text_from_pdf_response->result!=='error' && strlen($text_from_pdf_response->original)>2  ) {

						$component_text_area = component_common::get_instance($related_component_text_area_model,
																			  $related_component_text_area_tipo,
																			  $this->section_id,
																			  'edit',
																			  DEDALO_DATA_LANG,
																			  $this->section_tipo);
						$component_text_area->set_dato($text_from_pdf_response->result); // Text with page numbers
						$component_text_area->Save();
					}

				} catch (Exception $e) {
				    debug_log(__METHOD__." Caught exception:  ".$e->getMessage(), logger::ERROR);
				}

			}//end if (!empty($related_component_text_area_tipo)) {




			try {

				// target_filename. Save original file name in a component_input_text if defined
					$properties = $this->get_propiedades();
					if (isset($properties->target_filename)) {

						$current_section_id  		= $this->get_section_id();
						$target_section_tipo 		= $this->get_section_tipo();
						$model_name_target_filename = RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename,true);
						$component_target_filename 	= component_common::get_instance(
																			$model_name_target_filename,
																			$properties->target_filename,
																			$current_section_id,
																			'edit',
																			DEDALO_DATA_NOLAN,
																			$target_section_tipo
																			);
						$component_target_filename->set_dato( $original_file_name );
						$component_target_filename->Save();
					}


				// add data with the file uploaded, only for original and retouched images, other quality images don't has relevant info.

						$file_name		= 'original_file_name';
						$upload_date 	= 'original_upload_date';
						$dato  = $this->get_dato();
						$value = empty($dato) ? new stdClass() : reset($dato);
							$value->$file_name 		= $original_file_name;
							$value->$upload_date	= component_date::get_date_now();
						$this->set_dato([$value]);
						$this->Save();

				// all is ok
					$response->result 	= true;
					$response->msg 		= 'Ok. Request done ['.__METHOD__.'] ';

			} catch (Exception $e) {
				$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= ' - '.$msg;
			}


		return $response;
	}//end process_uploaded_file



	/**
	* GET_TEXT_FROM_PDF
	* Extract text from pdf file
	* @param object $new_options
	* @return object $response
	*/
	public static function get_text_from_pdf( $new_options ) {

		$response=new stdClass();

		$options = new stdClass();
			$options->path_pdf 	 = null;	# full source pdf file path
			$options->first_page = 1; 		# number of first page. default is 1

		// new_options overwrite options defaults
			foreach ((object)$new_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}

		// error on missing properties
			if (empty($options->path_pdf) || !file_exists($options->path_pdf)) {
				$response->result = 'error';
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: source pdf file not found";
				return $response;
			}


		// test engine pdf to text
			if (defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')===false) {
				$response->result = 'error';
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined";
				return $response;
			}else{
				$transcription_engine = trim(shell_exec('type -P '.PDF_AUTOMATIC_TRANSCRIPTION_ENGINE));
				if (empty($transcription_engine)) {
					$response->result = 'error';
					$response->msg 	  = "Error Processing Request pdf_automatic_transcription: daemon engine not found";
					return $response;
				}
			}

		#
		# FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename 	= substr($options->path_pdf, 0, -4) .'.txt';

		$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $options->path_pdf";
		$output   = exec( "$command 2>&1", $result);	# Generate text version file in same dir as pdf
		if ( strpos( strtolower($output), 'error')) {
			$response->result = 'error';
			$response->msg 	  = "$output";
			return $response;
		}

		if (!file_exists($text_filename)) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Text file not found";
			return $response;
		}
		$pdf_text = file_get_contents($text_filename);	# Read current text file


		#
		# TEST STRING VALUE IS VALID
		# Test is valid utf8
		$test_utf8 = self::valid_utf8($pdf_text);
		if (!$test_utf8) {
			error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		}

		# Remove non utf8 chars
		$pdf_text = self::utf8_clean($pdf_text);

		# Test JSON conversion before save
		$pdf_text 	= json_handler::encode($pdf_text);
		if (!$pdf_text) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: String is not valid because format encoding is wrong";
			return $response;
		}
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		$pdf_text 	= trim($pdf_text);	// Trim before check is empty
		if (empty($pdf_text)) {
			$response->result = 'error';
			$response->msg 	  = "Error Processing Request pdf_automatic_transcription: Empty text";
			return $response;
		}

		#
		# PAGES TAGS
		$original_text = str_replace("","", $pdf_text);
		$pages = explode("", $pdf_text);
		$i=(int)$options->first_page;
		$pdf_text='';
		foreach ($pages as $current_page) {
		    $pdf_text .= '[page-n-'. $i .']';
		    $pdf_text .= '<br>';
		    $pdf_text .= nl2br($current_page);
		    $i++;
		}

		$response->result  = (string)$pdf_text;
		$response->msg 	   = "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original = trim($original_text);


		return $response;
	}//end build_pdf_transcription



	#
	# FUNCTIONS
	#
	# VALID_UTF8
	# utf8 encoding validation developed based on Wikipedia entry at:
	# http://en.wikipedia.org/wiki/UTF-8
	# Implemented as a recursive descent parser based on a simple state machine
	# copyright 2005 Maarten Meijer
	# This cries out for a C-implementation to be included in PHP core
	public static function valid_utf8($string) {
		$len = strlen($string);

		function valid_1byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0x80) == 0x00;
		}
		function valid_2byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xE0) == 0xC0;
		}
		function valid_3byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xF0) == 0xE0;
		}
		function valid_4byte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xF8) == 0xF0;
		}
		function valid_nextbyte($char) {
			if(!is_int($char)) return false;
			return ($char & 0xC0) == 0x80;
		}

		$i = 0;
		while( $i < $len ) {
			$char = ord(substr($string, $i++, 1));
			if(valid_1byte($char)) {    // continue
				continue;
			} else if(valid_2byte($char)) { // check 1 byte
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
			} else if(valid_3byte($char)) { // check 2 bytes
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
			} else if(valid_4byte($char)) { // check 3 bytes
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
				if(!valid_nextbyte(ord(substr($string, $i++, 1))))
					return false;
			} // goto next char
		}

		return true;
	}//end valid_utf8



	/**
	* UTF8_CLEAN
	*/
	public static function utf8_clean($string, $control = false) {
	    $string = iconv('UTF-8', 'UTF-8//IGNORE', $string);
	    return $string;

	    if ($control === true)
	    {
	        return preg_replace('~\p{C}+~u', '', $string);
	    }

	    return preg_replace(array('~\r\n?~', '~[^\P{C}\t\n]+~u'), array("\n", ''), $string);
	}//end utf8_clean



}//end class
