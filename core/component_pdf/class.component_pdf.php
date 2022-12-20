<?php
/**
* CLASS COMPONENT PDF
*
*/
class component_pdf extends component_media_common {



	/**
	* CLASS VARS
	*/
		// file name formatted as 'tipo'-'order_id' like dd732-1
		public $pdf_url;



	/**
	* GET_ADDITIONAL_PATH
	* Calculate image additional path from 'properties' JSON config.
	* @return
	*/
	public function get_additional_path() {

		static $ar_additional_path;

		// return if already calculated
			if(isset($this->additional_path)) {
				return $this->additional_path;
			}

		$properties = $this->get_properties();
			// dump($properties, ' get_additional_path properties ++ '.to_string($this->tipo)); // die();
		if (isset($properties->additional_path)) {

			$component_tipo		= $properties->additional_path;
			$component_modelo	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component			= component_common::get_instance(
				$component_modelo,
				$component_tipo,
				$this->get_section_id(),
				'edit',
				DEDALO_DATA_NOLAN,
				$this->get_section_tipo()
			);
			$dato = trim($component->get_valor());

			# Add / at begin if not exits
			if ( substr($dato, 0, 1) != '/' ) {
				$dato = '/'.$dato;
			}

			# Remove / at end if exists
			if ( substr($dato, -1) === '/' ) {
				$dato = substr($dato, 0, -1);
			}

			$ar_additional_path[$this->id] = $dato;

			if(isset($properties->max_items_folder) && empty($dato)) {

				$max_items_folder  = $properties->max_items_folder;
				$parent_section_id = $this->section_id;

				$ar_additional_path[$this->id] = '/'.$max_items_folder*(floor($parent_section_id / $max_items_folder));

				$component->set_dato( $ar_additional_path[$this->id] );
				if (!empty($parent_section_id)) {
					$component->Save();
				}
			}
		}else{

			$ar_additional_path[$this->id] = false;
		}

		// fix additional_path
			$this->additional_path = $ar_additional_path[$this->id];


		return $ar_additional_path[$this->id];
	}//end get_additional_path



	/**
	* GET_INITIAL_MEDIA_PATH
	*/
	public function get_initial_media_path() : string {

		$component_tipo		= $this->tipo;
		// $parent_section	= section::get_instance($this->parent, $this->section_tipo);
		$parent_section		= $this->get_my_section();
		$properties			= $parent_section->get_properties();

		if (isset($properties->initial_media_path->$component_tipo)) {
			$this->initial_media_path = $properties->initial_media_path->$component_tipo;
			# Add / at begin if not exits
			if ( substr($this->initial_media_path, 0, 1) != '/' ) {
				$this->initial_media_path = '/'.$this->initial_media_path;
			}
		}else{
			$this->initial_media_path = false;
		}

		return $this->initial_media_path;
	}//end get_initial_media_path



	/**
	* GET_DEFAULT_QUALITY
	*/
	public function get_default_quality() : string {

		return DEDALO_PDF_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_AR_QUALITY
	* Get the list of defined image qualities in Dédalo config
	* @return array $ar_image_quality
	*/
	public function get_ar_quality() : array {

		$ar_image_quality = DEDALO_PDF_AR_QUALITY;

		return $ar_image_quality;
	}//end get_ar_quality



	/**
	* GET_URL
	* Get PDF url for current quality
	*
	* @param string|bool $quality = null
	* @param bool $test_file = true
	*	Check if file exists. If not use 0.jpg as output
	* @param bool $absolute = false
	* @param bool $default_add = true
	*
	* @return string|null $url
	*	Return relative o absolute url
	*/
	public function get_url(?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=false) : ?string {

		// quality fallback to default
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// pdf id
			$id = $this->get_id();

		// url
			$url = $this->get_media_dir($quality) .'/'. $id .'.'. $this->get_extension();

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $this->get_local_full_path($quality);
				if(!file_exists($file)) {
					if ($default_add===false) {
						return null;
					}
					$url = DEDALO_CORE_URL . '/themes/default/0.pdf';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
			}


		return $url;
	}//end get_url



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
		// public function remove_component_media_files(array $ar_quality=[]) : bool {

		// 	$date=date("Y-m-d_Hi");

		// 	#
		// 	# PDF remove
		// 	$ar_quality = DEDALO_PDF_AR_QUALITY;
		// 	foreach ($ar_quality as $current_quality) {
		// 		# media_path
		// 		$media_path = $this->get_path($current_quality);

		// 		if (!file_exists($media_path)) continue; # Skip

		// 		# move / rename file
		// 		#$folder_path_del 	= DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER .'/'. $current_quality . '/deleted';
		// 		$folder_path_del 	= $this->get_target_dir()  . 'deleted';

		// 		# delete folder exists ?
		// 		if( !is_dir($folder_path_del) ) {
		// 		$create_dir 	= mkdir($folder_path_del, 0777,true);
		// 		if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
		// 		}

		// 		$id 			= $this->get_id();
		// 		$media_path_moved 	= $folder_path_del . "/$id" . '_deleted_' . $date . '.' . DEDALO_PDF_EXTENSION;
		// 		if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

		// 		if(SHOW_DEBUG===true) {
		// 			$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
		// 			error_log($msg);
		// 		}
		// 	}//end foreach


		// 	return true;
		// }//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool
	*/
	public function restore_component_media_files() : bool {

		// PDF restore
		$ar_quality	= DEDALO_PDF_AR_QUALITY;
		$extension	= $this->get_extension();
		foreach ($ar_quality as $current_quality) {

			// media_path
			$media_path = $this->get_media_path($current_quality) . '/deleted';
			$id 	= $this->get_id();

			$file_pattern 	= $media_path .'/'. $id .'_*.'. $extension;
			$ar_files 		= glob($file_pattern);
			if (empty($ar_files)) {
				debug_log(__METHOD__." No files to restore were found for id:$id. Nothing was restored (1) ".to_string(), logger::WARNING);
				continue; // Skip
			}

			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path	= end($ar_files);
			$new_file_path	= $this->get_local_full_path($current_quality);

			// move file
			if( !rename($last_file_path, $new_file_path) ) {
				throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");
			}

			debug_log(__METHOD__." Moved file \n$last_file_path to \n$new_file_path ".to_string(), logger::WARNING);
		}//end foreach


		return true;
	}//end restore_component_media_files



	/**
	* GET_PDF_THUMB
	*
	* OSX Brew problem: [source: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096]
	* Looks like the issue is that because the PATH variable is not necessarily available to Apache, IM does not actually know where Ghostscript is located.
	* So I modified my delegates.xml file, which in my case is located in [i]/usr/local/Cellar/imagemagick/6.9.3-0_1/etc/ImageMagick-6/delegates.xml[/] and replaced
	* command="&quot;gs&quot;
	* with
	* command="&quot;/usr/local/bin/gs&quot;
	* Once the full path is specified, the command is working as desired.
	* @param bool $force_create = false
	* @param bool $absolute = false
	* @return string|false $result
	*/
	public function get_pdf_thumb(bool $force_create=false, bool $absolute=false) : ?string {

		$url = null;

		if (!defined('DEDALO_PDF_THUMB_DEFAULT')) {
			define('DEDALO_PDF_THUMB_DEFAULT', 'thumb');
		}

		$file_name  = $this->get_id();
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
		$quality	= $this->get_default_quality();
		$path		= $this->get_local_full_path($quality);
		if (file_exists($path)) {

			$width  = defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 102;
			$height = defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 57;

			# Like "102x57"
			$dimensions = $width.'x'.$height.'>';

			#$flags 		= '-debug all';
			#$flags 		= " -scale 200x200 -background white -flatten ";
			$command 	= MAGICK_PATH ."convert -alpha off {$path}[0] -thumbnail '$dimensions' -background white -flatten -gravity center -unsharp 0x.5 -quality 90 $thumb_path";

			exec($command.' 2>&1', $output, $result);
			if ($result==0) {
				# All is ok
				$url = DEDALO_MEDIA_URL . DEDALO_PDF_FOLDER . '/' . DEDALO_PDF_THUMB_DEFAULT . '/' . $file_name . '.jpg';

				# ABSOLUTE (Default false)
				if ($absolute) {
					$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
				}
				return $url;
			}else{
				# An error occurred
				debug_log(__METHOD__." An error occurred! Failed command: '$command'  ".to_string(), logger::ERROR);
			}
		}

		return $url;
	}//end get_pdf_thumb



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : string {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$force_create 	= false;
		$absolute 		= true;	// output absolute path like 'http://myhost/mypath/myimage.jpg';

		$valor 			= $this->get_pdf_thumb($force_create, $absolute);	// Note this absolute url is converted to image on export

		return $valor;
	}//end get_valor_export



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA_TIPO
	* @return array $related_component_text_area_tipo
	*/
	public function get_related_component_text_area_tipo() : array {

		$related_component_text_area_tipo = common::get_ar_related_by_model(
			'component_text_area', // model,
			$this->tipo // tipo
		);

		return $related_component_text_area_tipo;
	}//end get_related_component_text_area_tipo



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_PDF_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = defined('DEDALO_PDF_QUALITY_ORIGINAL')
			? DEDALO_PDF_QUALITY_ORIGINAL
			: DEDALO_PDF_QUALITY_DEFAULT;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_PREVIEW_URL
	* @return string $url
	*/
	public function get_preview_url() : string {

		$preview_url = DEDALO_CORE_URL . '/themes/default/icons/file-pdf-o.svg';

		return $preview_url;
	}//end get_preview_url



	/**
	* PROCESS_UPLOADED_FILE
	* @param object $file_data
	*	Data from trigger upload file
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// short vars
			$original_file_name	= $file_data->original_file_name; 	// like "my doc is beaty.psdf"
			$full_file_name		= $file_data->full_file_name;		// like "test175_test65_1.pdf"
			$full_file_path		= $file_data->full_file_path;		// like "/mypath/media/pdf/1.5MB/test175_test65_1.jpg"

		// thumb : Create pdf_thumb
			$thumb_url = $this->get_pdf_thumb( $force_create=true );

		// transcription to text automatic
			$ar_related_component_text_area_tipo = $this->get_related_component_text_area_tipo();
			if (!empty($ar_related_component_text_area_tipo)) {

				$related_component_text_area_tipo	= reset($ar_related_component_text_area_tipo);
				$related_component_text_area_model	= RecordObj_dd::get_modelo_name_by_tipo($related_component_text_area_tipo,true);
				$quality							= $this->get_default_quality();
				$target_pdf_path					= $this->get_local_full_path($quality);

				try {
					$options = new stdClass();
						$options->path_pdf 	 = (string)$target_pdf_path;	# full source pdf file path
						#$options->first_page = (int)$pagina_inicial;		# number of first page. default is 1
					$text_from_pdf_response = (object)component_pdf::get_text_from_pdf( $options );
						#debug_log(__METHOD__." tool_transcription response ".to_string($text_from_pdf_response), logger::DEBUG);
						// dump($text_from_pdf_response, ' text_from_pdf_response ++ '.to_string());

					if( $text_from_pdf_response->result!=='error' && strlen($text_from_pdf_response->original)>2  ) {

						$component_text_area = component_common::get_instance(
							$related_component_text_area_model,
							$related_component_text_area_tipo,
							$this->section_id,
							'edit',
							DEDALO_DATA_LANG,
							$this->section_tipo
						);
						$component_text_area->set_dato($text_from_pdf_response->result); // Text with page numbers
						$component_text_area->Save();
					}

				} catch (Exception $e) {
					debug_log(__METHOD__." Caught exception:  ".$e->getMessage(), logger::ERROR);
				}
			}//end if (!empty($related_component_text_area_tipo)) {


		try {

			// target_filename. Save original file name in a component_input_text if defined
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					$current_section_id			= $this->get_section_id();
					$target_section_tipo		= $this->get_section_tipo();
					$model_name_target_filename	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename,true);
					$component_target_filename	= component_common::get_instance(
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

			// add data with the file uploaded
				// if ($quality===DEDALO_PDF_QUALITY_DEFAULT) {
				// 	$dato			= $this->get_dato();
				// 	$value			= empty($dato) ? new stdClass() : reset($dato);
				// 	$media_value	= $this->build_media_value((object)[
				// 		'value'		=> $value,
				// 		'file_name'	=> $original_file_name
				// 	]);
				// 	$this->set_dato([$media_value]);
				// 	$this->Save();
				// }

			// get files info
				$files_info	= [];
				$ar_quality = DEDALO_PDF_AR_QUALITY;
				foreach ($ar_quality as $current_quality) {
					if ($current_quality==='thumb') continue;
					// read file if exists to get file_info
					$file_info = $this->get_quality_file_info($current_quality);
					// add non empty quality files data
					if (!empty($file_info)) {
						$files_info[] = $file_info;
					}
				}

			// save component dato
				$dato		= $this->get_dato();
				$save_dato	= false;
				if (isset($dato[0])) {
					if (!is_object($dato[0])) {
						// bad dato
						debug_log(__METHOD__." ERROR. BAD COMPONENT DATO ".to_string($dato), logger::ERROR);
					}else{
						// update property files_info
						$dato[0]->files_info = $files_info;
						$save_dato = true;
					}
				}else{
					// create a new dato from scratch
					$dato_item = (object)[
						'files_info' => $files_info
					];
					$dato = [$dato_item];
					$save_dato = true;
				}
				if ($save_dato===true) {
					$this->set_dato($dato);
					$this->Save();
				}

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

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
	public static function get_text_from_pdf(object $new_options) : object {

		$response = new stdClass();

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

		$response->result	= (string)$pdf_text;
		$response->msg		= "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original	= trim($original_text);


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
	# @return bool
	public static function valid_utf8(string $string) : bool {
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
	* @param string $string = ''
	* @param bool $control = false
	* @param string $string
	*/
	public static function utf8_clean(string $string='', bool $control=false) : string {

	    $string = iconv('UTF-8', 'UTF-8//IGNORE', $string);
	    
		return $string;
	}//end utf8_clean



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files dir
	* @see component_image->remove_component_media_files
	*
	* @return object $response
	*/
	public function delete_file(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files([$quality]);
		if ($result===true) {

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}


		return $response;
	}//end delete_file



	/**
	* GET_EXTENSION
	* @return string DEDALO_PDF_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_PDF_EXTENSION;
	}//end get_extension



	/**
	* GET_FOLDER
	* 	Get element dir from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_PDF_FOLDER;
	}//end get_folder



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$update_version	= implode('.', $options->update_version);
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		switch ($update_version) {

			case '6.0.0':
				$is_old_dato = (
					empty($dato_unchanged) || // v5 early case
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				// $is_old_dato = true; // force here
				if ($is_old_dato===true) {

					// create the component pdf
						$model		= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_pdf'
							$options->tipo,
							$options->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$options->section_tipo
						);

					// get existing files data
						$file_name			= $component->get_name();
						$source_quality		= $component->get_original_quality();
						$additional_path	= $component->get_additional_path();
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension(); // 'pdf' fallback is expected

						$base_path	= DEDALO_PDF_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH   . $base_path . '/' . $file_name . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= DEDALO_PDF_FOLDER . $initial_media_path . '/' . $source_quality . $additional_path;
								$file			= DEDALO_MEDIA_PATH   . $base_path . '/' . $file_name . '.' . $component->get_extension();
							}
							// try again
							if(!file_exists($file)) {
								// reset bad dato
								$response = new stdClass();
									$response->result	= 1;
									$response->new_dato	= null;
									$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string(null).".<br />";
								// $response = new stdClass();
								// 	$response->result	= 2;
								// 	$response->msg		= "[$reference_id] Current dato don't need update. No files found (original,default)<br />";	// to_string($dato_unchanged)."
								return $response;
							}

					// source_file_upload_date
						$dd_date							= new dd_date();
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= $dd_date->get_date_from_timestamp($upload_date_timestamp);
						$source_file_upload_date->time		= dd_date::convert_date_to_seconds($source_file_upload_date);
						$source_file_upload_date->timestamp	= $upload_date_timestamp;

					// get the source file name
						$source_file_name = pathinfo($file)['basename'];

					// offset
						$offset = !empty($dato_unchanged) &&
							(is_object($dato_unchanged) && isset($dato_unchanged->offset) ||  // object case
							is_array($dato_unchanged) && isset($dato_unchanged[0]->offset)) // array case
								? $dato_unchanged[0]->offset
								: null;

					// lib_data
						$lib_data = !empty($offset)
							? (object)[
								'offset' => $offset
							  ]
							: null;

					// get files info
						$files_info	= [];
						$ar_quality = DEDALO_PDF_AR_QUALITY;
						foreach ($ar_quality as $current_quality) {
							if ($current_quality==='thumb') continue;
							// read file if exists to get file_info
							$file_info = $component->get_quality_file_info($current_quality);
							// add non empty quality files data
							if (!empty($file_info)) {
								// Note that source_quality could be original or default
								if ($current_quality===$source_quality) {
									$file_info->upload_info = (object)[
										'file_name'	=> $source_file_name ?? null,
										'date'		=> $source_file_upload_date ?? null,
										'user'		=> null // unknown here
									];
								}
								// add
								$files_info[] = $file_info;
							}
						}

					// create new dato
						$dato_item = new stdClass();
							$dato_item->files_info	= $files_info;
							$dato_item->lib_data	= $lib_data;

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						debug_log(__METHOD__." update_version new_dato ".to_string($new_dato), logger::DEBUG);

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version



}//end class component_pdf
