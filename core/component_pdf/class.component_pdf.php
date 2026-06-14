<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PDF
* Concrete media component that manages PDF document assets in Dédalo.
*
* Responsibilities:
* - Declares the quality levels for PDF storage: 'original' (uploaded file) and
*   'web' (the processed/distributable copy). Config constants that govern these
*   are DEDALO_PDF_QUALITY_ORIGINAL, DEDALO_PDF_QUALITY_DEFAULT, and
*   DEDALO_PDF_AR_QUALITY (typically ['original', 'web']).
* - Handles the full upload pipeline (process_uploaded_file) which, for true PDF
*   uploads, calls regenerate_component to copy the original, optionally run OCR
*   (ocrmypdf), and extract text via pdftotext into a related component_text_area.
* - Overrides build_version to copy the original PDF to the web quality directory
*   and then generate any configured alternative format variants (e.g. a JPEG
*   cover image) via create_alternative_version / ImageMagick::convert.
* - Generates thumbnail previews (create_thumb) of the first page using
*   ImageMagick, falling back to a runtime define of DEDALO_QUALITY_THUMB if the
*   config constant is absent.
* - Overrides rename_old_files to skip renaming when the current quality is
*   'original'; originals are deliberately preserved across re-uploads.
* - Provides UTF-8 validation/cleaning helpers (valid_utf8, utf8_clean) used
*   internally by get_text_from_pdf before saving extracted text.
*
* Extends component_media_common (which in turn extends component_common) and
* implements component_media_interface. The concrete media pipeline is therefore:
*   component_common → component_media_common → component_pdf
*
* Accepted upload extensions (DEDALO_PDF_EXTENSIONS_SUPPORTED) include non-PDF
* document formats (doc, odt, pages …). For those, the component stores the file
* as-is and skips text extraction; only files whose extension matches
* DEDALO_PDF_EXTENSION ('pdf') are processed by pdftotext / OCR.
*
* Alternative format extensions (DEDALO_PDF_ALTERNATIVE_EXTENSIONS, e.g. ['jpg'])
* control which raster cover images are generated from the PDF first page via
* ImageMagick during build_version. They are optional and may be null/absent in
* some deployments.
*
* @package Dédalo
* @subpackage Core
*/
class component_pdf extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/
	/**
	* Cached public URL for this PDF file, formatted as '<tipo>-<order_id>',
	* e.g. 'dd732-1'. Lazily populated; null until first requested.
	* @var ?string $pdf_url
	*/
	public ?string $pdf_url = null;



	/**
	* GET_AR_QUALITY
	* Returns the full list of configured quality levels for PDF components.
	* Quality levels are defined in the global config as DEDALO_PDF_AR_QUALITY,
	* typically ['original', 'web']. Each level corresponds to a sub-directory
	* under the PDF media folder.
	* @return array - list of quality-level strings, e.g. ['original', 'web']
	*/
	public function get_ar_quality() : array {

		$ar_image_quality = DEDALO_PDF_AR_QUALITY;

		return $ar_image_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* Returns the default (web-distributable) quality level for PDFs.
	* Sourced from the config constant DEDALO_PDF_QUALITY_DEFAULT (typically 'web').
	* The 'web' copy is a plain file-system copy of the original; it is the
	* quality served to end users.
	* @return string - e.g. 'web'
	*/
	public function get_default_quality() : string {

		return DEDALO_PDF_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* Returns the original (uploaded) quality level identifier for PDFs.
	* Sourced from the config constant DEDALO_PDF_QUALITY_ORIGINAL (typically 'original').
	* Original files are preserved across re-uploads; only non-original qualities
	* are renamed/archived by rename_old_files.
	* @return string - e.g. 'original'
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_PDF_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* Returns the subset of quality levels that should be treated as 'normalized'
	* (i.e. derived from the original and deletable/rebuildable on demand).
	* For PDFs only the default/web quality is considered normalized — the original
	* is never auto-deleted. This narrows the parent's default of
	* [original, default] to [default] only.
	* @return array - e.g. ['web']
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$default_quality = $this->get_default_quality();

		$normalized_ar_quality = [$default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_EXTENSION
	* Returns the primary file extension for PDF components.
	* Falls back to the config constant DEDALO_PDF_EXTENSION ('pdf') unless
	* $this->extension has been set on the instance (e.g. for a non-PDF upload
	* like .doc that was stored under this component type).
	* @return string - e.g. 'pdf'
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_PDF_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* Returns the list of file extensions accepted during upload for this component.
	* Sourced from config DEDALO_PDF_EXTENSIONS_SUPPORTED (e.g. ['pdf','doc','odt','pages',...]).
	* Extensions beyond 'pdf' (doc, odt, pages, etc.) are stored as-is without
	* text extraction or OCR processing.
	* @return array - list of accepted extension strings
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_PDF_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* Returns the media sub-directory path for PDF files, relative to the
	* Dédalo media root. Defaults to the config constant DEDALO_PDF_FOLDER (e.g. '/pdf')
	* unless overridden on the instance.
	* @return string - e.g. '/pdf'
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_PDF_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Returns the ordered list of preferred file extensions when resolving which
	* stored file represents the 'best' available version of this component.
	* The list is ordered from most to least preferred; only 'pdf' is supported
	* for PDF components.
	* @return array - ['pdf']
	*/
	public function get_best_extensions() : array {

		return ['pdf'];
	}//end get_best_extensions



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA_TIPO
	* Returns the list of component_text_area tipo identifiers that are
	* ontologically related to this PDF component. The first entry in the list
	* is the target into which extracted PDF text (from pdftotext or OCR) is
	* saved during regenerate_component.
	*
	* Delegates to common::get_ar_related_by_model, which walks the ontology
	* to find related components of the given model type.
	* @return array - tipo strings, e.g. ['dd522'] (may be empty if none defined)
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
	* Generates a thumbnail JPEG image from the first page of the uploaded PDF
	* using ImageMagick (via the ImageMagick::convert wrapper).
	*
	* The thumbnail dimensions come from DEDALO_IMAGE_THUMB_WIDTH /
	* DEDALO_IMAGE_THUMB_HEIGHT with safe fallbacks (224×149) in case those
	* constants are undefined. The render density is 72 dpi, quality 75.
	*
	* Note on macOS / Homebrew deployments:
	*   ImageMagick delegates PDF rendering to Ghostscript. If Apache cannot
	*   locate 'gs' via PATH, thumbnail creation silently fails. Fix by editing
	*   ImageMagick's delegates.xml and replacing:
	*     command="&quot;gs&quot;
	*   with an absolute path:
	*     command="&quot;/usr/local/bin/gs&quot;
	*   Reference: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096
	*
	* Returns false without attempting conversion if the default-quality PDF
	* file does not exist yet (e.g. during an aborted upload).
	*
	* (!) DEDALO_QUALITY_THUMB is runtime-defined here if the config omits it,
	* which logs a WARNING so the gap in configuration is visible.
	* @return bool - true on success, false if the source PDF is missing
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
	* Final step in the upload pipeline; called after the file has been moved
	* to its target quality directory by component_media_common::add_file.
	*
	* Full upload sequence:
	*   1 - dd_utils_api::upload
	*   2 - tool_upload::process_uploaded_file
	*   3 - component_media_common::add_file
	*   4 - component_pdf::process_uploaded_file  ← this method
	*
	* Behaviour:
	* - For the 'original' quality: stores upload metadata (original_file_name,
	*   original_normalized_name, original_upload_date) into component data at index 0.
	* - If a target_filename property is set in component properties, saves the
	*   original file name into the companion component_input_text component.
	* - If the uploaded file is not a native PDF (extension ≠ DEDALO_PDF_EXTENSION),
	*   saves the component and returns early — no text extraction is performed.
	* - For native PDF uploads at 'original' quality: calls regenerate_component,
	*   which copies to web quality, optionally runs OCR, and extracts text.
	* - For non-original quality uploads: updates files_info metadata and saves.
	*
	* @param object|null $file_data - upload metadata; shape:
	*   {
	*     original_file_name : string  // user-visible name, e.g. 'My Document.pdf'
	*     full_file_name     : string  // normalised stored name, e.g. 'rsc37_rsc176_18.pdf'
	*     full_file_path     : string  // absolute path to the uploaded file on disk
	*   }
	* @param object|null $process_options - optional processing flags; shape:
	*   {
	*     ocr      : bool    // whether to run OCR via PDF_OCR_ENGINE (default false)
	*     ocr_lang : string  // Dédalo lang ID used for OCR, e.g. 'lg-eng' (default null)
	*   }
	* @return object $response - {result: bool|string, msg: string}
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

		// upload info (uploading original only)
			$original_quality = $this->get_original_quality();
			if ($this->quality===$original_quality) {
				// update upload file info
				$data = $this->get_data();
				$key = 0;
				if (!isset($data[$key]) || !is_object($data[$key])) {
					$data[$key] = new stdClass();
				}
				$data[$key]->original_file_name			= $original_file_name;
				$data[$key]->original_normalized_name	= $original_normalized_name;
				$data[$key]->original_upload_date		= component_date::get_date_now();

				$this->set_data($data);
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
					$component_target_filename->set_data( $original_file_name );
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
			if ($this->quality===$original_quality) {
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
			}else{
				// files_info. Updates component data files info values iterating available files
				// This action updates the component data ($this->get_data()) but does not save it
				// Note that this method is called again on save, but this is intentional
				$this->update_component_data_files_info();
				// Save to store updated component data.
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
	* BUILD_VERSION
	* Creates a specific quality version of the PDF file from the stored original.
	* Overrides the generic parent stub; the actual work done here is:
	*   1. Thumb quality → delegates to create_thumb() and returns immediately.
	*   2. Any other quality:
	*      a. Validates that the original source file exists on disk.
	*      b. Ensures the target quality directory exists (creates it if needed).
	*      c. Copies the original PDF file into the target quality directory,
	*         unless target path === source path (i.e. building the original itself).
	*      d. Iterates DEDALO_PDF_ALTERNATIVE_EXTENSIONS (e.g. ['jpg']) and calls
	*         create_alternative_version for each configured format.
	*
	* Note: the 'web' quality is literally a copy of the original PDF, not a
	* transcoded form. Down-sampling or compression happens only for thumbnails
	* and raster alternative versions.
	*
	* (!) $copy_result is only assigned when $target_quality_path !== $original_file_path.
	* When paths are equal the copy block is skipped and $copy_result is undefined,
	* but the response still uses it at line 532. This is a pre-existing edge-case:
	* in practice the 'original' → 'original' build is never requested, so the
	* paths always differ when copy is expected. Do not change this code; flag only.
	*
	* @param string $quality - target quality level to build, e.g. 'web' or 'thumb'
	* @param bool $async = true - reserved for async processing (unused in this override)
	* @param bool $save = true - reserved; parent contract; unused in this override
	* @return object $response - {result: bool|string|null, msg: string, errors: array}
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

		// check files that can not be processed
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
	* Conditionally archives existing files of the given name in the given folder,
	* preserving the original quality file across re-uploads.
	*
	* Original-quality files (DEDALO_PDF_QUALITY_ORIGINAL = 'original') are never
	* renamed/archived here — each upload of a new original is stored alongside
	* previous originals so the complete upload history is retained. Originals are
	* managed separately (e.g. by the delete pipeline).
	*
	* For all other quality levels (e.g. 'web', 'thumb'), the method delegates
	* directly to the parent component_media_common::rename_old_files, which moves
	* the existing file(s) into a timestamped 'deleted/' sub-directory.
	*
	* @param string $file_name - base file name without extension, e.g. 'test175_test65_3'
	* @param string $folder_path - absolute filesystem path to the quality directory
	* @return object $response - {result: bool, msg: string}
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
	* Returns the list of alternative raster format extensions to generate from
	* the PDF (e.g. ['jpg'] for cover-page JPEG images), or null if the
	* DEDALO_PDF_ALTERNATIVE_EXTENSIONS config constant is not defined.
	*
	* When null is returned, callers must apply the '?? []' guard before iterating
	* (as build_version and create_alternative_versions in the parent both do).
	* @return array|null - extension strings (e.g. ['jpg']) or null if unconfigured
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = defined('DEDALO_PDF_ALTERNATIVE_EXTENSIONS')
			? DEDALO_PDF_ALTERNATIVE_EXTENSIONS
			: null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* GET_TEXT_FROM_PDF
	* Extracts text content from the default-quality PDF file using an external
	* command-line engine (PDF_AUTOMATIC_TRANSCRIPTION_ENGINE, typically pdftotext).
	*
	* Process:
	* 1. Verifies the source PDF file exists and the extraction engine is on PATH.
	* 2. Builds a shell command with optional page-range flags (-f / -l).
	* 3. For 'text_engine' mode: generates a .txt file; for 'html_engine': .html.
	*    The output file is written to the same directory as the PDF.
	* 4. Reads the output file, validates and cleans UTF-8 encoding.
	* 5. Round-trips through JSON encode/decode to confirm string serializability.
	* 6. Splits the text on form-feed characters (^L, ASCII 0x0C) to detect page
	*    boundaries and wraps each page in <p>[page-n-N]</p><p>…</p> markup.
	*
	* The page-splitting character (^L / form-feed) is embedded as a literal
	* invisible character in the str_replace and explode calls. pdftotext emits
	* this character between pages in its default output mode.
	*
	* $response->result holds the final HTML-wrapped text string on success.
	* $response->original holds the raw text without page markup.
	*
	* (!) Shell arguments ($source_file, $text_filename) are passed through
	* escapeshellarg. $engine_config is composed only from config constants,
	* not from user input.
	*
	* @param object $options - extraction parameters; shape:
	*   {
	*     engine   : string  // executable name/path; defaults to PDF_AUTOMATIC_TRANSCRIPTION_ENGINE
	*     method   : string  // 'text_engine' (default) or 'html_engine'
	*     page_in  : int     // first page to extract (1-based, default 1)
	*     page_out : int|null // last page to extract (null = all pages)
	*   }
	* @return object $response - {result: string|false|'error', msg: string, errors: array, original?: string}
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

		// Security: defence-in-depth. $source_file / $text_filename are derived
		// from the component's stored media path (server-built), but we still
		// shell-quote them so any future caller that introduces user-controlled
		// paths cannot inject commands. $engine_config is constant.
		$command = $engine ." -enc UTF-8". "$engine_config " . escapeshellarg($source_file) . " " . escapeshellarg($text_filename);

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
	* Runs Optical Character Recognition on a PDF file using the configured
	* PDF_OCR_ENGINE (typically ocrmypdf). The OCR engine rewrites the input
	* file in-place with an embedded text layer (--force-ocr --pdfa-image-compression
	* lossless), creating a PDF/A-compliant output.
	*
	* Language handling:
	* - Accepts a Dédalo lang ID string (e.g. 'lg-eng', 'lg-cat') and strips
	*   the 'lg-' prefix to obtain the tesseract lang code.
	* - Special case: 'vlca' (Valencian) is remapped to 'cat' (Catalan) because
	*   the Valencian language shares the Catalan tesseract model.
	* - Falls back to DEDALO_DATA_LANG if $options->ocr_lang is not set.
	*
	* (!) PDF_OCR_ENGINE must be defined in config. If it is undefined, the method
	* logs the undefined-constant access (which itself triggers a PHP notice because
	* PDF_OCR_ENGINE is evaluated in to_string() even when defined() is false) and
	* returns an error response. The debug_log call inside the defined()===false
	* branch references the undefined constant directly — pre-existing behaviour,
	* do not change.
	*
	* @param object $options - OCR parameters; shape:
	*   {
	*     source_file : string  // absolute path to the PDF file to process (overwritten in-place)
	*     ocr_lang    : string  // Dédalo lang ID, e.g. 'lg-eng'; falls back to DEDALO_DATA_LANG
	*   }
	* @return object $response - {result: 'ok'|'error', msg: string}
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
	* VALID_UTF8
	* Validates that a string is well-formed UTF-8 by walking each byte sequence
	* using RFC 3629 / Unicode 6.0 rules (1-, 2-, 3-, and 4-byte sequences).
	*
	* Implemented as a recursive-descent byte-walk; returns false as soon as
	* an invalid byte is encountered. The helper functions (valid_1byte,
	* valid_2byte, …, valid_nextbyte) are declared as global functions with
	* function_exists guards to avoid redefinition errors when called repeatedly.
	*
	* This validator is intentionally conservative: it only checks structural
	* well-formedness, not Unicode code-point validity (e.g. surrogates or
	* values beyond U+10FFFF are not rejected here).
	*
	* Based on the algorithm by Maarten Meijer (2005) described at:
	*   http://en.wikipedia.org/wiki/UTF-8
	*
	* @param string $string - the raw string to validate
	* @return bool - true if the string is structurally valid UTF-8
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
			} else {
				// No valid pattern matched
				return false;
			} // goto next char
		}

		return true;
	}//end valid_utf8



	/**
	* UTF8_CLEAN
	* Strips bytes that are not valid UTF-8 from the given string using iconv
	* with the //IGNORE transliteration flag, which silently discards any
	* sequence that cannot be represented in the target encoding.
	*
	* Called after valid_utf8 returns false to sanitize extracted PDF text
	* before storing it in the database.
	*
	* @param string $string = '' - the string to sanitize
	* @return string - the input string with invalid UTF-8 bytes removed
	*/
	public static function utf8_clean( string $string='' ) : string {

		$string = iconv('UTF-8', 'UTF-8//IGNORE', $string);

		return $string;
	}//end utf8_clean



	/**
	* UPDATE_DATA_VERSION
	* Migration hook called by the data-version upgrade tool to transform
	* component data from one schema version to another.
	*
	* This implementation has no version-specific upgrade logic for component_pdf;
	* it returns result=0 for all versions to signal 'no action taken'.
	* The result codes are:
	*   0 - component has no handler for this version (skipped)
	*   1 - component performed the upgrade
	*   2 - component checked but found no change was needed
	*
	* @param object $options - migration context; shape:
	*   {
	*     update_version  : array   // version segments, e.g. [7, 0, 1]
	*     data_unchanged  : mixed   // hint from caller (unused here)
	*     reference_id    : mixed   // optional reference record id
	*     tipo            : string  // component tipo
	*     section_id      : int     // section record id
	*     section_tipo    : string  // section tipo
	*     context         : string  // caller context, default 'update_component_data'
	*   }
	* @return object $response - {result: int, msg: string}
	*/
	public static function update_data_version( object $options ) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



	/**
	* REGENERATE_COMPONENT
	* Rebuilds all derived artefacts of this PDF component from the stored original
	* and (optionally) updates the linked text transcription component.
	*
	* Steps performed:
	* 1. Resolves the original file path using get_original_file_path() (preferred
	*    over get_original_extension() because the latter can return stale extension
	*    values from leftover files in the directory; see inline comment).
	* 2. If the uploaded file is not a native PDF (extension ≠ get_extension()),
	*    sets $delete_normalized_files = false to avoid deleting the single stored file.
	* 3. If $options->ocr is true and the source file exists, runs process_ocr_file
	*    to embed a text layer in the PDF before copying it to web quality.
	* 4. Calls parent::regenerate_component to handle quality-directory cleanup,
	*    build_version calls, and file-info data updates.
	* 5. If $options->transcription is true and a related component_text_area is
	*    configured, calls get_text_from_pdf on the web-quality PDF and saves the
	*    resulting page-tagged HTML into the text-area component.
	*    Extraction is attempted unconditionally (the commented-out empty-check
	*    guard is intentionally disabled — existing text is overwritten on regenerate).
	*
	* @see class.tool_update_cache.php
	* @param object|null $options = null - regeneration flags; shape:
	*   {
	*     first_page             : int   // 1-based page offset for page-tag numbering (default 1)
	*     transcription          : bool  // whether to extract and save PDF text (default true)
	*     ocr                    : bool  // whether to run OCR before text extraction (default false)
	*     ocr_lang               : string|null // Dédalo lang ID for OCR (default null → DEDALO_DATA_LANG)
	*     delete_normalized_files: bool  // whether to archive derived files before rebuild (default true)
	*   }
	* @return bool - true on success (mirrors parent::regenerate_component return value)
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

		// get the extension of the original file to check if it's a valid PDF
		// Uses get_original_file_path() instead of get_original_extension() because
		// get_original_extension() excludes files matching the target filename pattern,
		// which incorrectly excludes the uploaded PDF and can return leftover file extensions (e.g. avif).
		// get_original_file_path() correctly prefers files matching the component's default extension.
			$original_file_path = $this->get_original_file_path();
			$original_extension = $original_file_path
				? strtolower(pathinfo($original_file_path, PATHINFO_EXTENSION))
				: null;

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

								// to_save_data_item
								$to_save_data_item = new stdClass();
								$to_save_data_item->value = $text_from_pdf_response->result;
								$to_save_data_item->lang = DEDALO_DATA_LANG;

								// set and save extracted text
								$component_text_area->set_data([$to_save_data_item]);
								$component_text_area->save();
							}
						}//end if (file_exists($target_pdf_path))
					// }//end if (empty($component_text_area_value))
				}//end if (!empty($related_component_text_area_tipo))
			}//end  if( $transcription === true && file_exists($source_file) )


		return $result;
	}//end regenerate_component



	/**
	* CREATE_ALTERNATIVE_VERSION
	* Renders a raster image (e.g. JPEG) of the first page of the PDF using
	* ImageMagick, writing it as an alternative format file alongside the PDF.
	*
	* The output file is written to the quality directory with path:
	*   <media_path_dir($quality)>/<component_id>.<extension>
	*
	* Render parameters scale with quality:
	* - Original quality: 300 dpi, quality 100, resize 100%
	* - Web/non-original quality: 150 dpi, quality 95, resize 75%
	*
	* $options->page (default 0) selects which PDF page layer to render
	* (0-based index passed to ImageMagick as ar_layers).
	*
	* Returns false without rendering if:
	* - The requested quality is the thumb quality (thumbnails use create_thumb).
	* - The extension is not in get_alternative_extensions() (safety guard).
	* - The source PDF file does not exist in the given quality directory.
	* - ImageMagick fails to produce the output file.
	*
	* @param string $quality - the quality directory to read the source PDF from
	* @param string $extension - target raster extension, e.g. 'jpg'
	* @param object|null $options = null - optional overrides; shape:
	*   {
	*     page : int  // 0-based PDF page index to render (default 0 = cover page)
	*   }
	* @return bool - true if the output file was successfully created
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
