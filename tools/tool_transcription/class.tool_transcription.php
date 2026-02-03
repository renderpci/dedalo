<?php declare(strict_types=1);
/**
 * CLASS TOOL_TRANSCRIPTION
 * Tool for PDF text extraction and audio transcription workflows
 *
 * Provides functionality to:
 * - Extract text from PDF files using external transcription engine (pdftotext)
 * - Perform automatic audio transcription via configured external services
 * - Create and manage audio files in transcription-compatible formats
 * - Monitor transcription process status on remote servers
 * - Generate subtitle files from transcribed text content
 *
 * Key features:
 * - UTF-8 validation and text cleaning for reliable processing
 * - Page numbering in PDF text extraction
 * - Audio format conversion for Whisper compatibility (WAV, 16kHz, mono)
 * - Support for multiple transcription engines (Babel, Google—planned)
 * - Background process monitoring with PID tracking
 * - Subtitle generation with character-per-line constraints
 * - Configuration-driven transcriber selection (stored in tools_register)
 *
 * External dependencies:
 * - pdftotext: PDF text extraction engine (XPDF toolkit)
 * - babel_transcriber: Audio transcription service integration
 * - subtitles class: Subtitle file generation (DEDALO_SHARED_PATH)
 * - FFmpeg: Audio resampling and format conversion (via component_av)
 *
 * Configuration:
 * - PDF_AUTOMATIC_TRANSCRIPTION_ENGINE: Path to pdftotext binary
 * - Tool config section (dd996): transcriber_engine, transcriber_quality, API keys
 * - Language codes: Source audio language (lg-nolan format)
 *
 * @package Dedalo
 * @subpackage Media
 */
class tool_transcription extends tool_common {

	/**
	 * GET_TEXT_FROM_PDF
	 * Extract text from PDF file with page numbering and UTF-8 validation
	 *
	 * Processing workflow:
	 * 1. Validate input parameters and source PDF file existence
	 * 2. Verify pdftotext engine availability from config
	 * 3. Execute PDF text extraction command with UTF-8 encoding
	 * 4. Validate and clean extracted text for UTF-8 compliance
	 * 5. Add page break markers and page numbers
	 * 6. Return processed text with page information
	 *
	 * @param object $new_options Options containing:
	 *                             - path_pdf (required): Full file path to source PDF
	 *                             - first_page (optional): Starting page number (default: 1)
	 * @return object $response Response object with:
	 *                           - result: Extracted text with page tags or 'error'
	 *                           - msg: Operation status message
	 *                           - original: Original untagged text (if successful)
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function get_text_from_pdf( object $new_options ) : object {

		$response = new stdClass();

		// options with defaults
		$options = new stdClass();
			$options->path_pdf = null;	// full source pdf file path
			$options->first_page = 1; 	// number of first page. default is 1

		// new_options overwrite options defaults
		foreach ((object)$new_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}

		if (empty($options->path_pdf) || !file_exists($options->path_pdf)) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: source pdf file not found";
			return $response;
		}

		// TEST ENGINE PDF TO TEXT
		if (!defined('PDF_AUTOMATIC_TRANSCRIPTION_ENGINE')) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: config PDF_AUTOMATIC_TRANSCRIPTION_ENGINE is not defined";
			return $response;
		}

		$transcription_engine = trim(shell_exec('type -P ' . PDF_AUTOMATIC_TRANSCRIPTION_ENGINE));
		if (empty($transcription_engine)) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: daemon engine not found";
			return $response;
		}

		// FILE TEXT FROM PDF . Create a new text file from pdf text content
		$text_filename = substr($options->path_pdf, 0, -4) . '.txt';

		$command = PDF_AUTOMATIC_TRANSCRIPTION_ENGINE . " -enc UTF-8 {$options->path_pdf}";
		$output = exec("$command 2>&1", $result);	// Generate text version file in same dir as pdf
		if (strpos(strtolower($output), 'error') !== false) {
			$response->result = 'error';
			$response->msg = "$output";
			return $response;
		}

		if (!file_exists($text_filename)) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: Text file not found";
			return $response;
		}

		$pdf_text = file_get_contents($text_filename);	// Read current text file

		// TEST STRING VALUE IS VALID
		// Test is valid utf8
		$test_utf8 = valid_utf8($pdf_text);
		if (!$test_utf8) {
			error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		}

		// Remove non utf8 chars
		$pdf_text = utf8_clean($pdf_text);

		// Test JSON conversion before save
		$pdf_text = json_handler::encode($pdf_text);
		if (!$pdf_text) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: String is not valid because format encoding is wrong";
			return $response;
		}

		$pdf_text = json_handler::decode($pdf_text);	// JSON is valid. We turn object to string
		$pdf_text = trim($pdf_text);	// Trim before check is empty
		if (empty($pdf_text)) {
			$response->result = 'error';
			$response->msg = "Error Processing Request pdf_automatic_transcription: Empty text";
			return $response;
		}

		// PAGES TAGS
		$original_text = str_replace("", "", $pdf_text);
		$pages = explode("", $pdf_text);
		$i = (int)$options->first_page;
		$pdf_text = '';
		foreach ($pages as $current_page) {
			$pdf_text .= '[page-n-' . $i . ']';
			$pdf_text .= '<br>';
			$pdf_text .= nl2br($current_page);
			$i++;
		}

		$response->result = $pdf_text;
		$response->msg = "OK Processing Request pdf_automatic_transcription: text processed";
		$response->original = trim($original_text);

		return $response;
	}//end get_text_from_pdf


	/**
	 * AUTOMATIC_TRANSCRIPTION
	 * Execute automatic audio transcription request against configured service
	 *
	 * Supports transcription engines configured in tool properties:
	 * - Babel Transcriber: Background process with PID tracking
	 * - Google Translation: Not yet implemented
	 * - Local: Alias for Babel Transcriber
	 *
	 * Workflow:
	 * 1. Validate input parameters and retrieve transcriber configuration
	 * 2. Get API credentials and endpoint from tool config (dd996)
	 * 3. Instantiate source audio file (build audio quality if needed)
	 * 4. Initialize transcriber service with language and audio parameters
	 * 5. Start background transcription process and return PID
	 *
	 * @param object $options Options containing:
	 *                         - source_lang (required): Source audio language (lg-nolan format)
	 *                         - transcription_ddo (required): Target text component metadata
	 *                         - media_ddo (required): Source audio component metadata
	 *                         - transcriber_engine (required): Service name (babel_transcriber, local, google_translation)
	 *                         - transcriber_quality (required): Audio quality for processing
	 *                         - config (optional): Tool configuration object
	 * @return object $response Response object with:
	 *                           - result: Process result with PID for background processes
	 *                           - msg: Operation status message
	 *                           - errors: Array of error messages
	 * @throws Exception If component instantiation fails or audio file unavailable
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function automatic_transcription( object $options ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors = [];

		try {
			// options
			$source_lang = $options->source_lang ?? null;
			$transcription_ddo = $options->transcription_ddo ?? null;
			$media_ddo = $options->media_ddo ?? null;
			$transcriber_engine = $options->transcriber_engine ?? null;
			$transcriber_quality = $options->transcriber_quality ?? null;

			// validate required parameters
			if (empty($source_lang) || empty($transcription_ddo) || empty($media_ddo) || 
				empty($transcriber_engine) || empty($transcriber_quality)) {
				$missing = [];
				if (empty($source_lang)) $missing[] = 'source_lang';
				if (empty($transcription_ddo)) $missing[] = 'transcription_ddo';
				if (empty($media_ddo)) $missing[] = 'media_ddo';
				if (empty($transcriber_engine)) $missing[] = 'transcriber_engine';
				if (empty($transcriber_quality)) $missing[] = 'transcriber_quality';
				throw new Exception('Missing required parameters: ' . implode(', ', $missing));
			}

			// component to use
			$user_id = logged_user_id();
			$entity_name = DEDALO_ENTITY;

			// tool config
			$tool_name = get_called_class();
			$config = tool_common::get_config($tool_name);

			// config JSON . Must be compatible with tool properties transcriber_engine data
			$ar_transcriber_configs = $config->config->transcriber_config->value ?? [];
			$transcriber_name = $transcriber_engine;
			// search current transcriber config in tool config (stored in database, section 'dd996' Tools configuration)
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name === $transcriber_name;
			}) ?? new stdClass();

			// data from transcriber
			$url = $transcriber_config->uri ?? null;
			$key = $transcriber_config->key ?? null;

			// Source text . Get source text from component (source_lang)
			$model = ontology_node::get_model_by_tipo($media_ddo->component_tipo, true);
			$component = component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);

			if ($component === null) {
				throw new Exception("Failed to instantiate component: {$media_ddo->component_tipo}");
			}

			$audio_file = $component->quality_file_exist('audio');
			if ($audio_file === false) {
				$component->build_version('audio', false);
			}
			$audio_file = $component->quality_file_exist('audio');
			// Audio file is not available case
			if ($audio_file === false) {
				$response->msg = 'Error. Audio file is not available.';
				$response->errors[] = 'audio file not found';
				debug_log(__METHOD__ . " $response->msg", logger::ERROR);
				return $response;
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio');

			// iterate component array data
			switch ($transcriber_name) {
				case 'google_translation':
					// Not implemented yet
					$response->msg = "Sorry. '{$transcriber_name}' is not implemented yet";
					$response->errors[] = 'transcriber not implemented';
					break;

				case 'local':
					$transcriber_engine = 'babel_transcriber';
					// continue here only changing the transcriber_engine name
					// fall through intentional
				case 'babel_transcriber':
				default:
					include_once(dirname(__FILE__) . '/transcribers/babel/class.babel_transcriber.php');

					// babel use tld2 instead tld3
					$lang_tld2 = lang::get_alpha2_from_code($source_lang);

					$babel_transcriber = new babel_transcriber((object)[
						'key' => $key,
						'engine' => $transcriber_engine,
						'quality' => $transcriber_quality,
						'user_id' => $user_id,
						'entity_name' => $entity_name,
						'url' => $url,
						'lang' => $source_lang,
						'lang_tld2' => $lang_tld2,
						'av_url' => $av_url,
						'transcription_ddo' => $transcription_ddo
					]);

					$transcriber_response = $babel_transcriber->transcribe();
					$result = $transcriber_response->result;
					if ($result === false) {
						return $transcriber_response;
					}
					$pid = $transcriber_response->result->pid;

					// check background process to check if the transcriber had done.
					$babel_transcriber->exec_background_check_transcription($pid);

					// result set from transcriber response
					$response->result = $result;
					break;
			}

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' transcriber_engine: ' . (string)($options->transcriber_engine ?? 'unknown')
				, logger::ERROR
			);
		}

		return $response;
	}//end automatic_transcription


	/**
	 * CREATE_TRANSCRIBABLE_AUDIO_FILE
	 * Build audio file in Whisper-compatible format (WAV, 16kHz, mono)
	 *
	 * Creates a temporal audio version (quality: audio_tr) optimized for speech
	 * recognition. Whisper performs better with:
	 * - Uncompressed PCM WAV format
	 * - 16kHz sample rate
	 * - Mono channel
	 *
	 * This quality is created on-the-fly and is temporal (removed after transcription).
	 * Not configured in config.php as it's tool-specific.
	 *
	 * @param object $options Options containing:
	 *                         - media_ddo (required): Source audio component metadata
	 *                           - component_tipo: Audio component type (e.g., rsc35)
	 *                           - section_id: Component section ID
	 *                           - section_tipo: Component section type (e.g., rsc176)
	 * @return object $response Response object with:
	 *                           - result: Publicly accessible URL to audio_tr file
	 *                           - msg: Operation status message
	 *                           - errors: Array of error messages
	 *                           - debug: Debug info including av_url (if SHOW_DEBUG enabled)
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function create_transcribable_audio_file( object $options ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors = [];

		try {
			// component to use
			$media_ddo = $options->media_ddo ?? null;

			if (empty($media_ddo)) {
				throw new Exception('Missing required parameter: media_ddo');
			}

			// Source text . Get source text from component (source_lang)
			$model = ontology_node::get_model_by_tipo($media_ddo->component_tipo, true);
			$component = component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);

			if ($component === null) {
				throw new Exception("Failed to instantiate component: {$media_ddo->component_tipo}");
			}

			$component->extension = 'wav';

			$audio_file = $component->quality_file_exist('audio_tr');
			if ($audio_file === false) {
				$component->build_version('audio_tr', false);
			}
			$audio_file = $component->quality_file_exist('audio_tr');

			if ($audio_file === false) {
				throw new Exception('Audio file could not be created in audio_tr quality');
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio_tr');

			$response->result = $av_url;
			$response->msg = 'OK: file was created';

			// debug
			if (SHOW_DEBUG === true) {
				$response->debug = new stdClass();
				$response->debug->av_url = $av_url;
			}

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__ . ' Exception: ' . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end create_transcribable_audio_file


	/**
	 * DELETE_TRANSCRIBABLE_AUDIO_FILE
	 * Permanently delete temporal audio file created for transcription
	 *
	 * Hard deletes the audio_tr quality file without moving to trash.
	 * This quality is temporal and only used during transcription process.
	 * Unlike standard component deletion, files are removed immediately
	 * instead of being moved to delete directory (not needed in time machine).
	 *
	 * @param object $options Options containing:
	 *                         - media_ddo (required): Source audio component metadata
	 *                           - component_tipo: Audio component type (e.g., rsc35)
	 *                           - section_id: Component section ID
	 *                           - section_tipo: Component section type (e.g., rsc176)
	 * @return object $response Response object with:
	 *                           - result: true on success, false on error
	 *                           - msg: Operation status message
	 *                           - errors: Array of error messages
	 *                           - debug: Debug info including deleted file path (if SHOW_DEBUG enabled)
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function delete_transcribable_audio_file( object $options ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors = [];

		try {
			// component to use
			$media_ddo = $options->media_ddo ?? null;

			if (empty($media_ddo)) {
				throw new Exception('Missing required parameter: media_ddo');
			}

			// Source text . Get source text from component (source_lang)
			$model = ontology_node::get_model_by_tipo($media_ddo->component_tipo, true);
			$component = component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);

			if ($component === null) {
				throw new Exception("Failed to instantiate component: {$media_ddo->component_tipo}");
			}

			$component->extension = 'wav';

			$file_path = $component->get_media_filepath('audio_tr', 'wav');
			$audio_file = $component->quality_file_exist('audio_tr');
			if ($audio_file === false) {
				$response->result = true;
				$response->msg = 'OK. File not exist in server, nothing to delete';
				return $response;
			}

			// delete the file
			$deleted = unlink($file_path);

			if ($deleted === false) {
				throw new Exception('It was impossible to delete the audio file. View server log.');
			}

			$response->result = true;
			$response->msg = 'Ok: file was deleted';

			// debug
			if (SHOW_DEBUG === true) {
				$response->debug = new stdClass();
				$response->debug->deleted = $file_path;
			}

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__ . ' Exception: ' . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end delete_transcribable_audio_file


	/**
	 * CHECK_SERVER_TRANSCRIBER_STATUS
	 * Poll transcriber service for transcription process status
	 *
	 * Monitors background transcription process using process ID (PID)
	 * obtained from initial automatic_transcription() call. Checks if
	 * transcription has completed and retrieves results.
	 *
	 * Supports the same engines as automatic_transcription() with
	 * configuration from tool section (dd996).
	 *
	 * @param object $options Options containing:
	 *                         - media_ddo (required): Source audio component metadata
	 *                         - transcriber_engine (required): Service name (babel_transcriber, etc.)
	 *                         - pid (required): Process ID from transcription start
	 *                         - config (optional): Tool configuration object
	 * @return object $response Response object with:
	 *                           - result: Transcription status and results
	 *                           - msg: Operation status message
	 *                           - errors: Array of error messages
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function check_server_transcriber_status( object $options ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors = [];

		try {
			// component to use
			$media_ddo = $options->media_ddo ?? null;
			$transcriber_engine = $options->transcriber_engine ?? null;
			$pid = $options->pid ?? null;

			// validate input
			if (empty($media_ddo) || empty($transcriber_engine) || empty($pid)) {
				$missing = [];
				if (empty($media_ddo)) $missing[] = 'media_ddo';
				if (empty($transcriber_engine)) $missing[] = 'transcriber_engine';
				if (empty($pid)) $missing[] = 'pid';
				throw new Exception('Missing required parameters: ' . implode(', ', $missing));
			}

			$user_id = logged_user_id();
			$entity_name = DEDALO_ENTITY;

			// config
			$tool_name = get_called_class();
			$config = tool_common::get_config($tool_name);

			// config JSON . Must be compatible with tool properties transcriber_engine data
			$ar_transcriber_configs = $config->config->transcriber_config->value ?? [];
			$transcriber_name = $transcriber_engine;
			// search current transcriber config in tool config (stored in database, section 'dd996' Tools configuration)
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name === $transcriber_name;
			}) ?? new stdClass();

			// data from transcriber
			$url = $transcriber_config->uri ?? null;
			$key = $transcriber_config->key ?? null;

			// Source text . Get source text from component (source_lang)
			$model = ontology_node::get_model_by_tipo($media_ddo->component_tipo, true);
			$component = component_common::get_instance(
				$model,
				$media_ddo->component_tipo,
				$media_ddo->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$media_ddo->section_tipo
			);

			if ($component === null) {
				throw new Exception("Failed to instantiate component: {$media_ddo->component_tipo}");
			}

			$av_url = DEDALO_PROTOCOL . DEDALO_HOST . $component->get_url('audio');

			// iterate component array data
			switch ($transcriber_name) {
				case 'google_translation':
					// Not implemented yet
					$response->msg = "Sorry. '{$transcriber_name}' is not implemented yet";
					$response->errors[] = 'transcriber not implemented';
					break;

				case 'local':
					$transcriber_engine = 'babel_transcriber';
					// continue without break here
					// fall through intentional
				case 'babel_transcriber':
				default:
					include_once(dirname(__FILE__) . '/transcribers/babel/class.babel_transcriber.php');

					// check background process to check if the transcriber had done.
					$result = babel_transcriber::check_transcriber_status((object)[
						'key' => $key,
						'url' => $url,
						'av_url' => $av_url,
						'engine' => $transcriber_engine,
						'user_id' => $user_id,
						'entity_name' => $entity_name,
						'pid' => $pid,
						'delete_result' => false
					]);

					$response->result = $result;
					break;
			}

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__ . ' Exception: ' . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end check_server_transcriber_status


	/**
	 * BUILD_SUBTITLES_FILE
	 * Generate and persist subtitle file from text component content
	 *
	 * Creates subtitle file (VTT format) from transcribed text with
	 * timecode synchronization to source audio duration. Distributes
	 * text across subtitles with character-per-line constraints for
	 * readability on various display sizes.
	 *
	 * Subtitle files are written to media-specific subdirectories
	 * accessible via standard media file serving.
	 *
	 * @param object $options Options containing:
	 *                         - component_tipo (required): Text component type (e.g., dd32)
	 *                         - section_tipo (required): Section type
	 *                         - section_id (required): Section ID
	 *                         - lang (required): Language for text retrieval
	 *                         - key (optional): Data key index (default: 0)
	 *                         - max_charline (required): Maximum characters per subtitle line
	 * @return object $response Response object with:
	 *                           - result: true on success, false on error
	 *                           - url: Public URL to generated subtitle file
	 *                           - msg: Operation status message
	 *                           - errors: Array of error messages
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function build_subtitles_file( object $options ) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors = [];

		try {
			// options
			$component_tipo = $options->component_tipo ?? null;
			$section_tipo = $options->section_tipo ?? null;
			$section_id = $options->section_id ?? null;
			$lang = $options->lang ?? null;
			$key = $options->key ?? 0; // fixed component dato key as zero
			$max_charline = $options->max_charline ?? null;

			// validate input
			if (empty($component_tipo) || empty($section_tipo) || empty($section_id) || 
				empty($lang) || empty($max_charline)) {
				$missing = [];
				if (empty($component_tipo)) $missing[] = 'component_tipo';
				if (empty($section_tipo)) $missing[] = 'section_tipo';
				if (empty($section_id)) $missing[] = 'section_id';
				if (empty($lang)) $missing[] = 'lang';
				if (empty($max_charline)) $missing[] = 'max_charline';
				throw new Exception('Missing required parameters: ' . implode(', ', $missing));
			}

			// component_text_area
			// Source text . Get source text from component (source_lang)
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			$component_text_area = component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);

			if ($component_text_area === null) {
				throw new Exception("Failed to instantiate text component: $component_tipo");
			}

			$data = $component_text_area->get_data_lang($lang);
			$text = $data[$key]->value ?? '';
			$source_text = trim($text);
			if (empty($source_text)) {
				$response->msg = 'Warning. Empty component value!';
				$response->errors[] = 'empty value';
				return $response;
			}

			// component_av
			$component_av_tipo = $component_text_area->get_related_component_av_tipo();
			$model = ontology_node::get_model_by_tipo($component_av_tipo, true);
			$component_av = component_common::get_instance(
				$model,
				$component_av_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			if ($component_av === null) {
				throw new Exception("Failed to instantiate AV component: $component_av_tipo");
			}

			$duration = $component_av->get_duration(); // seconds
			$total_ms = (int)round($duration * 1000);
			$subtitles_path = $component_av->get_subtitles_path($lang);
			$subtitles_url = $component_av->get_subtitles_url($lang);

			// debug
			debug_log(__METHOD__
				. " launching build_subtitles_text with params:" . PHP_EOL
				. ' max_charline: ' . to_string($max_charline) . PHP_EOL
				. ' total_ms: ' . to_string($total_ms) . PHP_EOL
				. ' source_text: ' . substr($source_text, 0, 256) . ' ..'
				, logger::DEBUG
			);

			// class subtitles
			include_once(DEDALO_SHARED_PATH . '/class.subtitles.php');

			// build_subtitles_text exec
			$subtitles_response = subtitles::build_subtitles_text((object)[
				'sourceText' => $source_text,
				'maxCharLine' => $max_charline,
				'total_ms' => $total_ms
			]);

			if ($subtitles_response->result === false) {
				$response->msg = 'Error: ' . ($subtitles_response->msg ?? 'Unknown error on build_subtitles_text');
				$response->errors[] = 'unable to build subtitles';
				return $response;
			}

			// check target folder
			$target_folder = pathinfo($subtitles_path, PATHINFO_DIRNAME);
			if (!is_dir($target_folder)) {
				$response->msg = 'Error: subtitles dir does not exist!';
				debug_log(__METHOD__
					. $response->msg . PHP_EOL
					. ' subtitles dir: ' . to_string($target_folder)
					, logger::ERROR
				);
				$response->errors[] = 'subtitles dir not found: ' . $target_folder;
				return $response;
			}

			// save to file
			$content = $subtitles_response->result ?? '';
			if (!file_put_contents($subtitles_path, $content)) {
				$response->msg = 'Error writing subtitles file';
				debug_log(__METHOD__
					. $response->msg . PHP_EOL
					. ' subtitles_path: ' . to_string($subtitles_path)
					, logger::ERROR
				);
				$response->errors[] = 'unable to write subtitles file';
				return $response;
			}

			// all is OK
			$response->result = true;
			$response->url = $subtitles_url;
			$response->msg = 'OK. Request done successfully';

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__ . ' Exception: ' . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end build_subtitles_file

}//end class tool_transcription


/**
 * UTF-8 VALIDATION FUNCTIONS
 * 
 * Utility functions for UTF-8 encoding validation and cleanup.
 * Based on Wikipedia UTF-8 specification with recursive descent parser.
 * 
 * References:
 * - UTF-8 specification: http://en.wikipedia.org/wiki/UTF-8
 * - Original implementation: Copyright 2005 Maarten Meijer
 * 
 * @package Dedalo
 * @subpackage Utilities
 */

/**
 * VALID_UTF8
 * Validate complete UTF-8 string encoding
 *
 * Parses string as finite state machine checking encoding of each character.
 * Validates single-byte, two-byte, three-byte, and four-byte UTF-8 sequences.
 *
 * @param string $string String to validate
 * @return bool True if valid UTF-8, false otherwise
 *
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_utf8(string $string) : bool {
	$len = strlen($string);
	$i = 0;
	while($i < $len) {
		$char = ord(substr($string, $i++, 1));
		if(valid_1byte($char)) {
			// valid single-byte character
			continue;
		} else if(valid_2byte($char)) {
			// check 1 continuation byte
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
		} else if(valid_3byte($char)) {
			// check 2 continuation bytes
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
		} else if(valid_4byte($char)) {
			// check 3 continuation bytes
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
			if(!valid_nextbyte(ord(substr($string, $i++, 1))))
				return false;
		} else {
			// invalid UTF-8 sequence
			return false;
		}
	}
	return true; // all characters valid
}

/**
 * VALID_1BYTE
 * Check if character is valid single-byte UTF-8 (ASCII)
 *
 * @param int $char Character code byte
 * @return bool True if valid 1-byte sequence
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_1byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0x80) == 0x00;
}

/**
 * VALID_2BYTE
 * Check if character starts valid two-byte UTF-8 sequence
 *
 * @param int $char Character code byte
 * @return bool True if valid 2-byte start
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_2byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xE0) == 0xC0;
}

/**
 * VALID_3BYTE
 * Check if character starts valid three-byte UTF-8 sequence
 *
 * @param int $char Character code byte
 * @return bool True if valid 3-byte start
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_3byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF0) == 0xE0;
}

/**
 * VALID_4BYTE
 * Check if character starts valid four-byte UTF-8 sequence
 *
 * @param int $char Character code byte
 * @return bool True if valid 4-byte start
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_4byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF8) == 0xF0;
}

/**
 * VALID_NEXTBYTE
 * Check if byte is valid UTF-8 continuation byte
 *
 * @param int $char Character code byte
 * @return bool True if valid continuation byte
 * @package Dedalo
 * @subpackage Utilities
 */
function valid_nextbyte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xC0) == 0x80;
}

/**
 * UTF8_CLEAN
 * Remove non-UTF-8 characters from string
 *
 * Uses iconv to strip invalid UTF-8 sequences and optionally
 * removes control characters. Preserves text content.
 *
 * @param string $string String to clean
 * @param bool $control Optional: also remove control characters (default: false)
 * @return string Cleaned UTF-8 string
 *
 * @package Dedalo
 * @subpackage Utilities
 */
function utf8_clean(string $string, bool $control = false) : string {
	$string = iconv('UTF-8', 'UTF-8//IGNORE', $string);

	if ($control === true) {
		return preg_replace('~\p{C}+~u', '', $string);
	}

	return preg_replace(array('~\r\n?~', '~[^\P{C}\t\n]+~u'), array("\n", ''), $string);
}
