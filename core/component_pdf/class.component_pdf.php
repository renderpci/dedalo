<?php
declare(strict_types=1);
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
	* GET_AR_QUALITY
	* Get the list of defined image qualities in Dédalo config
	* @return array $ar_image_quality
	*/
	public function get_ar_quality() : array {

		$ar_image_quality = DEDALO_PDF_AR_QUALITY;

		return $ar_image_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* @return string $default_quality
	* Defined in config file
	*/
	public function get_default_quality() : string {

		return DEDALO_PDF_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* @return string $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_PDF_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_EXTENSION
	* @return string DEDALO_PDF_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_PDF_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_PDF_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* 	Get element dir from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_PDF_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Extensions list of preferable extensions in original or modified qualities.
	* Ordered by most preferable extension, first is the best.
	* @return array
	*/
	public function get_best_extensions() : array {

		return ['pdf'];
	}//end get_best_extensions



	/**
	* GET_GRID_VALUE (USE MEDIA_COMMON->get_grid_value INSTEAD !)
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $grid_cell_object
	*/
		// public function get_grid_value(object $ddo=null) : dd_grid_cell_object {

		// 	// column_obj. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
		// 		$column_obj = isset($this->column_obj)
		// 			? $this->column_obj
		// 			: (object)[
		// 				'id' => $this->section_tipo.'_'.$this->tipo
		// 			  ];

		// 	// current_url. get from dato
		// 		$dato = $this->get_dato();
		// 		if(isset($dato)){
		// 			$element_quality = ($this->mode==='edit')
		// 				? $this->get_default_quality()
		// 				: $this->get_thumb_quality();

		// 			$current_url = $this->get_url(
		// 				$element_quality, // string quality
		// 				false, // bool test_file
		// 				true,  // bool absolute
		// 				false // bool default_add
		// 			);
		// 		}else{
		// 			$current_url = '';
		// 		}

		// 	// label
		// 		$label = $this->get_label();

		// 	// class_list
		// 		$class_list = isset($ddo)
		// 			? ($ddo->class_list ?? null)
		// 			: null;

		// 	// value
		// 		$grid_cell_object = new dd_grid_cell_object();
		// 			$grid_cell_object->set_type('column');
		// 			$grid_cell_object->set_label($label);
		// 			$grid_cell_object->set_ar_columns_obj([$column_obj]);
		// 			$grid_cell_object->set_cell_type('text');
		// 			if(isset($class_list)){
		// 				$grid_cell_object->set_class_list($class_list);
		// 			}
		// 			$grid_cell_object->set_value([$current_url]);


		// 	return $grid_cell_object;
		// }//end get_grid_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string|null $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : ?string {

		if (empty($valor)) {
			$this->get_dato(); // Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed JSON string as dato
		}

		$thumb_quality	= $this->get_thumb_quality();
		$valor			= $this->get_url(
			$thumb_quality,
			false,
			true,  // absolute, output absolute path like 'http://myhost/mypath/myimage.jpg';
			false
		);	// Note this absolute url is converted to image on export


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
		// 		$media_path = $this->get_media_filepath($current_quality);

		// 		if (!file_exists($media_path)) continue; # Skip

		// 		# move / rename file
		// 		#$folder_path_del 	= DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER .'/'. $current_quality . '/deleted';
		// 		$folder_path_del 	= $this->get_media_path_dir()  . 'deleted';

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
	* RESTORE_COMPONENT_MEDIA_FILES (! Moved to media common)
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool
	*/
		// public function restore_component_media_files() : bool {

		// 	// element restore
		// 	$ar_quality	= $this->get_ar_quality();
		// 	$extension	= $this->get_extension();
		// 	foreach ($ar_quality as $current_quality) {

		// 		// media_path
		// 		$media_path	= $this->get_media_path_dir($current_quality) . '/deleted';
		// 		$id			= $this->get_id();

		// 		$file_pattern	= $media_path .'/'. $id .'_*.'. $extension;
		// 		$ar_files		= glob($file_pattern);
		// 		if (empty($ar_files)) {
		// 			debug_log(__METHOD__
		// 				." No files to restore were found for id:$id. Nothing was restored (1) "
		// 				, logger::WARNING
		// 			);
		// 			continue; // Skip
		// 		}

		// 		natsort($ar_files);	# sort the files from newest to oldest
		// 		$last_file_path	= end($ar_files);
		// 		$new_file_path	= $this->get_media_filepath($current_quality);

		// 		// move file
		// 		if( !rename($last_file_path, $new_file_path) ) {
		// 			// throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");
		// 			debug_log(__METHOD__
		// 				. " Error on move files to restore folder. Permission denied . Nothing was restored (2) " . PHP_EOL
		// 				. 'last_file_path: '. $last_file_path . PHP_EOL
		// 				. 'new_file_path: '. $new_file_path
		// 				, logger::ERROR
		// 			);
		// 		}

		// 		debug_log(__METHOD__
		// 			." Moved file $last_file_path to $new_file_path "
		// 			, logger::WARNING
		// 		);
		// 	}//end foreach


		// 	return true;
		// }//end restore_component_media_files



	/**
	* CREATE_THUMB
	*
	* OSX Brew problem: [source: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096]
	* Looks like the issue is that because the PATH variable is not necessarily available to Apache, IM does not actually know where Ghostscript is located.
	* So I modified my delegates.xml file, which in my case is located in [i]/usr/local/Cellar/imagemagick/6.9.3-0_1/etc/ImageMagick-6/delegates.xml[/] and replaced
	* command="&quot;gs&quot;
	* with
	* command="&quot;/usr/local/bin/gs&quot;
	* @return bool
	*/
	public function create_thumb() : bool {

		// check config constant definition
			if (!defined('DEDALO_QUALITY_THUMB')) {
				define('DEDALO_QUALITY_THUMB', 'thumb');
				debug_log(__METHOD__." Undefined config 'DEDALO_QUALITY_THUMB'. Using fallback 'thumb' value".to_string(), logger::WARNING);
			}

		// thumb_path
			// $file_name	= $this->get_id();
			// $target_path	= $this->get_media_path_dir('thumb');

			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

			// $target_file		= $target_path . '/' . $file_name . '.'. $thumb_extension;

		// thumb not exists case: generate from PDF
			$quality		= $this->get_default_quality();
			$source_file	= $this->get_media_filepath($quality);
			if (!file_exists($source_file)) {
				debug_log(__METHOD__
					." default quality file doesn't exists, is not possible to create a thumb"
					, logger::WARNING
				);

				return false;
			}

		// dimensions . Like "102x57"
			$width		= defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 224;
			$height		= defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 149;
			$dimensions	= $width.'x'.$height;

			$thumb_pdf_options = new stdClass();
				$thumb_pdf_options->source_file = $source_file;
				$thumb_pdf_options->ar_layers 	= [0];
				$thumb_pdf_options->target_file = $target_file;
				$thumb_pdf_options->density		= 150;
				$thumb_pdf_options->antialias	= true;
				$thumb_pdf_options->quality		= 75;
				$thumb_pdf_options->resize		= $dimensions;

			$result = ImageMagick::convert($thumb_pdf_options);

		// exec command
			// exec($command.' 2>&1', $output, $result_code);
			if ($result===false) {
				return false;
			}

		return true;
	}//end create_thumb



	/**
	* CREATE_IMAGE
	* Once the full path is specified, the command is working as desired.
	* @param object|null $options
	* @return bool $result
	*/
	public function create_image(?object $options=null) : string|bool {

		// options
			$page		= $options->page ?? 0;
			$quality	= $options->quality ?? $this->get_original_quality();
			$overwrite	= $options->overwrite ?? true;

		// source file
			$source_file = $this->get_media_filepath($quality);
			if (!file_exists($source_file)) {
				debug_log(__METHOD__
					. " Ignored image creation. Source file do not exists " . PHP_EOL
					. 'source_file: ' . to_string($source_file)
					, logger::ERROR
				);
				return false;
			}

		// target file
			$file_name				= $this->get_id();
			$folder					= $this->get_folder();
			$target_path			= $this->get_media_path_dir($quality);
			$alternative_extensions	= $this->get_alternative_extensions() ?? [];

			foreach ($alternative_extensions as $current_extension) {

				$target_file = $target_path . '/' . $file_name . '.' . $current_extension;

				// no overwrite case
					if ($overwrite===false) {
						// check if file already exists
						if (file_exists($target_file)) {
							continue;
						}
					}

				// generate from PDF
				$image_pdf_options = new stdClass();
					$image_pdf_options->source_file	= $source_file;
					$image_pdf_options->ar_layers	= [$page];
					$image_pdf_options->target_file	= $target_file;
					$image_pdf_options->density		= 600;
					$image_pdf_options->antialias	= true;
					$image_pdf_options->quality		= 100;
					$image_pdf_options->resize		= '50%';

				ImageMagick::convert($image_pdf_options);

				// check file
				if (!file_exists($target_file)) {
					debug_log(__METHOD__
						. " Error on image creation. target file do not exists " . PHP_EOL
						. 'target_file: ' . to_string($target_file)
						, logger::ERROR
					);
					return false;
				}
			}

		return true;
	}//end create_image



	/**
	* PROCESS_UPLOADED_FILE
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object $file_data
	*	Data from trigger upload file
	* {
	* 	original_file_name : string like 'Homogenous categories.doc',
	* 	full_file_name : string like 'rsc37_rsc176_18.doc',
	* 	full_file_path : string like '/../dedalo/media/pdf/original/0/rsc37_rsc176_18.doc'
	* }
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($file_data->original_file_name) ||
				empty($file_data->full_file_path) ||
				empty($file_data->full_file_name)
			) {
				debug_log(__METHOD__
					. " Not enough file_data variables " . PHP_EOL
					. ' file_data: ' . to_string($file_data)
					, logger::ERROR
				);
				$response->msg .= 'Not enough file_data variables';
				return $response;
			}

		// short vars
			$original_file_name			= $file_data->original_file_name;	// like "my doc is beaty.psdf"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/pdf/original/test175_test65_1.jpg"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.pdf"
			$first_page					= $file_data->first_page ?? 1;		// used to assign the correct number to page tag of the transcription text
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// upload info
			$original_quality = $this->get_original_quality();
			if ($this->quality===$original_quality) {
				// update upload file info
				$dato = $this->get_dato();
				$key = 0;
				if (!isset($dato[$key]) || !is_object($dato[$key])) {
					$dato[$key] = new stdClass();
				}
				$dato[$key]->original_file_name			= $original_file_name;
				$dato[$key]->original_normalized_name	= $original_normalized_name;
				$dato[$key]->original_upload_date		= component_date::get_date_now();

				$this->set_dato($dato);
			}

		// debug
			debug_log(__METHOD__
				. " process_uploaded_file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

			// copy original to default quality (in the future, a quality conversion script will be placed here)
				$file_extension		= pathinfo($original_file_name)['extension']; // could be .pages, .doc, .pdf, etc.
				$default_extension	= $this->get_extension(); // normally .pdf
				if ($file_extension!==$default_extension) {
					// file is NOT pdf, probably a .doc or similar . Don't copy the file
				}else{
					// copying file pdf (original) to pdf (web)
					$default_quality		= $this->get_default_quality();
					$default_quality_path	= $this->get_media_path_dir($default_quality);
					// check directory exists before copy
					if (!is_dir($default_quality_path)) {
						if(!mkdir($default_quality_path, 0750, true)) {
							debug_log(__METHOD__
								.' Error. Unable to create default_quality_path directory' . PHP_EOL
								.' default_quality_path: ' .$default_quality_path
								, logger::ERROR
							);
							$response->msg .= ' : Unable to create default_quality_path directory';
							return $response;
						}
					}
					$target_file_path	= $default_quality_path . '/' . $full_file_name;
					$copy_result		= copy(
						$full_file_path, // from original quality directory
						$target_file_path // to default quality directory
					);
					if ($copy_result===false) {
						debug_log(__METHOD__ . PHP_EOL
							. " Error: Unable to copy pdf file : " . PHP_EOL
							. ' Source path: ' . $full_file_path . PHP_EOL
							. ' Target path: ' . $target_file_path
							, logger::ERROR
						);
					}else{

						// create alternative image of versions the default quality
						$create_image_options = new stdClass();
						$create_image_options->quality = $default_quality;
						$this->create_image($create_image_options);

						debug_log(__METHOD__ . PHP_EOL
							. " Copied pdf file (".$full_file_path." -> ".$target_file_path.") : " . PHP_EOL
							. ' Source path: ' . $full_file_path . PHP_EOL
							. ' Target path: ' . $target_file_path
							, logger::DEBUG
						);

					}

					// create alternative image versions of the PDF
						$this->create_image();

					// thumb : Create pdf_thumb image
						$this->create_thumb();

					// transcription to text automatic
						$ar_related_component_text_area_tipo = $this->get_related_component_text_area_tipo();
						if (!empty($ar_related_component_text_area_tipo)) {

							$related_component_text_area_tipo	= reset($ar_related_component_text_area_tipo);
							$related_component_text_area_model	= RecordObj_dd::get_modelo_name_by_tipo($related_component_text_area_tipo,true);
							$quality							= $this->get_default_quality();
							$target_pdf_path					= $this->get_media_filepath($quality);

							try {
								$options = new stdClass();
									$options->path_pdf		= (string)$target_pdf_path;	# full source pdf file path
									$options->first_page	= (int)$first_page;		# number of first page. default is 1
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
										$this->section_tipo,
										false
									);
									$component_text_area->set_dato($text_from_pdf_response->result); // Text with page numbers
									$component_text_area->Save();
								}

							} catch (Exception $e) {
								debug_log(__METHOD__." Caught exception:  ".$e->getMessage(), logger::ERROR);
							}
						}//end if (!empty($related_component_text_area_tipo))
				}//end if ($file_extension!==$default_extension)

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
						$target_section_tipo,
						false
					);
					$component_target_filename->set_dato( $original_file_name );
					$component_target_filename->Save();
				}

			// save component dato
				// Note that save action don't change upload info properties,
				// but force updates every quality file info in property 'files_info
				$this->Save();

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
	* RENAME_OLD_FILES
	* @param $file_name string as 'test175_test65_3'
	* @param $folder_path string
	* @return object $response
	*/
	public function rename_old_files(string $file_name, string $folder_path) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// quality original check
			$quality			= $this->get_quality();
			$original_quality	= $this->get_original_quality();
			if ($quality!==$original_quality) {
				// only moves non original files. Originals are preserved across uploads
				return parent::rename_old_files($file_name, $folder_path);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__METHOD__.']';


		return $response;
	}//end rename_old_files



	/**
	* GET_ALTERNATIVE_EXTENSIONS
	* @return array|null $alternative_extensions
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = defined('DEDALO_PDF_ALTERNATIVE_EXTENSIONS')
			? DEDALO_PDF_ALTERNATIVE_EXTENSIONS
			: null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* GET_TEXT_FROM_PDF
	* Extract text from PDF file
	* @param object $new_options
	* @return object $response
	*/
	public static function get_text_from_pdf(object $new_options) : object {

		$response = new stdClass();

		$options = new stdClass();
			$options->path_pdf		= null;	// full source pdf file path
			$options->first_page	= 1; 	// number of first page. default is 1

		// new_options overwrite options defaults
			foreach ((object)$new_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}

		// error on missing properties
			if (empty($options->path_pdf) || !file_exists($options->path_pdf)) {
				$response->result	= 'error';
				$response->msg		= "Error Processing Request pdf_automatic_transcription: source PDF file not found";
				return $response;
			}

		// test engine pdf to text
			if (defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')===false) {
				$response->result	= 'error';
				$response->msg		= "Error Processing Request pdf_automatic_transcription: config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined";
				return $response;
			}else{
				$transcription_engine = shell_exec('type -P '.PDF_AUTOMATIC_TRANSCRIPTION_ENGINE);
				if (empty($transcription_engine)) {
					$response->result	= 'error';
					$response->msg		= "Error Processing Request pdf_automatic_transcription: daemon engine not found";
					return $response;
				}
			}

		#
		# FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename 	= substr($options->path_pdf, 0, -4) .'.txt';

		$command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $options->path_pdf";
		debug_log(__METHOD__
			. " Executing PDF command:" . PHP_EOL
			. $command . PHP_EOL
			, logger::WARNING
		);
		$output = exec("$command 2>&1", $result); // Generate text version file in same dir as pdf
		if ( strpos( strtolower($output), 'error') ) {
			$response->result	= 'error';
			$response->msg		= "$output";
			return $response;
		}

		if (!file_exists($text_filename)) {
			$response->result	= 'error';
			$response->msg		= "Error Processing Request pdf_automatic_transcription: Text file not found";
			return $response;
		}
		$pdf_text = file_get_contents($text_filename);	# Read current text file


		#
		# TEST STRING VALUE IS VALID
		# Test is valid utf8
		$test_utf8 = self::valid_utf8($pdf_text);
		if (!$test_utf8) {
			debug_log(__METHOD__
				." WARNING: Current string is NOT utf8 valid. Anyway continue ... "
				, logger::WARNING
			);
		}

		# Remove non utf8 chars
		$pdf_text = self::utf8_clean($pdf_text);

		# Test JSON conversion before save
		$pdf_text 	= json_handler::encode($pdf_text);
		if (!$pdf_text) {
			$response->result	= 'error';
			$response->msg		= "Error Processing Request pdf_automatic_transcription: String is not valid because format encoding is wrong";
			return $response;
		}
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		$pdf_text 	= trim($pdf_text);	// Trim before check is empty
		if (empty($pdf_text)) {
			$response->result	= 'error';
			$response->msg		= "Error Processing Request pdf_automatic_transcription: Empty text";
			return $response;
		}

		#
		# PAGES TAGS
		$original_text	= str_replace("","", $pdf_text);
		$pages			= explode("", $pdf_text);
		$i				= (int)$options->first_page;
		$pdf_text		= '';
		foreach ($pages as $current_page) {
			$pdf_text .= '<p>';
			$pdf_text .= '[page-n-'. $i .']';
			$pdf_text .= '</p>';
			$pdf_text .= '<p>';
			$pdf_text .= str_replace(["\r\n", "\n\r", "\n", "\r"], '</p><p>' , $current_page);
			$pdf_text .= '</p>';
			$i++;
		}

		$response->result	= (string)$pdf_text;
		$response->msg		= "Ok Processing Request pdf_automatic_transcription: text processed";
		$response->original	= trim($original_text);


		return $response;
	}//end build_pdf_transcription



	/**
	*  VALID_UTF8
	* utf8 encoding validation developed based on Wikipedia entry at:
	* http://en.wikipedia.org/wiki/UTF-8
	* Implemented as a recursive descent parser based on a simple state machine
	* copyright 2005 Maarten Meijer
	* This cries out for a C-implementation to be included in PHP core
	* @return bool
	*/
	public static function valid_utf8(string $string) : bool {
		$len = strlen($string);

		if (!function_exists('valid_1byte')) {
			function valid_1byte($char) {
				if(!is_int($char)) return false;
				return ($char & 0x80) == 0x00;
			}
		}
		if (!function_exists('valid_2byte')) {
			function valid_2byte($char) {
				if(!is_int($char)) return false;
				return ($char & 0xE0) == 0xC0;
			}
		}
		if (!function_exists('valid_3byte')) {
			function valid_3byte($char) {
				if(!is_int($char)) return false;
				return ($char & 0xF0) == 0xE0;
			}
		}
		if (!function_exists('valid_4byte')) {
			function valid_4byte($char) {
				if(!is_int($char)) return false;
				return ($char & 0xF8) == 0xF0;
			}
		}
		if (!function_exists('valid_nextbyte')) {
			function valid_nextbyte($char) {
				if(!is_int($char)) return false;
				return ($char & 0xC0) == 0x80;
			}
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
	* UPDATE_DATO_VERSION
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$dato_unchanged	= $options->dato_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_dato';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {

			case '6.2.0':
				// same case as '6.0.1'. regenerate_component is enough to create thumb and alternative versions
			case '6.0.1':
				// component instance
					$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo,
						false
					);

				// run update cache (this action updates files info and saves)
					$component->regenerate_component();
					$new_dato = $component->get_dato();

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				break;

			case '6.0.0':
				$is_old_dato = (
					empty($dato_unchanged) || // v5 early case
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				// $is_old_dato = true; // force here
				if ($is_old_dato===true) {

					// create the component pdf
						$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_pdf'
							$tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo,
							false
						);

					// get existing files data
						$file_name			= $component->get_name();
						$source_quality		= $component->get_original_quality();
						$folder				= $component->get_folder(); // like DEDALO_PDF_FOLDER
						$additional_path	= $component->additional_path;
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension(); // 'pdf' fallback is expected

						$base_path	= $folder . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= $folder . $initial_media_path . '/' . $source_quality . $additional_path;
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
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= dd_date::get_dd_date_from_timestamp($upload_date_timestamp);
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
						$ar_quality	= DEDALO_PDF_AR_QUALITY;
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
						$dato_item = (object)[
							'files_info'	=> $files_info,
							'lib_data'		=> $lib_data
						];

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						debug_log(__METHOD__." update_version new_dato ".to_string($new_dato), logger::DEBUG);

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					// clean vars
						unset($source_file_upload_date);
						unset($files_info);
						unset($lib_data);
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



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-build and save its data
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// quality
			$ar_quality = $this->get_ar_quality();
			foreach ($ar_quality as $quality) {
				// create_image. Creates alternative images if they do not exists
				$this->create_image((object)[
					'overwrite'	=> false,
					'quality'	=> $quality
				]);
			}

		// common regenerate_component exec after specific actions (this action saves at the end)
			$result = parent::regenerate_component();

		// regenerate PDF text
			// transcription to text automatic
			$ar_related_component_text_area_tipo = $this->get_related_component_text_area_tipo();
			if (!empty($ar_related_component_text_area_tipo)) {

				$related_component_text_area_tipo	= reset($ar_related_component_text_area_tipo);
				$related_component_text_area_model	= RecordObj_dd::get_modelo_name_by_tipo($related_component_text_area_tipo,true);

				$component_text_area = component_common::get_instance(
					$related_component_text_area_model,
					$related_component_text_area_tipo,
					$this->section_id,
					'edit',
					DEDALO_DATA_LANG,
					$this->section_tipo,
					false
				);
				// current value
				$component_text_area_dato	= $component_text_area->get_dato();
				$component_text_area_value	= $component_text_area_dato[0] ?? null;

				// extract text only if text area value is empty
				if (empty($component_text_area_value)) {
					$quality			= $this->get_default_quality();
					$target_pdf_path	= $this->get_media_filepath($quality);
					if (file_exists($target_pdf_path)) {

						$text_options = new stdClass();
							$text_options->path_pdf		= $target_pdf_path;	// full source PDF file path
							$text_options->first_page	= 1; // number of first page. default is 1

						try {
							$text_from_pdf_response = component_pdf::get_text_from_pdf( $text_options );
						} catch (Exception $e) {
							debug_log(__METHOD__
								. " Caught exception: " . PHP_EOL
								. $e->getMessage()
								, logger::ERROR
							);
						}

						if (
							isset($text_from_pdf_response) &&
							$text_from_pdf_response->result!=='error' &&
							strlen($text_from_pdf_response->original)>2
							) {

							// set and save extracted text
							$component_text_area->set_dato($text_from_pdf_response->result);
							$component_text_area->Save();
						}
					}//end if (file_exists($target_pdf_path))
				}//end if (empty($component_text_area_value))
			}//end if (!empty($related_component_text_area_tipo))


		return $result;
	}//end regenerate_component



	/**
	* CREATE_ALTERNATIVE_VERSION
	* $this->create_alternative($current_quality, $current_extension);
	* @return bool
	*/
	public function create_alternative_version(string $quality, string $extension) : bool {

		// skip thumb quality
			if ($quality===DEDALO_QUALITY_THUMB) {
				return false;
			}

		// skip non defined extensions
			if ( !in_array($extension, $this->get_alternative_extensions()) ) {
				debug_log(__METHOD__
					. " Trying to create alternative version with invalid extension: '$extension' "
					, logger::ERROR
				);
				return false;
			}

		// source file
			$source_file = $this->get_media_filepath($quality);
			if (!file_exists($source_file)) {
				debug_log(__METHOD__
					. " Ignored alternative_version creation. Source file do not exists " . PHP_EOL
					. 'source_file: ' . to_string($source_file)
					, logger::ERROR
				);
				return false;
			}

		// short vars
			$page			= 0;
			$file_name		= $this->get_id();
			$target_path	= $this->get_media_path_dir($quality);
			$target_file	= $target_path . '/' . $file_name . '.' . strtolower($extension);

		// generate from PDF
			$image_pdf_options = new stdClass();
				$image_pdf_options->source_file	= $source_file;
				$image_pdf_options->ar_layers	= [$page];
				$image_pdf_options->target_file	= $target_file;
				$image_pdf_options->density		= 600;
				$image_pdf_options->antialias	= true;
				$image_pdf_options->quality		= 100;
				$image_pdf_options->resize		= '50%';

			ImageMagick::convert($image_pdf_options);

		// check file
			if (!file_exists($target_file)) {
				debug_log(__METHOD__
					. " Error on image creation. target file do not exists " . PHP_EOL
					. 'target_file: ' . to_string($target_file)
					, logger::ERROR
				);
				return false;
			}


		return true;
	}//end create_alternative_version



}//end class component_pdf
