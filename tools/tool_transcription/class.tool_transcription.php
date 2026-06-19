<?php declare(strict_types=1);
/**
 * CLASS TOOL_TRANSCRIPTION
 * Dédalo tool for PDF text extraction and audio transcription workflows.
 *
 * Surfaces as a section toolbar button. Provides two distinct sub-workflows:
 *
 * 1. PDF → text: calls the XPDF pdftotext binary (configured via the
 *    PDF_AUTOMATIC_TRANSCRIPTION_ENGINE constant), wraps the raw output in
 *    [page-n-N] markers, and returns an HTML string suitable for a rich-text
 *    component. Entry point: get_text_from_pdf() — NOT exposed via API_ACTIONS
 *    (no authorisation gate on the path argument; callers should go through
 *    tool_pdf_extractor::get_pdf_data instead).
 *
 * 2. Audio → text: delegates to a configured transcriber backend (currently
 *    babel_transcriber; Google is planned). The pipeline is:
 *    a. Optionally create a Whisper-optimised WAV (create_transcribable_audio_file).
 *    b. Start a background transcription job (automatic_transcription) — returns a PID.
 *    c. Poll job status (check_server_transcriber_status) until done.
 *    d. Optionally generate a VTT subtitle file (build_subtitles_file).
 *
 * Transcriber configuration lives in section dd996 (Tools configuration),
 * keyed under config->transcriber_config->value[]. Each entry has a name
 * (e.g. 'babel_transcriber'), uri, and key (API credential). The engine name
 * 'local' is an alias for 'babel_transcriber' and is normalised at dispatch time.
 *
 * All API_ACTIONS enforce security::assert_section_permission() and
 * security::assert_record_in_user_scope() before any work is done.
 *
 * Relationships:
 * - Extends tool_common (Dédalo tool base class).
 * - Depends on babel_transcriber (tools/tool_transcription/transcribers/babel/).
 * - Depends on subtitles (DEDALO_SHARED_PATH/class.subtitles.php).
 * - Depends on component_av for duration and subtitle path resolution.
 * - Depends on the module-level valid_utf8() / utf8_clean() helpers (below).
 *
 * External binaries:
 * - pdftotext (XPDF): pointed to by PDF_AUTOMATIC_TRANSCRIPTION_ENGINE.
 * - FFmpeg: invoked internally by component_av::build_version() to produce WAV.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_transcription extends tool_common {



	/**
	 * API_ACTIONS
	 * Explicit allowlist of static methods callable by dd_tools_api::tool_request
	 * (SEC-024 §9.2). Every method in this list must independently enforce its own
	 * permission gate before performing any read or write operation.
	 *
	 * @var string[] API_ACTIONS
	 */
	public const API_ACTIONS = [
		// SEC-024 (§9.2): get_text_from_pdf removed — it accepts an arbitrary
		// `path_pdf` filesystem path with no authorisation check. It is used
		// internally by the transcription pipeline; callers should go through
		// `tool_pdf_extractor::get_pdf_data` which enforces a per-component
		// permission gate.
		'automatic_transcription',
		'create_transcribable_audio_file',
		'delete_transcribable_audio_file',
		'check_server_transcriber_status',
		'build_subtitles_file'
	];



	/**
	 * GET_TEXT_FROM_PDF
	 * Extract plain text from a PDF file, inserting [page-n-N] markers and
	 * HTML <br> tags at each page boundary.
	 *
	 * (!) This method is intentionally excluded from API_ACTIONS: it accepts an
	 * arbitrary filesystem path with no per-component permission gate. Use
	 * tool_pdf_extractor::get_pdf_data for authorisation-checked extraction.
	 *
	 * Workflow:
	 * 1. Validate path_pdf exists on disk.
	 * 2. Verify the PDF_AUTOMATIC_TRANSCRIPTION_ENGINE binary is resolvable.
	 * 3. Run pdftotext with -enc UTF-8 to produce a sibling .txt file.
	 * 4. Validate and sanitise the raw text (UTF-8 check + iconv strip + JSON round-trip).
	 * 5. Split on the pdftotext page-break character and prepend [page-n-N] labels.
	 * 6. Return tagged text plus the original untagged version.
	 *
	 * The $options default-merge loop only copies keys that already exist on
	 * the $options object, acting as a safe allowlist for incoming properties.
	 *
	 * @param object $new_options - Options object with:
	 *                               path_pdf (string, required): absolute path to source PDF.
	 *                               first_page (int, optional, default 1): page number to
	 *                               assign to the first extracted page.
	 * @return object - stdClass with:
	 *                  result (string): HTML page-tagged text, or 'error' on failure.
	 *                  msg (string): human-readable status.
	 *                  original (string, on success): raw untagged text before page marking.
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

		// Verify pdftotext binary is available
		// PDF_AUTOMATIC_TRANSCRIPTION_ENGINE holds the command name (e.g. 'pdftotext');
		// `type -P` resolves it to an absolute path, returning empty on failure.
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
		// pdftotext writes a sibling .txt file next to the source PDF, replacing its extension.
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

		// Validate and sanitise text encoding
		// valid_utf8() is a soft check — a non-UTF-8 result triggers a warning but
		// processing continues; utf8_clean() (iconv IGNORE + regex strip) does the
		// actual removal of invalid bytes.
		$test_utf8 = valid_utf8($pdf_text);
		if (!$test_utf8) {
			error_log("WARNING: Current string is NOT utf8 valid. Anyway continue ...");
		}

		// Remove non utf8 chars
		$pdf_text = utf8_clean($pdf_text);

		// JSON round-trip validation
		// Encoding then decoding through JSON::encode/decode serves as a final
		// correctness gate: if the cleaned string cannot survive a JSON encode it
		// contains sequences that would corrupt the component's stored value.
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
		// pdftotext separates pages with a form-feed character (ASCII 0x0C, \f).
		// (!) The page-break separator strings in str_replace() and explode() below
		// must contain the form-feed character (\f, 0x0C). If those literals appear
		// empty in the source view, the separator byte may have been stripped by an
		// editor or encoding issue — verify with `xxd` on this file. Without it,
		// str_replace() is a no-op and explode() raises a ValueError (empty delimiter).
		$original_text = str_replace("\f", "", $pdf_text);
		$pages = explode("\f", $pdf_text);
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
	 * Start a background audio transcription job against the configured service
	 * and return its process identifier (PID) for subsequent polling.
	 *
	 * The result object's `result->pid` value must be passed to
	 * check_server_transcriber_status() to monitor completion. On success,
	 * the transcription text will eventually be written into transcription_ddo
	 * by the background process.
	 *
	 * Engine dispatch:
	 * - 'babel_transcriber' — connects to the configured Babel API (url + key
	 *   from dd996 tool config) and starts a background process via
	 *   babel_transcriber::exec_background_check_transcription().
	 * - 'local' — normalised to 'babel_transcriber' before dispatch.
	 * - 'google_translation' — not yet implemented; returns an error response.
	 *
	 * If the standard 'audio' quality file for media_ddo does not exist, this
	 * method calls component_av::build_version('audio', false) to create it
	 * before starting transcription. If the file still cannot be created, the
	 * method returns an error response without throwing.
	 *
	 * @param object $options - Options with:
	 *                          source_lang (string): audio language code (lg-nolan format,
	 *                          e.g. 'lg-spa'). Converted to ISO-639-1 (tld2) for Babel.
	 *                          transcription_ddo (object): locator for the text component
	 *                          that will receive the result
	 *                          (section_tipo, section_id, component_tipo).
	 *                          media_ddo (object): locator for the source audio component
	 *                          (section_tipo, section_id, component_tipo).
	 *                          transcriber_engine (string): 'babel_transcriber' | 'local' |
	 *                          'google_translation'.
	 *                          transcriber_quality (string): quality model name passed to
	 *                          the transcriber (e.g. 'large', 'small').
	 * @return object - stdClass with:
	 *                  result (object|false): on success, an object with a `pid` property;
	 *                  false on error.
	 *                  msg (string): human-readable status.
	 *                  errors (array): accumulated error strings.
	 */
	public static function automatic_transcription( object $options ) : object {

		// SEC-024 (§9.2): WRITE gate. Result is written into transcription_ddo.
			$transcription_ddo = $options->transcription_ddo ?? null;
			if (is_object($transcription_ddo) && !empty($transcription_ddo->section_tipo)) {
				security::assert_section_permission(
					$transcription_ddo->section_tipo,
					2,
					__METHOD__
				);
				// SEC-024 (§9.4): per-record gate.
				if (!empty($transcription_ddo->section_id)) {
					security::assert_record_in_user_scope(
						$transcription_ddo->section_tipo,
						(int)$transcription_ddo->section_id,
						__METHOD__
					);
				}
			}

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

			// Locate the transcriber configuration entry for this engine
			// Config is stored in section dd996 under config->transcriber_config->value[]
			// as an array of {name, uri, key} objects. array_find returns the first match
			// or null; the ?? new stdClass() fallback avoids property-access errors below
			// (uri/key will simply be null, producing a cleaner error at the API call stage).
			$ar_transcriber_configs = $config->config->transcriber_config->value ?? [];
			$transcriber_name = $transcriber_engine;
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name === $transcriber_name;
			}) ?? new stdClass();

			// data from transcriber
			$url = $transcriber_config->uri ?? null;
			$key = $transcriber_config->key ?? null;

			// Instantiate the source audio component to resolve the media URL
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

			// Ensure the standard 'audio' quality file exists before starting transcription.
			// If it doesn't exist, build_version() attempts to create it from the source media.
			// A second existence check is needed because build_version() does not throw on failure.
			$audio_file = $component->quality_file_exist('audio');
			if ($audio_file === false) {
				$component->build_version('audio', false);
			}
			$audio_file = $component->quality_file_exist('audio');
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

					// Babel expects ISO-639-1 two-letter codes (tld2), not Dédalo's
					// lg-* three-letter codes (tld3). Convert before passing to the API.
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

					// Start the background polling loop.
					// exec_background_check_transcription() spawns a detached CLI process
					// (via process_runner.php) that polls the Babel server for $pid and
					// writes results back to transcription_ddo when complete.
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
	 * Build a Whisper-optimised audio rendition (quality 'audio_tr': WAV, 16 kHz, mono)
	 * and return its publicly accessible URL.
	 *
	 * Whisper speech-recognition accuracy improves significantly with 16 kHz mono WAV
	 * input. This quality is intentionally omitted from config.php because it is
	 * tool-specific and ephemeral — it should be deleted via
	 * delete_transcribable_audio_file() once the transcription job completes.
	 *
	 * The component extension is forced to 'wav' on the instance before calling
	 * build_version() so that FFmpeg (invoked internally by component_av) targets
	 * the correct output container. This is a runtime-only mutation and does not
	 * persist to the database.
	 *
	 * @param object $options - Options with:
	 *                          media_ddo (object, required): audio component locator —
	 *                          component_tipo (string), section_id (int|string),
	 *                          section_tipo (string).
	 * @return object - stdClass with:
	 *                  result (string|false): absolute public URL to the audio_tr file,
	 *                  or false on error.
	 *                  msg (string): human-readable status.
	 *                  errors (array): accumulated error strings.
	 *                  debug (object, when SHOW_DEBUG=true): includes av_url.
	 */
	public static function create_transcribable_audio_file( object $options ) : object {

		// SEC-024 (§9.2): WRITE gate on the source media component.
			$media_ddo = $options->media_ddo ?? null;
			if (is_object($media_ddo) && !empty($media_ddo->section_tipo)) {
				security::assert_section_permission($media_ddo->section_tipo, 2, __METHOD__);
				// SEC-024 (§9.4): per-record gate.
				if (!empty($media_ddo->section_id)) {
					security::assert_record_in_user_scope(
						$media_ddo->section_tipo,
						(int)$media_ddo->section_id,
						__METHOD__
					);
				}
			}

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

			// Instantiate the source audio (AV) component
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

			// Force the output container to WAV before calling build_version().
			// component_av uses $this->extension when constructing the target filename,
			// so this must be set prior to build_version() — it is not persisted.
			$component->extension = 'wav';

			// Build the audio_tr rendition if it does not already exist.
			// A second quality_file_exist() call is required because build_version()
			// does not return a status value — failure manifests only as a missing file.
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
	 * Permanently remove the ephemeral audio_tr (WAV) rendition created for
	 * Whisper transcription.
	 *
	 * Unlike standard component media deletion, this is a hard unlink() — the
	 * file is not moved to a delete directory and is not tracked by the time
	 * machine. This is intentional: the audio_tr quality is a purely temporary
	 * derivative; there is no value in preserving or reverting it.
	 *
	 * If the audio_tr file does not exist, the method returns success immediately
	 * (idempotent — safe to call even if create_transcribable_audio_file() was
	 * never called or already cleaned up).
	 *
	 * @param object $options - Options with:
	 *                          media_ddo (object, required): audio component locator —
	 *                          component_tipo (string), section_id (int|string),
	 *                          section_tipo (string).
	 * @return object - stdClass with:
	 *                  result (bool): true on success or when file already absent,
	 *                  false on error.
	 *                  msg (string): human-readable status.
	 *                  errors (array): accumulated error strings.
	 *                  debug (object, when SHOW_DEBUG=true): includes the deleted file path.
	 */
	public static function delete_transcribable_audio_file( object $options ) : object {

		// SEC-024 (§9.2): WRITE gate on the media component.
			$media_ddo = $options->media_ddo ?? null;
			if (is_object($media_ddo) && !empty($media_ddo->section_tipo)) {
				security::assert_section_permission($media_ddo->section_tipo, 2, __METHOD__);
				// SEC-024 (§9.4): per-record gate.
				if (!empty($media_ddo->section_id)) {
					security::assert_record_in_user_scope(
						$media_ddo->section_tipo,
						(int)$media_ddo->section_id,
						__METHOD__
					);
				}
			}

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

			// Instantiate the audio component to resolve the audio_tr file path
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

			// Extension must be set before get_media_filepath() — mirrors the pattern
			// used in create_transcribable_audio_file().
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
	 * Poll a running transcription job for its current status.
	 *
	 * Intended to be called repeatedly from the browser after
	 * automatic_transcription() returns a PID. The method delegates to
	 * babel_transcriber::check_transcriber_status() (static call, no instance
	 * needed), passing delete_result=false so the server-side result is retained
	 * for the next poll cycle.
	 *
	 * The media_ddo locator is used here only to reconstruct the audio URL
	 * (matching the URL that was submitted to the transcription service); it is
	 * not used to write any component data. A READ permission (level 1) is
	 * therefore sufficient and is gated on media_ddo->section_tipo.
	 *
	 * @param object $options - Options with:
	 *                          media_ddo (object, required): audio component locator.
	 *                          transcriber_engine (string, required): engine name —
	 *                          same value as passed to automatic_transcription().
	 *                          pid (string|int, required): process identifier returned
	 *                          by automatic_transcription().
	 * @return object - stdClass with:
	 *                  result (mixed): status object returned by the transcriber backend;
	 *                  false on error.
	 *                  msg (string): human-readable status.
	 *                  errors (array): accumulated error strings.
	 */
	public static function check_server_transcriber_status( object $options ) : object {

		// SEC-024 (§9.2): READ gate. Status polling for the user's own job; we
		// still gate by media_ddo section to prevent cross-user PID polling.
			$media_ddo = $options->media_ddo ?? null;
			if (is_object($media_ddo) && !empty($media_ddo->section_tipo)) {
				security::assert_section_permission($media_ddo->section_tipo, 1, __METHOD__);
				// SEC-024 (§9.4): per-record gate.
				if (!empty($media_ddo->section_id)) {
					security::assert_record_in_user_scope(
						$media_ddo->section_tipo,
						(int)$media_ddo->section_id,
						__METHOD__
					);
				}
			}

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

			// Resolve the transcriber config entry for this engine (same logic as
			// in automatic_transcription — see that method for an explanation of
			// the array_find / fallback stdClass pattern).
			$ar_transcriber_configs = $config->config->transcriber_config->value ?? [];
			$transcriber_name = $transcriber_engine;
			$transcriber_config = array_find($ar_transcriber_configs, function($item) use($transcriber_name) {
				return $item->name === $transcriber_name;
			}) ?? new stdClass();

			// data from transcriber
			$url = $transcriber_config->uri ?? null;
			$key = $transcriber_config->key ?? null;

			// Instantiate the audio component to reconstruct the av_url.
			// The transcriber backend identifies the job by this URL so it must
			// match exactly what was submitted during automatic_transcription().
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

			// Dispatch status check to the appropriate backend
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

					// Static call — no babel_transcriber instance needed for polling.
					// delete_result=false means the server retains the result for
					// subsequent poll calls; the client decides when to stop polling.
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
	 * Generate a VTT subtitle file from the transcribed text of a given component
	 * and write it to the media file system.
	 *
	 * The subtitle timecodes are distributed uniformly across the total audio duration
	 * (sourced from the AV component related to the text component) with a configurable
	 * maximum characters-per-line constraint for readability. The related AV component
	 * tipo is resolved via $component_text_area->get_related_component_av_tipo() — the
	 * text component must therefore declare its AV sibling in the ontology.
	 *
	 * The VTT file is written to the path returned by $component_av->get_subtitles_path($lang);
	 * its public URL is returned in the response as `url`. The target directory must
	 * already exist — this method does not create it and returns an error if absent.
	 *
	 * `key` selects which datum within the text component's data array to use as the
	 * subtitle source (default 0 = the first). This supports multi-value components
	 * where each value is a separate transcription pass.
	 *
	 * @param object $options - Options with:
	 *                          component_tipo (string, required): text component tipo
	 *                          whose value becomes the subtitle source.
	 *                          section_tipo (string, required): section tipo.
	 *                          section_id (int|string, required): section id.
	 *                          lang (string, required): language code for text retrieval
	 *                          (lg-nolan format, e.g. 'lg-spa').
	 *                          key (int, optional, default 0): datum index within the
	 *                          component's data array.
	 *                          max_charline (int, required): maximum characters per
	 *                          subtitle line passed to subtitles::build_subtitles_text().
	 * @return object - stdClass with:
	 *                  result (bool): true on success, false on error or empty text.
	 *                  url (string, on success): public URL to the generated VTT file.
	 *                  msg (string): human-readable status.
	 *                  errors (array): accumulated error strings.
	 */
	public static function build_subtitles_file( object $options ) : object {

		// SEC-024 (§9.2): WRITE gate on the (section_tipo, component_tipo).
			$bs_section_tipo = $options->section_tipo ?? null;
			$bs_component_tipo = $options->component_tipo ?? null;
			$bs_section_id = $options->section_id ?? null;
			if (!empty($bs_section_tipo) && !empty($bs_component_tipo)) {
				security::assert_tipo_permission(
					$bs_section_tipo,
					$bs_component_tipo,
					2,
					__METHOD__
				);
				// SEC-024 (§9.4): per-record gate.
				if (!empty($bs_section_id)) {
					security::assert_record_in_user_scope(
						$bs_section_tipo,
						(int)$bs_section_id,
						__METHOD__
					);
				}
			}

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

			// Instantiate the text component in 'list' mode to retrieve stored text.
			// The $lang parameter is passed so get_data_lang() returns data for the
			// correct language column directly.
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

			// Resolve the related AV component to obtain audio duration and subtitle paths.
			// get_related_component_av_tipo() looks up the ontology sibling relationship
			// defined for this text component — the pairing must be configured in the
			// section's ontology for this to work.
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
			// Subtitle timecodes are expressed in milliseconds by subtitles::build_subtitles_text().
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

			// class subtitles — loaded on demand; not autoloaded because it is a shared
			// utility rather than a core component.
			include_once(DEDALO_SHARED_PATH . '/class.subtitles.php');

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
 * Module-level helpers for UTF-8 byte-sequence validation and sanitisation.
 *
 * These functions implement a manual byte-level UTF-8 parser following the
 * encoding rules from https://en.wikipedia.org/wiki/UTF-8:
 * - 0x00–0x7F  → single-byte (ASCII)
 * - 0xC0–0xDF  → 2-byte leader (followed by 1 continuation byte)
 * - 0xE0–0xEF  → 3-byte leader (followed by 2 continuation bytes)
 * - 0xF0–0xF7  → 4-byte leader (followed by 3 continuation bytes)
 * - 0x80–0xBF  → continuation byte (valid only after a multi-byte leader)
 *
 * Originally adapted from an implementation by Maarten Meijer (2005).
 * Used by get_text_from_pdf() to detect and strip corrupt bytes produced
 * by pdftotext on malformed PDFs before the text is stored in a component.
 *
 * @package Dédalo
 * @subpackage Tools
 */

/**
 * VALID_UTF8
 * Walk every byte of $string and return false as soon as an invalid UTF-8
 * sequence is encountered.
 *
 * This is a diagnostic check only — it does not repair the string. Pass the
 * string through utf8_clean() afterwards to remove invalid bytes.
 *
 * @param string $string - Raw string to validate.
 * @return bool - true when every byte belongs to a valid UTF-8 sequence.
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
 * Return true when $char is an ASCII / single-byte UTF-8 code point (0x00–0x7F).
 * High bit must be 0: ($char & 0x80) === 0x00.
 *
 * @param int $char - Byte value (0–255) to test.
 * @return bool
 */
function valid_1byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0x80) == 0x00;
}

/**
 * VALID_2BYTE
 * Return true when $char is a two-byte UTF-8 sequence leader (0xC0–0xDF).
 * Pattern: top three bits must be 110: ($char & 0xE0) === 0xC0.
 *
 * @param int $char - Byte value to test.
 * @return bool
 */
function valid_2byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xE0) == 0xC0;
}

/**
 * VALID_3BYTE
 * Return true when $char is a three-byte UTF-8 sequence leader (0xE0–0xEF).
 * Pattern: top four bits must be 1110: ($char & 0xF0) === 0xE0.
 *
 * @param int $char - Byte value to test.
 * @return bool
 */
function valid_3byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF0) == 0xE0;
}

/**
 * VALID_4BYTE
 * Return true when $char is a four-byte UTF-8 sequence leader (0xF0–0xF7).
 * Pattern: top five bits must be 11110: ($char & 0xF8) === 0xF0.
 *
 * @param int $char - Byte value to test.
 * @return bool
 */
function valid_4byte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xF8) == 0xF0;
}

/**
 * VALID_NEXTBYTE
 * Return true when $char is a valid UTF-8 continuation byte (0x80–0xBF).
 * Pattern: top two bits must be 10: ($char & 0xC0) === 0x80.
 * Must follow immediately after a multi-byte leader without an intervening
 * single-byte or new leader byte.
 *
 * @param int $char - Byte value to test.
 * @return bool
 */
function valid_nextbyte($char) : bool {
	if(!is_int($char)) return false;
	return ($char & 0xC0) == 0x80;
}

/**
 * UTF8_CLEAN
 * Strip invalid UTF-8 bytes from $string and normalise line endings.
 *
 * Two-pass process:
 * 1. iconv('UTF-8', 'UTF-8//IGNORE', …) — drops all bytes that cannot be
 *    decoded as valid UTF-8 code points.
 * 2a. If $control=false (default): normalise CR and CRLF to LF, then strip
 *     any remaining Unicode control characters except tab (\t) and newline (\n)
 *     using the PCRE \P{C} (non-control) property class. This preserves document
 *     structure while removing invisible garbage bytes common in PDF extracts.
 * 2b. If $control=true: remove ALL Unicode control characters (including tabs and
 *     newlines) via \p{C}. Use this mode for single-line fields where whitespace
 *     control characters must not appear.
 *
 * @param string $string - The string to clean.
 * @param bool $control = false - When true, also strips tabs and newlines.
 * @return string - Cleaned string with only valid UTF-8 code points remaining.
 */
function utf8_clean(string $string, bool $control = false) : string {
	$string = iconv('UTF-8', 'UTF-8//IGNORE', $string);

	if ($control === true) {
		return preg_replace('~\p{C}+~u', '', $string);
	}

	return preg_replace(array('~\r\n?~', '~[^\P{C}\t\n]+~u'), array("\n", ''), $string);
}
