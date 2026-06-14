<?php declare(strict_types=1);
/**
* CLASS COMPONENT_3D
* Manages 3D model media components in Dédalo.
*
* Concrete implementation of the media component contract for three-dimensional
* asset types (GLB, GLTF, OBJ, FBX, DAE, ZIP). Responsibilities include:
* - Resolving config-driven quality levels ('original', 'web') and file extensions
* - Generating server-side file paths and public URLs for each quality variant
* - Handling the upload processing pipeline: validation → regeneration → data persistence
* - Soft-deleting media files by moving them to a per-quality 'deleted' subfolder
* - Restoring the most-recently-deleted version from the 'deleted' subfolder
* - Managing a JPEG posterframe (thumbnail preview) alongside the 3D file
* - Generating a thumb image from the posterframe via ImageMagick
* - Providing atoms-based export values (cell_type 'img') compatible with the
*   export_tabulator NDJSON protocol
*
* Quality tiers (all defined in config):
*   DEDALO_3D_QUALITY_ORIGINAL ('original') — raw upload, preserved without conversion
*   DEDALO_3D_QUALITY_DEFAULT  ('web')      — optimised variant served to browsers
*
* Preferred delivery format: GLB (binary GLTF), returned by get_best_extensions().
* The posterframe is always stored as JPEG (DEDALO_AV_POSTERFRAME_EXTENSION = 'jpg').
*
* Extends component_media_common, which provides shared media infrastructure
* (path construction, file management, quality negotiation, etc.).
* Implements component_media_interface to satisfy the interface contract expected
* by upload tools, regeneration pipelines, and the API layer.
*
* @package Dédalo
* @subpackage Core
*/
class component_3d extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/
		/**
		* Public URL for the 3D media file served by this component.
		* Null until resolved by the URL-building helpers. Populated lazily
		* by the JSON controller (component_3d_json.php) for the active quality.
		* File name pattern: '<section_tipo>_<section_id>_<order_id>.<ext>'
		* Example: 'rsc35_rsc167_1.glb'
		* @var ?string $url
		*/
		// url. File name formatted as 'tipo'-'order_id' like dd732-1
		public ?string $url = null;



	/**
	* GET_AR_QUALITY
	* Returns every defined quality level for 3D files, as declared in config.
	* Callers use this list to iterate over all variants when building, deleting,
	* or inspecting quality-specific files.
	* Config constant: DEDALO_3D_AR_QUALITY — example value: ['original', 'web'].
	* @return array - ordered list of quality identifiers
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_3D_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* Returns the quality level that is served to browser clients when no explicit
	* quality is requested. For 3D assets this is the optimised 'web' variant
	* (DEDALO_3D_QUALITY_DEFAULT = 'web').
	* @return string - default quality identifier (e.g. 'web')
	*/
	public function get_default_quality() : string {

		return DEDALO_3D_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* Returns the quality identifier for the unprocessed upload. The original
	* file is kept verbatim; derivative qualities are built from it.
	* Config constant: DEDALO_3D_QUALITY_ORIGINAL = 'original'.
	* @return string - original quality identifier (e.g. 'original')
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_3D_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* Returns the subset of quality levels that are considered 'normalized'
	* (i.e. standardised, browser-ready variants). For 3D components this is
	* only the default quality, because the original upload may be in any of
	* several supported input formats and does not need to be normalized itself.
	* @return array - normalized quality identifiers (currently just [default_quality])
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$default_quality = $this->get_default_quality();

		$normalized_ar_quality = [$default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_EXTENSION
	* Returns the primary file extension for 3D files served by this component.
	* Falls back to DEDALO_3D_EXTENSION ('glb') when the instance property has not
	* been explicitly set. GLB (binary GLTF) is the preferred delivery format.
	* @return string - file extension without leading dot (e.g. 'glb')
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_3D_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* Returns the full list of file extensions accepted during upload.
	* Validation in the upload pipeline checks each incoming file against this list
	* before saving. Config constant: DEDALO_3D_EXTENSIONS_SUPPORTED.
	* Example: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'zip'].
	* @return array - accepted upload file extensions (without leading dots)
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_3D_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* Returns the root storage sub-directory for 3D media files, relative to
	* DEDALO_MEDIA_PATH / DEDALO_MEDIA_URL. Typically '/3d' (DEDALO_3D_FOLDER).
	* The instance property $this->folder takes precedence when set, allowing
	* per-instance overrides (e.g. during testing or migration).
	* @return string - folder path segment (e.g. '/3d')
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_3D_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Returns the ordered list of preferred file extensions for 3D delivery,
	* from most to least desirable. The first entry in the list is the ideal
	* target format after conversion. Currently only GLB (binary GLTF) is listed
	* because it has the widest WebGL/AR viewer support and good compression.
	* @return array - preferred extensions in descending priority order
	*/
	public function get_best_extensions() : array {

		return ['glb'];
	}//end get_best_extensions



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract (see component_common::get_export_value).
	* Produces a single export_value atom containing the URL for the 3D asset
	* (or its posterframe URL in non-edit modes), with cell_type 'img' so that
	* tabular export renderers treat it as a displayable image/media cell.
	*
	* In 'edit' mode: uses the default quality URL for the 3D file itself.
	* In other modes (list, tm, etc.): falls back to the posterframe (JPEG preview).
	*
	* URL absoluteness is driven by $context->absolute_urls, replacing the legacy
	* $this->caller==='tool_export' switch that older media components used.
	* Returns an empty-string URL (not null) when the component holds no data,
	* to keep the atom count stable for flat-table column alignment.
	*
	* @param export_context|null $context = null - export configuration; a default
	*   context is created when null is passed
	* @return export_value - single scalar atom with the media URL and cell_type 'img'
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		// current_url. get from data
			$data = $this->get_data();
			if (isset($data)) {
				$current_url = ($this->mode==='edit')
					? $this->get_url(
						$this->get_default_quality(), // string quality
						false, // bool test_file
						$context->absolute_urls, // bool absolute
						false // bool default_add
					  )
					: $this->get_posterframe_url();
			}else{
				$current_url = '';
			}

		return export_value::from_scalar(
			$path,
			$current_url,
			(object)['cell_type' => 'img'],
			$this->get_label(),
			get_called_class()
		);
	}//end get_export_value



	/**
	* GET_POSTERFRAME_FILE_NAME
	* Returns the bare filename (without directory path) for the JPEG posterframe
	* associated with this component instance. The name is derived from the
	* component's unique identifier so it is deterministic and collision-free.
	* Format: '<section_tipo>_<section_id>_<order_id>.jpg'
	* Example: 'rsc35_rsc167_1.jpg'
	* @return string - posterframe file name including the .jpg extension
	*/
	public function get_posterframe_file_name() : string {

		$posterframe_file_name = $this->get_id() .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		return $posterframe_file_name;
	}//end get_posterframe_file_name



	/**
	* GET_POSTERFRAME_FILEPATH
	* Returns the absolute server filesystem path to the posterframe JPEG file.
	* Path structure: DEDALO_MEDIA_PATH/<folder>/posterframe/<additional_path>/<filename>
	* Example: '/var/www/dedalo/media/3d/posterframe/rsc35_rsc167_1.jpg'
	*
	* Note: this method does NOT verify that the file exists; callers requiring
	* existence checks should use file_exists() on the returned path.
	* @return string - absolute path to the posterframe file
	*/
	public function get_posterframe_filepath() : string {

		$file_name			= $this->get_posterframe_file_name();
		$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
		$additional_path	= $this->additional_path;

		$posterframe_filepath = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;


		return $posterframe_filepath;
	}//end get_posterframe_filepath



	/**
	* GET_POSTERFRAME_URL
	* Returns the public URL for the JPEG posterframe of this 3D asset.
	* URL structure mirrors get_posterframe_filepath() but uses DEDALO_MEDIA_URL.
	*
	* Parameters allow callers to tailor the URL to their use case:
	*   $test_file   — when true, returns null instead of an invalid URL if the
	*                  file is absent (e.g. to suppress broken <img> tags)
	*   $absolute    — when true, prepends DEDALO_PROTOCOL + DEDALO_HOST so the
	*                  URL is usable in e-mail, export, or cross-origin contexts
	*   $avoid_cache — when true, appends '?t=<timestamp>' to bust browser caches
	*                  after an updated posterframe has been generated
	*
	* @param bool $test_file = false - return null when the file does not exist
	* @param bool $absolute = false - prepend protocol + host to make URL absolute
	* @param bool $avoid_cache = false - append cache-busting query parameter
	* @return string|null - posterframe URL, or null when test_file=true and file absent
	*/
	public function get_posterframe_url(bool $test_file=false, bool $absolute=false, bool $avoid_cache=false) : ?string {

		$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
		$file_name			= $this->get_posterframe_file_name();
		$additional_path	= $this->additional_path;

		$posterframe_url = DEDALO_MEDIA_URL . $folder .'/posterframe'. $additional_path .'/'. $file_name;

		// FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			// $file = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;
			$file = $this->get_posterframe_filepath();
			if(!file_exists($file)) {
				return null;
			}
		}

		// ABSOLUTE (Default false)
		if ($absolute===true) {
			$posterframe_url = DEDALO_PROTOCOL . DEDALO_HOST . $posterframe_url;
		}

		if ($avoid_cache===true) {
			$posterframe_url .= '?t=' .time();
		}


		return $posterframe_url;
	}//end get_posterframe_url



	/**
	* CREATE_POSTERFRAME
	* Intended to generate a JPEG posterframe from a frame of the 3D asset at
	* the given playback time, mirroring the pattern used by component_av.
	*
	* (!) NOT YET IMPLEMENTED for 3D assets. 3D files are not time-based media
	* and do not have a concept of 'currentTime' in the same way video does.
	* This stub exists to satisfy the component_media_interface contract and to
	* reserve the API surface for a future render-based posterframe pipeline.
	* Returns false unconditionally; callers must handle this gracefully.
	*
	* @param float $current_time - playback position in seconds (HTML5 currentTime)
	* @param string|null $target_quality = null - quality variant to read source from
	* @param array|string|null $ar_target = null - optional forced target path/filename
	* @return bool - always false (not implemented)
	*/
	public function create_posterframe( $current_time, ?string $target_quality=null, array|string|null $ar_target=null ) : bool {

		debug_log(__METHOD__
			. " Sorry. This method is not implemented yet"
			, logger::WARNING
		);

		return false;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* Removes the posterframe JPEG file from disk. Called when the parent section
	* or the 3D component itself is permanently cleaned up (not during soft-delete,
	* which uses remove_component_media_files instead).
	*
	* Returns false (with a debug log) rather than throwing when the file is already
	* absent or when the unlink() call fails, so callers can inspect and continue
	* a broader deletion sequence.
	* @return bool - true on successful removal, false when file is missing or deletion fails
	*/
	public function delete_posterframe() : bool {

		$file = $this->get_posterframe_filepath();

		// check file already exists
			if(!file_exists($file)) {
				debug_log(__METHOD__
					." Ignored delete posterframe. File do not exists: ".to_string($file)
					, logger::DEBUG
				);
				return false;
			}

		 // delete file
			if(!unlink($file)) {
				debug_log(__METHOD__
					."  Error on delete posterframe file. Posterframe file is not deleted " . PHP_EOL
					. ' file: ' . $file
					, logger::ERROR
				);
				return false;
			}


		return true;
	}//end delete_posterframe



	/**
	* CREATE_THUMB
	* Generates a thumbnail image for this 3D asset by passing the existing
	* posterframe JPEG through ImageMagick. The thumb is written to the path
	* returned by get_media_filepath($thumb_quality, $thumb_extension).
	*
	* Prerequisites: the posterframe file must already exist on disk; if it does
	* not, this method returns false without creating any file.
	*
	* Fallback guard: if the global constant DEDALO_QUALITY_THUMB is not yet
	* defined in config (e.g. running from an older installation), a local
	* define with value 'thumb' is emitted so the rest of the method can proceed.
	*
	* OSX / Apache note (kept from original): Brew ImageMagick may not find
	* Ghostscript through Apache's restricted PATH. Fix by editing
	* ImageMagick's delegates.xml and replacing "&quot;gs&quot;" with the
	* absolute path "/usr/local/bin/gs".
	* @return bool - true when the thumb was generated successfully
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

		// thumb not exists case: generate from posterframe
			$posterframe = $this->get_posterframe_filepath();
			if (!file_exists($posterframe)) {
				debug_log(__METHOD__
					." posterframe file doesn't exists, it is not possible to create a thumb"
					, logger::WARNING
				);
				return false;
			}

		// thumb generate
			ImageMagick::dd_thumb(
				$posterframe, // source file
				$target_file // thumb file
			);


		return true;
	}//end create_thumb



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* Soft-deletes all (or a specified subset of) quality variants of the 3D media
	* files by renaming and moving them into a per-quality 'deleted' subfolder.
	* Optionally also soft-deletes the associated posterframe JPEG.
	*
	* Called automatically by section::remove_section_media_files() when a section
	* containing 3D components is deleted. Direct callers (e.g. the API action for
	* deleting an individual quality) should pass $remove_posterframe=false to
	* preserve the preview image while removing only one quality variant.
	*
	* The posterframe is moved to:
	*   DEDALO_MEDIA_PATH/<folder>/posterframe/<additional_path>/deleted/
	*   renamed to: <id>_deleted_<YYYY-MM-DD_HHmm>.<DEDALO_AV_POSTERFRAME_EXTENSION>
	*
	* Returns false on any filesystem error (directory creation or rename failure),
	* propagating failure up to callers that manage broader deletion sequences.
	*
	* @see section::remove_section_media_files
	* @param array $ar_quality = [] - quality levels to remove; empty array removes all
	* @param string|null $extension = null - when set, removes only the file with this
	*   extension within the given quality; otherwise all extensions are removed
	* @param bool $remove_posterframe = true - also soft-delete the posterframe JPEG
	* @return bool - true when all requested files were moved successfully
	*/
	public function remove_component_media_files( array $ar_quality=[], ?string $extension=null, bool $remove_posterframe=true ) : bool {

		// files remove
			$result = parent::remove_component_media_files($ar_quality);

		// posterframe remove (default is true)
			if ($remove_posterframe===true) {

				$media_path = $this->get_posterframe_filepath();
				if (file_exists($media_path)) {

					$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
					$additional_path	= $this->additional_path;

					// delete dir check/creation
						$folder_path_del = DEDALO_MEDIA_PATH . $folder . '/posterframe' . $additional_path . '/deleted';
						if(!create_directory($folder_path_del, 0750)) {
							return false;
						}

					// date now
						$date = date("Y-m-d_Hi");

					// move/rename file
						$id					= $this->get_id();
						$media_path_moved	= $folder_path_del . "/$id" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
						if( !rename($media_path, $media_path_moved) ) {
							debug_log(__METHOD__
								. " Error on move files (posterframe) to folder \"deleted\" . Permission denied . The files are not deleted " . PHP_EOL
								. ' source (media_path): '. $media_path . PHP_EOL
								. ' target (media_path_moved): '. $media_path_moved
								, logger::ERROR
							);
							return false;
						}

					debug_log(__METHOD__
						." Moved file \n$media_path to \n$media_path_moved "
						, logger::DEBUG
					);
				}
			}//end if ($remove_posterframe===true)


		return $result;
	}//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* Recovers the most-recently-deleted version of the 3D media files and their
	* posterframe from the 'deleted' subdirectory, reversing a prior call to
	* remove_component_media_files(). Called by tool_time_machine when rolling back
	* a section to a previous snapshot.
	*
	* The posterframe glob pattern is: <deleted_dir>/<id>_*.<jpg>
	* Files are sorted with natsort() (natural order) so that the last element
	* after end() is the most recently timestamped deletion.
	*
	* Logs a WARNING (and continues) rather than throwing when no deleted
	* posterframe file is found, because the 3D model files may be restorable
	* even if the posterframe was never created.
	*
	* (!) Always returns true regardless of partial posterframe restore failure,
	* leaving error diagnosis to the caller via debug logs.
	*
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool - always true (errors are logged, not propagated as exceptions)
	*/
	public function restore_component_media_files() : bool {

		// AV restore
			parent::restore_component_media_files();

		// Posterframe restore
			$posterframe_filepath	= $this->get_posterframe_filepath();
			$media_path			= pathinfo($posterframe_filepath,PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $media_path.'/'.$id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
			$ar_files			= glob($file_pattern);
			if (empty($ar_files)) {

				debug_log(__METHOD__
					." No files to restore were found for posterframe:$id. Nothing was restored (3)"
					, logger::WARNING
				);

			}else{

				natsort($ar_files);	# sort the files from newest to oldest
				$last_file_path = end($ar_files);
				$new_file_path 	= $this->get_posterframe_filepath();
				if( !rename($last_file_path, $new_file_path) ) {
					// throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");
					debug_log(__METHOD__
						." Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4) " .PHP_EOL
						.' last_file_path: ' . to_string($last_file_path) . PHP_EOL
						.' new_file_path: ' . to_string($new_file_path)
						, logger::ERROR
					);
				}

				debug_log(__METHOD__
					." Moved file \n$last_file_path to \n$new_file_path "
					, logger::DEBUG
				);
			}


		return true;
	}//end restore_component_media_files



	/**
	* PROCESS_UPLOADED_FILE
	* Entry point for post-upload processing of a newly received 3D file.
	* This is the final step in the upload pipeline:
	*   1. dd_utils_api::upload         — receives the HTTP multipart upload
	*   2. tool_upload::process_uploaded_file — validates, moves to temp path
	*   3. component_media_common::add_file  — renames to normalized media path
	*   4. component_3d::process_uploaded_file (this method) — runs conversion
	*
	* When the uploaded file targets the 'original' quality, this method records
	* upload metadata (original filename, normalized name, upload date) into the
	* component's stored data at index 0 before triggering regeneration.
	*
	* regenerate_component() drives format conversion: if the file is not already
	* GLB, it is kept as-is and the 'web' quality GLB is built on the next
	* regeneration pass using the registered converter tools (gltfpack, FBX2glTF,
	* COLLADA2GLTF).
	*
	* (!) TODO: direct GLB conversion from non-GLB inputs at upload time has not
	* been implemented yet. Non-GLB originals are stored but the 'web' GLB must
	* be generated via a separate regeneration call.
	*
	* @param object|null $file_data = null - upload metadata object with properties:
	*   - string $original_file_name  — user-provided filename, e.g. "my_model.glb"
	*   - string $full_file_name      — normalized name, e.g. "test175_test65_1.glb"
	*   - string $full_file_path      — absolute path to the saved file
	* @param object|null $process_options = null - reserved for future pipeline flags
	* @return object $response - stdClass with bool $result and string $msg
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
			$original_file_name			= $file_data->original_file_name;	// like "my file85.glb"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/3d/web/test175_test65_1.glb"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.glb"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " Processing file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

			// upload info
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

			// Generate default_3d_format : If uploaded file is not in Dedalo standard format (glb), is saved and not processed.
			// original file with standard format (like myfilename.glb) will copied to default quality
			// regenerate component will create the default quality 3d calling build()
			// build() will check the normalized files of the original
			// then if the normalized files doesn't exist, will create it
			// then will create the JPG format of the default
			// then save the data.
				$result = $this->regenerate_component();
				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
				}

			// response OK
				$response->result	= true;
				$response->msg		= 'OK. successful request';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__
				." $msg "
				, logger::ERROR
			);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* DELETE_FILE
	* Soft-deletes a single quality variant of the 3D media file for this component
	* by moving it to the 'deleted' folder (via remove_component_media_files).
	* The component data is persisted after deletion via Save() so that the
	* file-info list reflected in the JSON API remains accurate.
	* Also records the deletion event in the activity log (logger::$obj['activity']).
	*
	* The posterframe is deliberately NOT removed here ($remove_posterframe=false),
	* because deleting one quality variant should not invalidate the preview image.
	*
	* @see component_3d::remove_component_media_files
	* @param string $quality - quality level to delete, e.g. '1.5MB'
	* @param string|null $extension = null - when set, removes only the file with
	*   this extension; otherwise all files in the given quality are removed
	* @return object $response - stdClass with bool $result, string $msg, array $errors
	*/
	public function delete_file( string $quality, ?string $extension=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check quality
			$ar_quality = $this->get_ar_quality();
			if (!in_array($quality, $ar_quality)) {
				$response->msg .= ' Invalid quality. Ignored action';
				$response->errors[] = 'invalid quality';
				return $response;
			}

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files(
			[$quality], // array quality
			$extension, // file extension
			false // bool remove_posterframe
		);
		if ($result===true) {

			// logger activity
				logger::$obj['activity']->log_message(
					'DELETE FILE',
					logger::INFO,
					$this->tipo,
					NULL,
					[
						'msg'		=> 'Deleted media file (file is renamed and moved to delete folder)',
						'tipo'		=> $this->tipo,
						'parent'	=> $this->section_id,
						'id'		=> $this->id,
						'quality'	=> $quality
					],
					logged_user_id() // int
				);

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}

		return $response;
	}//end delete_file



	/**
	* GET_MEDIA_ATTRIBUTES
	* Intended to read the given file and extract technical metadata (dimensions,
	* triangle count, format details, etc.) using an external tool equivalent to
	* ffmpeg for video. Returns null unconditionally.
	*
	* (!) NOT YET IMPLEMENTED for 3D assets. The commented-out body shows the
	* intended call to ffmpeg::get_media_attributes(), which is not applicable
	* to 3D formats. A dedicated 3D analysis tool (e.g. gltf-transform inspect)
	* would be needed.
	*
	* @param string $file_path - absolute path to the 3D file to inspect
	* @return object|null - always null (not implemented)
	*/
	public function get_media_attributes(string $file_path) : ?object {

		debug_log(__METHOD__
			. " Sorry. This method is not implemented yet " . PHP_EOL
			, logger::ERROR
		);

		// $media_attributes = ffmpeg::get_media_attributes($file_path);

		// return $media_attributes;
		return null;
	}//end get_media_attributes



	/**
	* UPDATE_DATA_VERSION
	* Static migration hook called by the data-version upgrade runner when the
	* stored data format needs to be transformed to match a new schema version.
	* Receives an $options object describing the target version and the affected
	* record coordinates.
	*
	* For component_3d, no data-version migrations have been defined yet, so this
	* method always falls through to the default switch case and returns result=0,
	* signalling to the runner that this component has nothing to do for the given
	* version.
	*
	* Return code contract:
	*   0 — component has no migration for this version (skip)
	*   1 — migration was applied successfully
	*   2 — migration was attempted but data was already at the target shape
	*
	* @param object $options - migration context:
	*   - array  $update_version  — version segments, e.g. ['7','0','1']
	*   - mixed  $data_unchanged  — raw pre-migration datum for comparison
	*   - mixed  $reference_id    — ID of the record being migrated
	*   - string $tipo            — ontology tipo of the component
	*   - mixed  $section_id      — section record identifier
	*   - string $section_tipo    — ontology tipo of the parent section
	*   - string $context         — caller context tag, default 'update_component_data'
	* @return object $response - stdClass with int $result (0/1/2) and string $msg
	*/
	public static function update_data_version(object $options) : object {

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



}//end class component_3d
