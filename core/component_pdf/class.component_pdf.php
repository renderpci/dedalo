<?php declare(strict_types=1);
/**
* CLASS COMPONENT PDF
*
*/
class component_pdf extends component_media_common implements component_media_interface {



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
	* GET_NORMALIZED_AR_QUALITY
	* @return array $normalized_ar_quality
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$default_quality = $this->get_default_quality();

		$normalized_ar_quality = [$default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



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
	* Get element DEDALO_PDF_FOLDER value from config
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
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @param $valor=null
	* @param $lang=DEDALO_DATA_LANG
	* @param $quotes=null
	* @param $add_id=null
	* @return string|null $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) : ?string {

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
	* Returns related component_text_area tipos (used to write PDF text)
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
	* CREATE_THUMB
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
				debug_log(__METHOD__
					." Undefined config 'DEDALO_QUALITY_THUMB'. Using fallback 'thumb' value"
					, logger::WARNING
				);
			}

		// thumb_path
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// thumb do not exists case: generate from PDF
			$source_file = $this->get_media_filepath( $this->get_default_quality() );
			if (!file_exists($source_file)) {
				debug_log(__METHOD__
					." default quality file doesn't exists, it is not possible to create a thumb"
					, logger::WARNING
				);
				return false;
			}

		// dimensions . Like "102x57"
			$width		= defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 224;
			$height		= defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 149;
			$dimensions	= $width.'x'.$height;

		// convert
			$thumb_options = new stdClass();
				$thumb_options->source_file	= $source_file;
				$thumb_options->ar_layers	= [0];
				$thumb_options->target_file	= $target_file;
				$thumb_options->density		= 72;
				$thumb_options->antialias	= true;
				$thumb_options->quality		= 75;
				$thumb_options->resize		= $dimensions;
				$thumb_options->pdf_cropbox	= true;

			ImageMagick::convert($thumb_options);


		return true;
	}//end create_thumb



	/**
	* PROCESS_UPLOADED_FILE
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object|null $file_data
	*	Data from trigger upload file
	* {
	* 	original_file_name : string like 'Homogenous categories.doc',
	* 	full_file_name : string like 'rsc37_rsc176_18.doc',
	* 	full_file_path : string like '/../dedalo/media/pdf/original/0/rsc37_rsc176_18.doc'
	* }
	* @param object|null $process_options
	* optional parameters to process the file
	* {
	* 	ocr : true // true||false  process the file with the OCR engine
	* 	ocr_lang : 'lg-eng' // to be used in the OCR process
	* }
	* @return object $response
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($file_data) ||
				empty($file_data->original_file_name) ||
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
			$original_normalized_name	= $full_file_name;
			$file_extension 			= get_file_extension( $full_file_path );// like «pfd» or «doc»

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

			// target_filename. Save original file name in a component_input_text if defined
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					$current_section_id			= $this->get_section_id();
					$target_section_tipo		= $this->get_section_tipo();
					$model_name_target_filename	= ontology_node::get_model_by_tipo($properties->target_filename,true);
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

			// if the file uploaded is not a valid PDF, don't process as OCR of get his text.
			// this cases are: «odt», «doc», «pages» files, or other document file.
				if( $file_extension !== $this->get_extension() ){

					// Save to update the data of the component with the new file
					$this->Save();

					// all is OK
					$response->result	= true;
					$response->msg		= 'OK. Request done ['.__METHOD__.'] ';
					return $response;
				}

			// Generate default_pdf_format : copy the PDF to web format
			// original file is conserved (like myfilename.pdf and myfilename.doc)
			// regenerate component will create the default quality calling build()
			// build() will check the normalized files of the original
			// then if the normalized files doesn't exist, will create it
			// then will create the JPG format of the default
			// then save the data.
				$regenerate_options = new stdClass();
					$regenerate_options->first_page		= $file_data->first_page ?? 1;		// used to assign the correct number to page tag of the transcription text
					$regenerate_options->transcription	= true;
					$regenerate_options->ocr			= $process_options->ocr ?? false;
					$regenerate_options->ocr_lang		= $process_options->ocr_lang ?? null;

			// process PDF files regenerating the component.
				$result = $this->regenerate_component( $regenerate_options );

				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
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
	* BUILD_VERSION - Overwrite in each component for real process
	* Creates a new version based on target quality
	* (!) Note that this generic method only copy files,
	* to real process, overwrite in each component !
	* @param string $quality
	* @param bool $async = true
	* @param bool $save = true
	* @return object $response
	* @test true
	*/
	public function build_version( string $quality, bool $async=true, bool $save=true ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// CLI process data
			if ( running_in_cli()===true ) {
				$start_time=start_time();
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
			}

		// thumb case
			if($quality===$this->get_thumb_quality()){
				// thumb quality
				$result = $this->create_thumb();

				$response->result	= $result;
				$response->msg		= $result===false ? 'Error building version' : 'OK request done';
				return $response;
			}

		//check files that can not be processed
			// source file
				$source_file = $this->get_media_filepath( $this->get_original_quality() );

			// // get the extension of the document to be checked if valid to be processed
			// if the file uploaded is not a valid PDF, don't process as OCR of get his text.
			// this cases are: «odt», «doc», «pages» files, or other document file.
				if( !file_exists($source_file) ){
					$response->result	= 'Ok';
					$response->msg		= 'File can not be processed';
					return $response;
				}

		// short vars
			$original_quality	= $this->get_original_quality();
			$original_file_path	= $this->get_original_file_path($original_quality);

			// check path from original file
			if (empty($original_file_path)) {
				$response->msg .= ' Invalid empty original_file_path. Skip conversion';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. " original_quality: " . $original_quality . PHP_EOL
					. ' original_file_path: ' . to_string($original_file_path)
					, logger::ERROR
				);
				$response->errors[] = 'invalid empty original_file_path';
				return $response;
			}
			if (!file_exists($original_file_path)) {
				$response->msg .= ' original_file_path file not found. Skip conversion';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. " original_quality: " . $original_quality . PHP_EOL
					. ' original_file_path: ' . to_string($original_file_path)
					, logger::ERROR
				);
				$response->errors[] = 'original_file_path file not found';
				return $response;
			}
			$target_quality_path = $this->get_media_filepath($quality);

			// check target directory
			$target_dir = pathinfo($target_quality_path)['dirname'];
			if (!is_dir($target_dir)) {
				// create it
				if(!mkdir($target_dir, 0750, true)) {
					$msg = ' Error. Creating directory ' . $target_dir ;
					debug_log(__METHOD__
						.$msg . PHP_EOL
						.' target_dir: ' .$target_dir
						, logger::ERROR
					);
					$response->msg .= $msg;
					$response->errors[] = 'creating directory failed';
					return $response;
				}
			}

		// copying file PDF (original) to PDF (web)
			$default_quality		= $this->get_default_quality();
			$default_quality_path	= $this->get_media_path_dir($default_quality);
			// check directory exists before copy (if folder do not exists, it will be created)
			$dir_exists = create_directory($default_quality_path, 0750);
			if (!$dir_exists) {
				debug_log(__METHOD__
					.' Error. Unable to create default_quality_path directory' . PHP_EOL
					.' default_quality_path: ' .$default_quality_path
					, logger::ERROR
				);
				$response->msg .= ' : Unable to create default_quality_path directory';
				return $response;
			}

			// copy file if is not default quality
			if ($target_quality_path!==$original_file_path) {

				$copy_result = copy(
					$original_file_path, // from original quality directory
					$target_quality_path // to default quality directory
				);
				if ($copy_result===false) {
					debug_log(__METHOD__ . PHP_EOL
						. " Error: Unable to copy PDF file : " . PHP_EOL
						. ' Source path: ' . $original_file_path . PHP_EOL
						. ' Target path: ' . $target_quality_path
						, logger::ERROR
					);
				}else{
					debug_log(__METHOD__ . PHP_EOL
						. " Copied PDF file (".$original_file_path." -> ".$target_quality_path.") : " . PHP_EOL
						. ' Source path: ' . $original_file_path . PHP_EOL
						. ' Target path: ' . $target_quality_path
						, logger::DEBUG
					);
				}
			}

		// Alternative versions
			$alternative_extensions	= $this->get_alternative_extensions() ?? [];
			foreach ($alternative_extensions as $current_extension) {

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg				= (label::get_label('processing') ?? 'Processing') . ' alternative version: ' . $current_extension . ' | id: ' . $this->section_id;
						common::$pdata->memory			= dd_memory_usage();
						common::$pdata->target_quality	= $quality;
						common::$pdata->current_time	= exec_time_unit($start_time, 'ms');
						common::$pdata->total_ms		= (common::$pdata->total_ms ?? 0) + common::$pdata->current_time; // cumulative time
						// send to output
						print_cli(common::$pdata);
					}

				// create alternative version file
				$this->create_alternative_version(
					$quality,
					$current_extension
				);
			}

			// all is OK
			$response->result			= $copy_result;
			$response->msg				= 'Building file version in background';
			$response->command_response	= null;


		return $response;
	}//end build_version



	/**
	* RENAME_OLD_FILES
	* @param string $file_name string
	* 	as 'test175_test65_3'
	* @param $folder_path string
	* @return object $response
	* {
	* 	result : boo
	* 	msg: string
	* }
	*/
	public function rename_old_files( string $file_name, string $folder_path ) : object {

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
	* Read config DEDALO_PDF_ALTERNATIVE_EXTENSIONS value or null
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
	* @param object $options
	* @return object $response
	*/
	public function get_text_from_pdf( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		//options
			$engine			= $options->engine ?? PDF_AUTOMATIC_TRANSCRIPTION_ENGINE;
			$method			= $options->method ?? 'text_engine'; // string text|html
			$page_in		= $options->page_in ?? 1; // number of first page. default is 1
			$page_out		= $options->page_out ?? null;

		// Source file
			$source_file = $this->get_media_filepath( $this->get_default_quality() );

		// error on missing properties
			if ( !file_exists($source_file) ) {
				$response->result = false;
				$response->msg 	  = "Error Processing Request pdf_automatic_transcription: source PDF file not found";
				debug_log(__METHOD__
					." $response->msg "
					.' pdf_path:' . to_string($source_file)
					, logger::ERROR
				);
				$response->errors[] = 'source file not found';
				return $response;
			}

		// test transcription_engine pdf to text
			$transcription_engine = shell_exec( 'type -P '.$engine ?? '' );
			if ( empty($transcription_engine) ) {
				$response->result	= false;
				$response->msg		= "Error Processing Request pdf_automatic_transcription: daemon engine not found";
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' extractor_engine: ' . to_string($transcription_engine)
					, logger::ERROR
				);
				$response->errors[] = 'daemon engine not found';
				return $response;
			}

			// engine config $options:
			// text_engine
				// -f <int>				: first page to convert
				// -l <int>				: last page to convert
				// -layout				: maintain original physical layout
				// -simple				: simple one-column page layout
				// -enc <string>		: output text encoding name
			// html_engine
				// -f <int> 			: first page to convert
				// -l <int> 			: last page to convert
				// -p					: exchange .pdf links by .html
				// -c					: generate complex document
				// -s					: generate single document that includes all pages
				// -i					: ignore images
				// -noframes			: generate no frames
				// -stdout				: use standard output
				// -hidden				: output hidden text
				// -nomerge				: do not merge paragraphs
				// -enc <string>		: output text encoding name

		// Engine config

		$engine_config = '';

		if(!empty($page_in)){
			$engine_config .= ' -f ' .$page_in;
		}
		if(!empty($page_out)){
			$engine_config .= ' -l ' .$page_out;
		}

		$file_extension = '.txt';
		if($method==='html_engine'){
			$engine_config .= ' -i -p -noframes -layout ' ;
			$file_extension = '.html';
		}

		#
		# FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename 	= substr($source_file, 0, -4) . $file_extension;

		$command  = $engine ." -enc UTF-8". "$engine_config $source_file $text_filename";

		// $command  = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 $source_file";
		debug_log(__METHOD__
			. " Executing PDF command:" . PHP_EOL
			. $command . PHP_EOL
			, logger::WARNING
		);
		$output = exec($command, $result); // Generate text version file in same dir as pdf
		if ( strpos( strtolower($output), 'error') ) {
			$response->result	= false;
			$response->msg		= "$output";
			debug_log(__METHOD__
				." $response->msg ".PHP_EOL
				. 'result: '.to_string($result)
				, logger::ERROR
			);
			$response->errors[] = 'daemon engine response error: ' . $output;
			return $response;
		}

		if ( !file_exists($text_filename) ) {
			$response->result	= false;
			$response->msg		= "Error Processing Request pdf_automatic_transcription: Text file not found";
			debug_log(__METHOD__
				." $response->msg "
				, logger::ERROR
			);
			$response->errors[] = 'extraction file do not exists';
			return $response;
		}

		// pdf_text contents
		$pdf_text = file_get_contents($text_filename);	// Read current text file

		# TEST STRING VALUE IS VALID
		# Test is valid utf8
		$test_utf8 = self::valid_utf8($pdf_text);
		if (!$test_utf8) {
			$response->errors[] = 'current string is NOT utf8 valid';
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
			$response->errors[] = 'bad format encoding';
			return $response;
		}
		$pdf_text 	= json_handler::decode($pdf_text);	# JSON is valid. We turn object to string
		$pdf_text 	= trim($pdf_text);	// Trim before check is empty
		if (empty($pdf_text)) {
			$response->result	= 'error';
			$response->msg		= "Error Processing Request pdf_automatic_transcription: Empty text";
			$response->errors[] = 'empty text';
			return $response;
		}

		# PAGES TAGS
		$original_text	= str_replace("","", $pdf_text); // original text without page marks
		if($method==='text_engine'){
			$pages			= explode("", $pdf_text); // split by the page mark invisible text of return character
			$i				= (int)$page_in;
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
		}

		$response->result	= (string)$pdf_text;
		$response->msg		= empty($response->errors)
			? 'OK. Processing Request pdf_automatic_transcription: text processed'
			: 'Warning: some errors were found';
		$response->original	= trim($original_text);


		return $response;
	}//end build_pdf_transcription



	/**
	* PROCESS_OCR_FILE
	* @param object $options
	* @return object $response
	*/
	public function process_ocr_file( object $options ) : object {

		$response = new stdClass();

		// options vars
		$source_file	= $options->source_file;
		$ocr_lang		= $options->ocr_lang;

		// test OCR engine
			if ( defined('PDF_OCR_ENGINE')===false ) {
				$response->result	= 'error';
				$response->msg		= "Error OCR Processing Request: config PDF_OCR_ENGINE is not defined";

				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' PDF_OCR_ENGINE is not defined: ' . to_string(PDF_OCR_ENGINE)
					, logger::ERROR
				);
				return $response;
			}else{
				$ocr_engine = shell_exec('type -P '.PDF_OCR_ENGINE);
				if (empty($ocr_engine)) {
					$response->result	= 'error';
					$response->msg		= "Error OCR Processing Request: daemon engine not found";

					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' ocr engine: ' . to_string($ocr_engine)
						, logger::ERROR
					);
					return $response;
				}
			}

		// lang
		// get the 3 tld of the lang, when it not set get the data lang.
		$lang = isset($ocr_lang)
			? str_replace('lg-', '' , $ocr_lang)
			: str_replace('lg-', '' , DEDALO_DATA_LANG);

		// Lang exceptions
		switch($lang) {
			// Valencià languge exception, when is set change it for cat - Català
			case 'vlca':
				$lang = 'cat';
				break;
			default:
				break;
		}

		$command  = escapeshellcmd(PDF_OCR_ENGINE.' --pdfa-image-compression lossless -l '
			.escapeshellarg($lang).' --force-ocr '
			.escapeshellarg($source_file).' '
			.escapeshellarg($source_file));
		debug_log(__METHOD__
			. " Executing PDF command:" . PHP_EOL
			. $command . PHP_EOL
			, logger::WARNING
		);
		$output = exec($command, $result); // Generate OCR pdf file in the same directory, replace the input file (usually the web version)
		if ( strpos( strtolower($output), 'error') ) {
			$response->result	= 'error';
			$response->msg		= "$output";
			return $response;
		}

		if (!file_exists($source_file)) {
			$response->result	= 'error';
			$response->msg		= "Error Processing Request pdf_automatic_transcription: Text file not found";
			return $response;
		}

		$response->result	= 'ok';
		$response->msg		= PHP_EOL.json_encode($result). PHP_EOL. "Done! OCR Processing Request was finished";

		return $response;
	}//end process_ocr_file



	/**
	*  VALID_UTF8
	* utf8 encoding validation developed based on Wikipedia entry at:
	* http://en.wikipedia.org/wiki/UTF-8
	* Implemented as a recursive descent parser based on a simple state machine
	* copyright 2005 Maarten Meijer
	* This cries out for a C-implementation to be included in PHP core
	* @return bool
	*/
	public static function valid_utf8( string $string ) : bool {
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
	* @param string $string
	*/
	public static function utf8_clean( string $string='' ) : string {

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
	public static function update_dato_version( object $options ) : object {

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
					$model		= ontology_node::get_model_by_tipo($tipo, true);
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
					(is_object($dato_unchanged) && property_exists($dato_unchanged, 'scalar')) || // mdcat old data cases
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				// $is_old_dato = true; // force here
				if ($is_old_dato===true) {

					// create the component pdf
						$model		= ontology_node::get_model_by_tipo($tipo,true);
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
	* @param object|null $options=null
	* @return bool
	*/
	public function regenerate_component( ?object $options=null ) : bool {

		// Options
			$first_page					= $options->first_page ?? 1;		// used to assign the correct number to page tag of the transcription text
			$transcription				= $options->transcription ?? true;
			$ocr						= $options->ocr ?? false;
			$ocr_lang					= $options->ocr_lang ?? null;
			$delete_normalized_files	= $options->delete_normalized_files ?? true;

		// source file
			$source_file = $this->get_media_filepath( $this->get_original_quality() );

		// get the extension of the document to be checked if valid to be processed
			$original_extension = $this->get_original_extension();// like «pfd» or «doc»

		// if the file uploaded is not a valid PDF, don't process as OCR of get his text.
		// this cases are: «odt», «doc», «pages» files, or other document file.
			if( !file_exists($source_file) ){
				return true;
			}

			if( isset($original_extension) && ( $original_extension !== $this->get_extension() )){
				$delete_normalized_files = false;
			}

		// source file
			$source_file = $this->get_media_filepath( $this->get_original_quality() );

		// generate OCR version
			if( $ocr===true && file_exists($source_file) ){

				$ocr_options = new stdClass();
					$ocr_options->source_file	= (string)$source_file;	# full source pdf file path
					$ocr_options->ocr_lang		= $ocr_lang;		# lang used to process the file

				$ocr_response = component_pdf::process_ocr_file( $ocr_options );
			}

		// common regenerate_component exec after specific actions (this action saves at the end)
			$regenerate_options = new stdClass();
				$regenerate_options->delete_normalized_files = $delete_normalized_files;

			$result = parent::regenerate_component( $regenerate_options );

		// regenerate PDF text
			// transcription to text automatic
			if( $transcription === true && file_exists($source_file) ){
				$ar_related_component_text_area_tipo = $this->get_related_component_text_area_tipo();
				if (!empty($ar_related_component_text_area_tipo)) {

					$related_component_text_area_tipo	= reset($ar_related_component_text_area_tipo);
					$related_component_text_area_model	= ontology_node::get_model_by_tipo($related_component_text_area_tipo,true);

					$component_text_area = component_common::get_instance(
						$related_component_text_area_model,
						$related_component_text_area_tipo,
						$this->section_id,
						'edit',
						DEDALO_DATA_LANG,
						$this->section_tipo,
						false
					);

					// extract text only if text area value is empty
					// if (empty($component_text_area_value)) {
						$quality			= $this->get_default_quality();
						$target_pdf_path	= $this->get_media_filepath($quality);
						if (file_exists($target_pdf_path)) {

							$text_options = new stdClass();
								$text_options->path_pdf		= $target_pdf_path;	// full source PDF file path
								$text_options->first_page	= $first_page; // number of first page. default is 1

							try {
								$text_from_pdf_response = $this->get_text_from_pdf( $text_options );
							} catch (Exception $e) {
								debug_log(__METHOD__
									. " Caught exception: " . PHP_EOL
									. $e->getMessage()
									, logger::ERROR
								);
							}

							if (
								isset($text_from_pdf_response) &&
								$text_from_pdf_response->result!==false &&
								strlen($text_from_pdf_response->original)>2
								) {

								// set and save extracted text
								$component_text_area->set_dato($text_from_pdf_response->result);
								$component_text_area->Save();
							}
						}//end if (file_exists($target_pdf_path))
					// }//end if (empty($component_text_area_value))
				}//end if (!empty($related_component_text_area_tipo))
			}//end  if( $transcription === true && file_exists($source_file) )


		return $result;
	}//end regenerate_component



	/**
	* CREATE_ALTERNATIVE_VERSION
	* Render a new alternative_version file from given quality and target extension.
	* This method overwrites any existing file with same path
	* @param string $quality
	* @param string $extension
	* @param object|null $options = null
	* @return bool
	*/
	public function create_alternative_version( string $quality, string $extension, ?object $options=null ) : bool {

		// options
			$page = $options->page ?? 0;

		// skip thumb quality
			if ($quality===$this->get_thumb_quality()) {
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
			$file_name		= $this->get_id();
			$target_path	= $this->get_media_path_dir($quality);
			$target_file	= $target_path . '/' . $file_name . '.' . strtolower($extension);

			$original_quality = $this->get_original_quality();
		// generate from PDF
			$im_options = new stdClass();
				$im_options->source_file	= $source_file;
				$im_options->target_file	= $target_file;
				$im_options->quality		= ($quality === $original_quality) ? 100 : 95;
				$im_options->ar_layers		= [$page];
				$im_options->density		= ($quality === $original_quality) ? 300 : 150;
				$im_options->antialias		= true;
				$im_options->resize			= ($quality === $original_quality) ? '100%' : '75%';
				$im_options->pdf_cropbox	= true;

			ImageMagick::convert($im_options);

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
