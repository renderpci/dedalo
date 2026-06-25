<?php declare(strict_types=1);
/**
 * CLASS TOOL_MEDIA_VERSIONS
 * API tool that exposes media file version management to the browser UI.
 *
 * Dédalo media components (component_image, component_av, component_pdf, etc.)
 * produce multiple quality variants of each uploaded file (e.g. 'original',
 * 'medium', 'thumb').  This tool acts as the secure HTTP/JSON gateway between
 * the browser-side media-versions widget and those component methods.
 *
 * Responsibilities:
 * - Validate incoming options (tipo, section_tipo, section_id, quality …) and
 *   return a structured error response rather than throwing to the client.
 * - Enforce dual-gate security (SEC-024): tipo-level permission check first,
 *   then per-record scope check, before instantiating any component.
 * - Instantiate the correct component model via ontology_node::get_model_by_tipo()
 *   and delegate each operation to the component's own implementation.
 * - Normalise the delegated response into the standard
 *   {result, msg, errors[]} shape used by dd_tools_api.
 *
 * Supported operations (all exposed via API_ACTIONS):
 * - get_files_info    — read quality metadata for all versions (READ gate).
 * - delete_quality    — remove a derived quality file (WRITE gate).
 * - build_version     — transcode/generate a quality from the original (WRITE gate).
 * - conform_headers   — remux a file's container headers; av-specific (WRITE gate).
 * - rotate            — apply an ImageMagick rotation; image-specific (WRITE gate).
 * - sync_files        — reconcile stored files_info with the filesystem (WRITE gate).
 * - delete_version    — remove a specific version file, routing thumb vs non-thumb
 *                       through the correct component method (WRITE gate).
 *
 * All methods are static because the tool is called through dd_tools_api without
 * instantiation; the class inherits infrastructure (get_config, get_active_tools,
 * etc.) from tool_common.
 *
 * @package Dédalo
 * @subpackage Media
 */
class tool_media_versions extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`.
	*/
	public const API_ACTIONS = [
		'get_files_info',
		'delete_quality',
		'build_version',
		'conform_headers',
		'rotate',
		'sync_files',
		'delete_version'
	];



	/**
	 * GET_FILES_INFO
	 * Returns metadata for every quality version attached to a media component.
	 *
	 * Delegates to component_media_common::get_files_info(), which scans the
	 * filesystem and returns an array of file-info objects — one per quality tier —
	 * carrying properties such as quality name, URL, size, extension, and whether
	 * the file actually exists on disk.
	 *
	 * This is the read-only entry point used by the browser widget to populate the
	 * version list panel.  The operation only requires READ permission (level 1).
	 *
	 * @param object $options {
	 *   @type string $tipo         Component tipo (e.g. 'rsc37').
	 *   @type string $section_tipo Section tipo that owns the record (e.g. 'rsc176').
	 *   @type string|int $section_id  Record primary key within section_tipo.
	 * }
	 * @return object {result: array|false, msg: string}
	 *   On success, result is the files_info array returned by the component.
	 *   On validation failure or empty result, result is false.
	 */
	public static function get_files_info(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo)) {
				return (object)[
					'result' => false,
					'msg'    => 'Error. Missing required parameters: tipo, section_id, section_tipo'
				];
			}

		// SEC-024 (§9.2): READ gate.
			security::assert_tipo_permission($section_tipo, $tipo, 1, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$files_info = $component->get_files_info();

			// response
				if ($files_info !== null && !empty($files_info)) {
					$response->result	= $files_info;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
				}
		} catch (Exception $e) {
			$response->msg = 'Error. ' . $e->getMessage();
		}

		return (object)$response;
	}//end get_files_info



	/**
	 * DELETE_QUALITY
	 * Permanently removes the physical file for one quality tier of a media component.
	 *
	 * Delegates to component_media_common::delete_file($quality), which unlinks the
	 * on-disk file and updates the stored files_info JSON so the database record no
	 * longer references the deleted variant.  Only the single named quality is
	 * affected; other quality files for the same record are left untouched.
	 *
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * @param object $options {
	 *   @type string     $tipo         Component tipo.
	 *   @type string     $section_tipo Section tipo.
	 *   @type string|int $section_id   Record primary key.
	 *   @type string     $quality      Quality tier to delete (e.g. 'medium', 'original').
	 * }
	 * @return object {result: bool, msg: string, errors: array}
	 *   result is true only when delete_file() confirms the file was removed.
	 */
	public static function delete_quality(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. delete_quality removes a derived file.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$delete_response = $component->delete_file($quality);

			// merge responses
				$response->result	= $delete_response->result ?? false;
				$response->msg		= $delete_response->msg ?? 'OK. Request done';
				$response->errors	= $delete_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end delete_quality


	/**
	 * BUILD_VERSION
	 * Generates (or re-generates) a derived quality file from the stored original.
	 *
	 * Delegates to component_media_common::build_version($quality, $async), which
	 * runs the appropriate transcoding or conversion pipeline (FFmpeg for video/audio,
	 * ImageMagick for images, Ghostscript for PDFs, etc.) to produce the requested
	 * quality tier.  The new file is written to disk and the component's files_info
	 * record is updated.
	 *
	 * When $async is true (the default), the transcoding job is dispatched
	 * asynchronously so the HTTP response returns immediately; the client polls
	 * get_files_info to detect completion.
	 *
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * @param object $options {
	 *   @type string     $tipo         Component tipo.
	 *   @type string     $section_tipo Section tipo.
	 *   @type string|int $section_id   Record primary key.
	 *   @type string     $quality      Quality tier to build (e.g. 'medium', 'high').
	 *   @type bool       $async        [= true] Whether to run transcode asynchronously.
	 * }
	 * @return object {result: bool, msg: string, errors: array}
	 */
	public static function build_version(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$async			= $options->async ?? true;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. build_version writes derived files to disk.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$build_response = $component->build_version($quality, $async);

			// merge responses
				$response->result	= $build_response->result ?? false;
				$response->msg		= $build_response->msg ?? 'OK. Request done';
				$response->errors	= $build_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end build_version


	/**
	 * CONFORM_HEADERS
	 * Rewrites a video/audio file's container headers without re-encoding the media.
	 *
	 * Some media files uploaded with non-standard or malformed container metadata
	 * (e.g. missing moov atom positioning, incorrect codec tags) fail to play in
	 * certain browsers.  This operation remuxes the file using FFmpeg to produce a
	 * spec-compliant container while preserving the encoded stream bit-for-bit.
	 *
	 * Delegates to component_av::conform_headers($quality).  The operation is
	 * currently specific to component_av (see register.json specific_actions).
	 *
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * @param object $options {
	 *   @type string     $tipo         Component tipo; expected to resolve to component_av.
	 *   @type string     $section_tipo Section tipo.
	 *   @type string|int $section_id   Record primary key.
	 *   @type string     $quality      Quality tier whose file headers should be conformed.
	 * }
	 * @return object {result: bool, msg: string, errors: array}
	 */
	public static function conform_headers(object $options) : object {

		// response template
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. conform_headers rewrites the on-disk file.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$conform_response = $component->conform_headers($quality);

			// merge responses
				$response->result	= $conform_response->result ?? false;
				$response->msg		= $conform_response->msg ?? 'OK. Request done';
				$response->errors	= $conform_response->errors ?? [];
		} catch (Exception $e) {
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end conform_headers


	/**
	 * ROTATE
	 * Applies an in-place pixel rotation to one quality tier of an image component.
	 *
	 * Delegates to component_image::rotate($rotation_options) which calls
	 * ImageMagick::rotate() under the hood.  The method iterates the component's
	 * data element's files_info array and operates only on the entry that matches
	 * the requested quality; all other quality files are left untouched.
	 *
	 * The rotation is always performed in 'expanded' mode — the canvas grows to
	 * contain the rotated image rather than clipping corners — matching the preset
	 * defined in component_image.
	 *
	 * This action is specific to component_image (see register.json specific_actions).
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * Contract for $component->rotate():
	 *   Returns null (or empty string) on success, or a non-empty error string on
	 *   failure.  A non-empty return value flips $result to false and appends the
	 *   error to $response->errors.
	 *
	 * @param object $options {
	 *   @type string     $tipo         Component tipo; expected to resolve to component_image.
	 *   @type string     $section_tipo Section tipo.
	 *   @type string|int $section_id   Record primary key.
	 *   @type string     $quality      Quality tier to rotate (e.g. 'original', 'medium').
	 *   @type int|float  $degrees      Clockwise rotation angle in degrees.
	 * }
	 * @return object {result: bool, msg: string, errors: array}
	 */
	public static function rotate(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$degrees		= $options->degrees ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality) || $degrees === null) {
				$response->errors[] = 'Missing required parameters: tipo, section_id, section_tipo, quality, degrees';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. rotate mutates derived files on disk.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo, true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

			$data_element = $component->get_data()[0] ?? null;
			$files_info	= $data_element->files_info ?? [];

			$result = true;
			foreach ($files_info as $value) {

				if($value->quality === $quality){

					$rotation_options = new stdClass();
						$rotation_options->quality			= $value->quality;
						$rotation_options->extension		= $value->extension;
						$rotation_options->degrees			= $degrees;
						$rotation_options->rotation_mode	= 'expanded';

					// result boolean
					$command_result = $component->rotate($rotation_options);
					if (!empty($command_result)){
						$result				= false;
						$response->errors[]	= $command_result;
					}
				}
			}

			// response
			$response->result	= $result;
			$response->msg		= ($result === true)
				? 'Success. Request done.'
				: 'Error on rotate file.';
		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end rotate


	/**
	 * SYNC_FILES
	 * Reconciles a component's stored files_info metadata against the actual filesystem.
	 *
	 * When a file is deleted outside Dédalo (e.g. manually removed from disk), the
	 * database record still contains stale files_info entries.  This method calls
	 * component_media_common::regenerate_component(), which re-scans the filesystem,
	 * rebuilds the files_info JSON, and persists the corrected state back to the DB.
	 *
	 * Unlike the other methods in this class, sync_files uses mode='edit' and the
	 * current data language (DEDALO_DATA_LANG) because regenerate_component() must
	 * load and then overwrite the live language-aware record.  cache=false is passed
	 * to ensure the instance reads a fresh copy from the database rather than a
	 * stale cached version.
	 *
	 * get_data() is called explicitly before regenerate_component() to preload the
	 * existing datum so the regeneration routine has the original data available for
	 * diffing and cleanup steps.
	 *
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * @param object $options {
	 *   @type string      $tipo               Component tipo.
	 *   @type string      $section_tipo       Section tipo.
	 *   @type string|int  $section_id         Record primary key.
	 *   @type object|null $regenerate_options [= null] Optional flags forwarded to
	 *                                         regenerate_component() (e.g.
	 *                                         delete_normalized_files=true).
	 * }
	 * @return object {result: bool, msg: string}
	 */
	public static function sync_files(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$tipo				= $options->tipo ?? null;
			$section_tipo		= $options->section_tipo ?? null;
			$section_id			= $options->section_id ?? null;
			$regenerate_options	= $options->regenerate_options ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo)) {
			$response->msg = 'Missing required parameters: tipo, section_id, section_tipo';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. sync_files regenerates component metadata.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo, true);
				$lang		= DEDALO_DATA_LANG;
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'edit',
					$lang,
					$section_tipo,
					false // cache
				);

			// regenerate data
				$component->get_data(); // !! Important: get data before regenerate
				$result = $component->regenerate_component($regenerate_options);
				if ($result!==true) {
					debug_log(__METHOD__
						. ' Error on regenerate component ' .PHP_EOL
						. ' model: ' .$model .PHP_EOL
						. ' component_tipo: ' .$tipo .PHP_EOL
						. ' section_tipo: ' .$section_tipo .PHP_EOL
						. ' section_id: ' .$section_id
						, logger::ERROR
					);
				}

			// response success
				if ($result===true) {
					$response->result	= true;
					$response->msg		= 'Success. Request done';

					debug_log(__METHOD__
						. ' Regenerated component ' .PHP_EOL
						. ' model: ' .$model .PHP_EOL
						. ' component_tipo: ' .$tipo .PHP_EOL
						. ' section_tipo: ' .$section_tipo .PHP_EOL
						. ' section_id: ' .$section_id
						, logger::DEBUG
					);
				}
		} catch (Exception $e) {
			$response->msg = 'Error. ' . $e->getMessage();
		}

		return $response;
	}//end sync_files


	/**
	 * DELETE_VERSION
	 * Removes a specific version file, routing thumb and non-thumb files to the
	 * appropriate component method.
	 *
	 * Media components store a thumbnail separately from their main quality files:
	 * thumbnails are managed by delete_thumb() while all other quality files are
	 * handled by delete_file($quality, $extension).  This method inspects the
	 * requested quality against component_media_common::get_thumb_quality() and
	 * dispatches accordingly so the caller does not need to know the internal
	 * thumbnail naming convention.
	 *
	 * Differences from delete_quality():
	 * - Accepts an optional $extension parameter for formats that use it
	 *   (e.g. component_pdf produces 'rsc37_rsc176_25.pdf').
	 * - Routes thumb deletions through delete_thumb() instead of delete_file().
	 *
	 * A WRITE permission gate (level 2) is enforced before the component is loaded.
	 *
	 * @param object $options {
	 *   @type string      $tipo         Component tipo.
	 *   @type string      $section_tipo Section tipo.
	 *   @type string|int  $section_id   Record primary key.
	 *   @type string      $quality      Quality tier to remove.
	 *   @type string|null $extension    [= null] File extension for formats where
	 *                                   the extension is part of the filename key.
	 * }
	 * @return object {result: bool, msg: string, errors: array}
	 */
	public static function delete_version(object $options) : object {

		// options
			$tipo			= $options->tipo ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$quality		= $options->quality ?? null;
			$extension		= $options->extension ?? null;

		// validate input
			if (empty($tipo) || empty($section_id) || empty($section_tipo) || empty($quality)) {
				return (object)[
					'result'	=> false,
					'msg'		=> 'Error. Missing required parameters: tipo, section_id, section_tipo, quality',
					'errors'	=> []
				];
			}

		// SEC-024 (§9.2): WRITE gate. delete_version removes media files.
			security::assert_tipo_permission($section_tipo, $tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		try {
			// component
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

			// delete file method is based on quality / extension
				switch (true) {
					case ( $quality===$component->get_thumb_quality() ):

						// thumb case
						$result = $component->delete_thumb();

						// update response object
						$response->result	= $result;
						$response->msg		= $result===false ? 'Error. Request failed' : 'OK file delete successfully';
						$response->errors	= $result===false ? ['file not deleted'] : [];
						break;

					default:
						// main file like 'rsc37_rsc176_25.pdf' for component_pdf
						$delete_file_response = $component->delete_file($quality, $extension);

						// update response object
						$response->result	= $delete_file_response->result ?? false;
						$response->msg		= $delete_file_response->msg ?? 'Error. Request failed';
						$response->errors	= $delete_file_response->errors ?? [];
						break;
				}
		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
		}

		return $response;
	}//end delete_version


}//end class tool_media_versions
