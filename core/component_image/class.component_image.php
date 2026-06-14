<?php declare(strict_types=1);
/**
* CLASS COMPONENT_IMAGE
* Manages raster image media components in Dédalo.
*
* Provides the full lifecycle of a raster image attached to a section record:
* - Upload and storage of original and retouched master files
* - Conversion to derived quality variants (e.g., '6MB', '1.5MB', '<1MB', 'thumb')
*   using ImageMagick via the ImageMagick helper class
* - Generation of alternative format files (e.g., webp, avif) per DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS
* - Automatic SVG wrapper file creation/maintenance that embeds the default-quality image,
*   used by the editor overlay and annotation tools
* - Rotation and crop operations that mutate the stored file in place
* - Pixel-to-centimetre dimension conversion for print-sizing metadata
* - External-source support: when a component references an off-server image,
*   $external_source holds the path and most file operations are skipped
*
* Quality tiers (from DEDALO_IMAGE_AR_QUALITY, highest to lowest):
*   'original'   – master upload, lossless, never resized
*   'modified'   – retouched/corrected master, lossless, never resized
*   '100MB'/'25MB'/'6MB'/'1.5MB'/'<1MB' – derived JPEG derivatives at progressively lower resolution
*   'thumb'      – fixed-dimension preview (DEDALO_IMAGE_THUMB_WIDTH × DEDALO_IMAGE_THUMB_HEIGHT)
*
* Upload pipeline:
*   dd_utils_api::upload → tool_upload::process_uploaded_file
*   → component_media_common::add_file → component_image::process_uploaded_file
*
* Extends component_media_common (abstract media base) and implements
* component_media_interface (enforced media contract shared by image, av, pdf, svg, 3d).
*
* @package Dédalo
* @subpackage Core
*/
class component_image extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/
		/**
		 * Public URL to the image file used by legacy display helpers.
		 * Populated externally by rendering code, not internally by the class.
		 * Null when no image URL has been assigned to this instance.
		 * @var ?string $image_url
		 */
		public ?string $image_url = null;

		/**
		 * Filesystem path (or URL) of an image hosted outside Dédalo's media store.
		 * When non-null, most file-system operations (dimension reads, path building)
		 * fall back to this value instead of deriving a local path. Set during
		 * __construct via get_external_source(); inherited from component_media_common
		 * where the same property exists as ?string.
		 * @var ?string $external_source
		 */
		public ?string $external_source = null;

		/**
		 * Default preview width in pixels for the section edit UI.
		 * Controls the CSS width hint sent to the client; not the physical image dimension.
		 * @var int $width
		 */
		public int $width = 539;

		/**
		 * Default preview height in pixels for the section edit UI.
		 * Controls the CSS height hint sent to the client; not the physical image dimension.
		 * @var int $height
		 */
		public int $height = 404;



	/**
	* __CONSTRUCT
	* Initialises the image component by delegating to the parent media constructor
	* and then resolving any external-source reference for this record.
	*
	* Parent handles: quality, id, initial_media_path, additional_path.
	* This class adds: $external_source, resolved from ontology properties.
	*
	* @param string $tipo - Component ontology type identifier (e.g., 'dd522')
	* @param mixed $section_id - Record identifier within the section
	* @param string $mode = 'list' - UI mode ('list', 'edit', 'tm', …)
	* @param string $lang = DEDALO_DATA_NOLAN - Language code; images are non-translatable so this is always NOLAN
	* @param ?string $section_tipo = null - Parent section type identifier
	* @param bool $cache = true - Whether to use the instance cache
	*/
	protected function __construct( string $tipo, mixed $section_id, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// common constructor. Creates the component as normally do with parent class
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);

		// fix component main properties
			if (!empty($this->section_id)) {

				// additional_path : set and fix current additional image path
				$this->external_source = $this->get_external_source();
			}
	}//end __construct



	/**
	* SAVE
	* Persists the component data to the database, with image-specific pre-processing.
	*
	* Before delegating to the parent save(), iterates the current data array and writes
	* any pending SVG overlay files to disk when a data item carries an 'svg_file_data' key.
	* This allows the client to embed a new SVG string in the save payload without a
	* separate API round-trip.
	*
	* Side effect: calls create_svg_file() for each data item that contains svg_file_data,
	* which writes or overwrites the .svg file on disk at the path returned by get_svg_file_path().
	*
	* @return bool - True on successful save, false on failure
	*/
	public function save() : bool {

		$data = $this->get_data();

		// create_svg_file from data item temporal container
		if (!empty($data)) {
			foreach ($data as $data_item) {
				if(isset($data_item->svg_file_data)) {
					$this->create_svg_file($data_item->svg_file_data);
				}
			}
		}
		$this->set_data($data);

		return parent::save();
	}//end save



	/**
	* GET_ID
	* Resolves and returns the unique file-system identifier for this image component.
	*
	* Resolution order (first non-empty value wins):
	*  1. Cached $this->id (already resolved earlier in the request).
	*  2. External source: the filename (without extension) extracted from $external_source
	*     when the image is hosted outside Dédalo's media store.
	*  3. Referenced name: when the ontology property 'image_id' is set, its value must be
	*     a component tipo (e.g., 'dd851'). The live value of that component in the current
	*     section/record is read and used as the id, allowing custom naming via a sibling
	*     input field.
	*  4. Default identifier: component_media_common::get_identifier(), which builds the id
	*     from the locator triplet ({tipo}_{section_tipo}_{section_id}).
	*
	* An empty section_id is a hard error (returns null and logs WARNING) because the
	* identifier cannot be composed without a record context.
	*
	* @return ?string $id - Unique image identifier, or null when the component has no valid context
	*/
	public function get_id() : ?string {

		// already set
			if(isset($this->id) && !empty($this->id)) {
				return $this->id;
			}

		// case 1 external source
			$external_source = $this->get_external_source();
			$id = !empty($external_source)
				? pathinfo($external_source)['filename']
				: null;
			if(!empty($id)){
				$this->id = $id;
				return $id;
			}

		// case 2 referenced name : If is set properties "image_id", overwrite name with field ddx content
			$properties = $this->get_properties();
			if(isset($properties->image_id)){
				$component_tipo	= $properties->image_id;
				$model			= ontology_node::get_model_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model,
					$component_tipo,
					$this->section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$this->section_tipo,
					false
				);
				$value	= trim($component->get_value() ?? '');
				$id		= (!empty($value) && strlen($value)>0)
					? $value
					: null;
				if(!empty($id)){
					$this->id = $id;
					return $id;
				}
			}

		// fallback default
			if (empty($id)) {

				if (empty($this->section_id)) {
					debug_log(__METHOD__
						." Error. Invalid instance with empty section_id " .PHP_EOL
						.' tipo: ' . $this->tipo .PHP_EOL
						.' section_tipo: ' . $this->section_tipo .PHP_EOL
						.' model: ' . $this->model .PHP_EOL
						, logger::WARNING
					);
					$id = null;
				}else{
					$id = $this->get_identifier();
				}
			}

		// fix value
			$this->id = $id;


		return $id;
	}//end get_id



	/**
	* GET_AR_QUALITY
	* Returns the ordered list of image quality identifiers defined in the installation config.
	*
	* Quality names are read from DEDALO_IMAGE_AR_QUALITY, defined in config.php.
	* The canonical default order is: ['original', 'modified', '100MB', '25MB', '6MB', '1.5MB', 'thumb'].
	* Callers that iterate this list to build derivatives should process from highest to lowest
	* to avoid using a low-resolution file as a source.
	*
	* @return array - Ordered array of quality identifier strings
	*/
	public function get_ar_quality() : array {

		$ar_image_quality = DEDALO_IMAGE_AR_QUALITY;

		return $ar_image_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* Returns the quality identifier used as the working/display version for editors.
	*
	* The default quality is the primary derivative that the UI displays and that tools
	* (crop, rotate, regenerate) operate on. Defined by DEDALO_IMAGE_QUALITY_DEFAULT
	* in config.php; the canonical value is '1.5MB'.
	* The SVG overlay file always references this quality's JPEG.
	*
	* @return string - Quality identifier string (e.g., '1.5MB')
	*/
	public function get_default_quality() : string {

		$default_quality = DEDALO_IMAGE_QUALITY_DEFAULT;

		return $default_quality;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* Returns the quality identifier for the original (unmodified) master upload.
	*
	* The 'original' quality stores the first file uploaded by a user, preserved
	* losslessly. It is never resized or down-sampled. Defined by
	* DEDALO_IMAGE_QUALITY_ORIGINAL in config.php; the canonical value is 'original'.
	*
	* @return string - Quality identifier string (e.g., 'original')
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_MODIFIED_QUALITY
	* Returns the quality identifier for the retouched/corrected master file.
	*
	* The 'modified' (retouched) quality holds a post-processed master — for example,
	* a colour-corrected or cropped version delivered by a photographer. Like 'original',
	* it is stored losslessly and is never resized. When present, it takes precedence over
	* 'original' as the source for building lower-quality derivatives (see get_image_source()).
	* Defined by DEDALO_IMAGE_QUALITY_RETOUCHED in config.php; the canonical value is 'modified'.
	*
	* @return string - Quality identifier string (e.g., 'modified')
	*/
	public function get_modified_quality() : string {

		$modified_quality = DEDALO_IMAGE_QUALITY_RETOUCHED;

		return $modified_quality;
	}//end get_modified_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* Returns the subset of quality identifiers that hold 'normalized' image files.
	*
	* Normalized files are the canonical stored versions at each master level: the JPEG
	* derived from the original upload (even if the source was a TIFF or PSD), the
	* JPEG derived from the retouched master, and the working default-quality JPEG.
	* check_normalized_files() uses this list to know which tiers need regeneration.
	*
	* @return array - Array of three quality identifiers [original, modified, default]
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$original_quality	= $this->get_original_quality();
		$modified_quality	= $this->get_modified_quality();
		$default_quality	= $this->get_default_quality();

		$normalized_ar_quality = [$original_quality, $modified_quality, $default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_EXTENSION
	* Returns the file extension used for all derived image files (default quality, thumb, etc.).
	*
	* Uses the instance-level $extension when it has been explicitly set (e.g., overridden
	* for a specific quality), otherwise falls back to DEDALO_IMAGE_EXTENSION from config.php
	* (canonical value: 'jpg'). Master files may have different extensions (tiff, psd) —
	* those are tracked separately via get_original_extension().
	*
	* @return string - Lowercase file extension without leading dot (e.g., 'jpg')
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_IMAGE_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* Returns the set of file extensions accepted during upload validation.
	*
	* Read from DEDALO_IMAGE_EXTENSIONS_SUPPORTED (config.php). The canonical default is:
	* ['jpg','jpeg','png','tif','tiff','bmp','psd','raw','webp','heic','avif'].
	* Files not in this list are rejected by component_media_common::valid_file_extension()
	* before any disk write occurs.
	*
	* @return array - Lowercase extension strings without leading dots
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_IMAGE_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* Returns the root media sub-directory name for image files.
	*
	* Uses the instance-level $folder when explicitly set, otherwise falls back to
	* DEDALO_IMAGE_FOLDER (config.php canonical value: '/image'). This is the first
	* path segment appended to DEDALO_MEDIA_PATH when building any image file path.
	*
	* @return string - Directory path segment (e.g., '/image')
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_IMAGE_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Returns the ordered list of preferred high-fidelity source extensions for master files.
	*
	* When multiple uploaded files exist for the same image (e.g., both a TIFF and a JPEG),
	* this precedence list determines which is used as the conversion source. The first item
	* is the most preferred. Defined by DEDALO_IMAGE_BEST_EXTENSIONS in config.php; if the
	* constant is not defined (e.g., in minimal installations), it is initialised here to
	* the fallback value ['tif','tiff','psd'].
	*
	* (!) The in-place define() means that once this method is called in a request, the
	* fallback value is locked for the lifetime of that PHP process.
	*
	* @return array - Extension strings in descending preference order (e.g., ['tif','tiff','psd'])
	*/
	public function get_best_extensions() : array {

		if(!defined('DEDALO_IMAGE_BEST_EXTENSIONS')){
			define('DEDALO_IMAGE_BEST_EXTENSIONS', ['tif','tiff','psd']);
		}

		return DEDALO_IMAGE_BEST_EXTENSIONS;
	}//end get_best_extensions



	/**
	* GET_MODIFIED_UPLOADED_FILE
	* Returns the filesystem path of the uploaded retouched master file, if one exists.
	*
	* Reads the 'modified_normalized_name' field from data[0], which is set during
	* the upload pipeline when a file is uploaded to the 'modified' quality tier.
	* The returned path points into the modified-quality media directory and includes
	* the stored normalized filename (the upload's basename after Dédalo normalisation).
	*
	* Returns null when no modified file has been uploaded for this record.
	*
	* @return ?string - Absolute filesystem path to the modified uploaded file, or null
	*/
	public function get_modified_uploaded_file() : ?string {

		$modified_uploaded_file = null;

		$data = $this->get_data();
		if (isset($data[0]) && isset($data[0]->modified_normalized_name)) {

			$modified_quality	= $this->get_modified_quality();

			// original file like 'memoria_oral_presentacion.mov'
			$modified_uploaded_file	= $this->get_media_path_dir($modified_quality) .'/'. $data[0]->modified_normalized_name;
		}

		return $modified_uploaded_file;
	}//end get_modified_uploaded_file



	/**
	* GET_TARGET_FILENAME
	* Returns the filename (basename with extension) that an uploaded file will be stored as.
	*
	* For external-source images the target filename is taken directly from the external
	* source path (preserving the original basename). For locally stored images it is
	* constructed from the component id and the configured default extension (e.g., 'dd522_dd128_1.jpg').
	* Used by the upload pipeline to name the file on disk.
	*
	* @return string - Target filename string (e.g., 'dd522_dd128_1.jpg')
	*/
	public function get_target_filename() : string {

		if($this->external_source) {

			$external_parts		= pathinfo($this->external_source);
			$target_filename	= $external_parts['basename'];

		}else{

			$target_filename = $this->id .'.'. $this->get_extension();
		}


		return $target_filename;
	}//end get_target_filename




	/**
	* CREATE_THUMB
	* Generates the thumbnail derivative from the default-quality image file.
	*
	* Reads DEDALO_QUALITY_THUMB (config.php; canonical value 'thumb') and initialises
	* it with a local fallback if the constant is not defined, logging a WARNING so the
	* omission is visible in the log.
	* Requires the default-quality JPEG to already exist on disk; returns false immediately
	* when it does not (no source → no thumb).
	* The thumb dimensions are fixed by DEDALO_IMAGE_THUMB_WIDTH × DEDALO_IMAGE_THUMB_HEIGHT
	* (config.php defaults: 222 × 148 px), applied by ImageMagick::dd_thumb().
	*
	* (!) The @return annotation in the original signature says "object|null $result / URL path"
	* but the actual declared return type is bool. The prose description is stale — do not rely
	* on it for callers. This is flagged here but must not be changed (doc-only rule).
	*
	* @return bool - True when the thumb was created successfully, false on missing source or error
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

		// quality default
			$quality_default	= $this->get_default_quality();
			$default_image_path	= $this->get_media_filepath($quality_default);

		// check default quality image
			if (!file_exists($default_image_path)) {
				debug_log(__METHOD__
					." Default image quality file does not exists. Skip to create thumb. "
					.' id: ' . $this->get_id()
					, logger::WARNING
				);
				return false;
			}

		// old thumb rename
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$image_thumb_path	= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// thumb generate
			ImageMagick::dd_thumb(
				$default_image_path, // source file
				$image_thumb_path // thumb file
			);


		return true;
	}//end create_thumb




	/**
	* GET_IMAGE_PRINT_DIMENSIONS
	* Returns the physical print dimensions of the image at the given quality, in centimetres.
	*
	* Delegates to pixel_to_centimeters() using the DPI value from DEDALO_IMAGE_PRINT_DPI
	* (config.php canonical default: 150 dpi). The result is suitable for display in
	* image-info panels or export metadata.
	*
	* @param string $quality - Quality identifier whose file is used to read pixel dimensions
	* @return array - Two-element array [width_cm, height_cm] formatted as locale strings (e.g., ['15,50cm', '10,35cm'])
	*/
	public function get_image_print_dimensions(string $quality) : array {

		$ar_info = $this->pixel_to_centimeters(
			$quality,
			DEDALO_IMAGE_PRINT_DPI // int dpi
		);

		return $ar_info;
	}//end get_image_print_dimensions



	/**
	* CONVERT_QUALITY_TO_MEGABYTES
	* Parses a quality identifier string into a numeric megabyte value for arithmetic comparisons.
	*
	* Quality names encode a file-size target using a simple DSL:
	*  - '1.5MB'   → 1.5    (exact MB value)
	*  - '>100MB'  → 101    (exclusive upper bound: parsed int + 1)
	*  - '<1MB'    → 0.9    (exclusive lower bound: parsed float - 0.1)
	*
	* The suffix 'MB' (last two characters) is stripped before parsing. The leading
	* '>' / '<' prefix, if present, determines the boundary rule. This float is then
	* consumed by get_target_pixels_to_quality_conversion() to calculate target pixel
	* dimensions that will produce a file approximately equal to the target size.
	*
	* (!) The '#' comment delimiter is used on line ~434 instead of '//' — this is
	* PHP-valid but inconsistent with the codebase style. Flagged, not changed.
	*
	* @param string $quality - Quality identifier string (e.g., '1.5MB', '>100MB', '<1MB')
	* @return float - Numeric megabyte value derived from the quality string
	*/
	public static function convert_quality_to_megabytes(string $quality) : float {

		// quality sample : '1MB'|'1.5MB'|<1MB|>100MB

		// We removed the megabytes ('MB') text in the quality name
		$string = substr($quality, 0,-2);

		switch (true) {

			case ( strpos($string, '>')===0 ):
				// Sample: >100 will be 100
				$number = intval(substr($string,1)) + 1;
				break;

			case ( strpos($string, '<')===0 ):
				# Sample: <1 will be 1
				$number = floatval( substr($string,1) - 0.1 );
				break;

			default:
				// Default 1.5 will be 1.5
				$number = $string;
				break;
		}

		// Float value
		$number = floatval($number);


		return $number;
	}//end convert_quality_to_megabytes




	/**
	* IMAGE_VALUE_IN_TIME_MACHINE
	* (Dead/commented-out code — preserved per policy. Original intent was to rewrite the
	* image src URL in a stored HTML value to point to the deleted-files directory, enabling
	* the time-machine viewer to display images that have since been removed from live storage.)
	* @param string $image_value - HTML string containing an img src attribute referencing the image
	* @return (void — no declared return type; method body is commented out)
	*/
		// public static function image_value_in_time_machine( $image_value ) {

		// 	# Example of url: /dedalo4/media_test/media_development/image/thumb/rsc29_rsc170_33.jpg

		// 	preg_match("/src=\"(.+)\"/", $image_value, $output_array);
		// 	if(!isset($output_array[1])) return $image_value;
		// 	$image_url = $output_array[1];

		// 	$id = pathinfo($image_url,PATHINFO_FILENAME);
		// 		#dump($name, ' name ++ '.to_string());

		// 	$image_deleted = self::get_deleted_image( $quality=DEDALO_QUALITY_THUMB, $id );
		// 		#dump($image_deleted, ' image_deleted ++ '.to_string());

		// 	$ar_parts 		 = explode(DEDALO_MEDIA_PATH, $image_deleted);
		// 	if(!isset($ar_parts[1])) return $image_value;
		// 	$final_image_url = DEDALO_MEDIA_URL .$ar_parts[1];
		// 		#dump($final_image_url, ' final_image_url ++ '.to_string());

		// 	$final_image_value = str_replace($image_url, $final_image_url, $image_value);
		// 		#dump($final_image_value, ' final_image_value ++ '.to_string());

		// 	return (string)$final_image_value;
		// }//end image_value_in_time_machine



	/**
	* GET_DELETED_IMAGE
	* Locates the most recent soft-deleted file for this image at the given quality.
	*
	* When a file is deleted in Dédalo it is moved to a 'deleted/' sub-directory under
	* the quality path rather than being unlinked immediately. Deleted files are renamed
	* with a timestamp/counter suffix (pattern: {id}_*.{ext}). This method globs that
	* directory for matching files and returns the last one in natural sort order
	* (i.e., the most recently archived copy).
	*
	* Returns null when no deleted file is found, logging at DEBUG level.
	* Used by the time-machine feature to render historical image states.
	*
	* @param string $quality - Quality tier to search in (e.g., 'original', '1.5MB')
	* @return ?string - Absolute filesystem path to the most recent deleted file, or null
	*/
	public function get_deleted_image(string $quality) : ?string {

		// media_path
			$media_path			= $this->get_media_filepath($quality);
			$folder_path_del	= pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $folder_path_del .'/'. $id .'_*.'. $this->get_extension();
			$ar_files			= glob($file_pattern);

		// no files found case
			if (empty($ar_files)) {
				debug_log(__METHOD__
					." No files were found for id: $id in quality: $quality"
					, logger::DEBUG
				);
				return null;
			}

		// select last file
			natsort($ar_files);	// sort the files from newest to oldest
			$last_file_path = end($ar_files);


		return $last_file_path;
	}//end get_deleted_image



	/**
	* GET_ALTERNATIVE_EXTENSIONS
	* Returns the set of additional format extensions to generate alongside the primary JPEG.
	*
	* Alternative versions (e.g., 'webp', 'avif') are created by create_alternative_version()
	* at conversion time. The list is read from DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS (config.php);
	* an installation with no alternative formats defines this as an empty array [].
	* Returns null when the constant is not defined at all (minimal/legacy installation).
	*
	* Callers must guard against null (e.g., `$this->get_alternative_extensions() ?? []`).
	*
	* @return ?array - Extension strings without dots (e.g., ['webp','avif']), or null if not configured
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = defined('DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS')
			? DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS
			: null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* PROCESS_UPLOADED_FILE
	* Image-specific post-upload handler; the last step in the upload pipeline.
	*
	* Upload pipeline call order:
	*  1. dd_utils_api::upload          — receives the raw multipart upload
	*  2. tool_upload::process_uploaded_file — moves to media dir, sets $this->quality
	*  3. component_media_common::add_file  — validates extension, calls this method
	*  4. component_image::process_uploaded_file (this method)
	*
	* Responsibilities:
	* - Records upload metadata (original filename, normalised name, upload date) in data[0]
	*   for the appropriate quality tier (original or modified).
	* - Optionally persists the human-readable original filename to a sibling component
	*   if the ontology property 'target_filename' names a companion tipo (e.g., component_input_text).
	* - Calls regenerate_component() which: converts all quality derivatives, creates/refreshes
	*   the SVG overlay file, and saves the component data.
	* - Invokes a site-specific post-processing script (POSTPROCESSING_IMAGE_SCRIPT) if defined,
	*   with a 1-second sleep before execution to allow filesystem flush. The sleep is intentional
	*   and should not be removed without verifying the post-processing script tolerates immediate calls.
	*
	* @param ?object $file_data = null - Upload result object:
	*   - original_file_name  : string  Human-readable name the user uploaded (e.g., 'my photo785.jpg')
	*   - full_file_name      : string  Normalised on-disk filename (e.g., 'rsc29_rsc170_1.jpg')
	*   - full_file_path      : string  Absolute path where the file was stored (e.g., '/mypath/media/image/1.5MB/0/rsc29_rsc170_1.jpg')
	* @param ?object $process_options = null - Reserved for future use; currently unused
	* @return object $response - stdClass with result (bool) and msg (string) fields
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// empty case
			if (empty($file_data)) {
				$response->msg .= 'Empty file data';
				return $response;
			}

		// short vars
			$original_file_name			= $file_data->original_file_name; // kike "my photo785.jpg"
			$full_file_path				= $file_data->full_file_path; // like "/mypath/media/image/1.5MB/test175_test65_1.jpg"
			$full_file_name				= $file_data->full_file_name; // like "test175_test65_1.jpg"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// upload info. Update data information about original or modified quality
		// Data will save in regenerate() avoid save twice;
			// set the data key to 0
			// image components store all metadata in a single data item at index 0
				$key = 0;

			// update upload file info
				$data = $this->get_data();
				if (!isset($data[$key]) || !is_object($data[$key])) {
					$data[$key] = new stdClass();
				}

			if ($this->quality===$this->get_original_quality()) {
				$data[$key]->original_file_name			= $original_file_name;
				$data[$key]->original_normalized_name	= $original_normalized_name;
				$data[$key]->original_upload_date		= component_date::get_date_now();

				$this->set_data($data);

			}else if ($this->quality===$this->get_modified_quality()) {
				$data[$key]->modified_file_name			= $original_file_name;
				$data[$key]->modified_normalized_name	= $original_normalized_name;
				$data[$key]->modified_upload_date		= component_date::get_date_now();

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

			// target_filename. Save original file name in a component_input_text if defined.
			// Allows a record to store the human-readable upload name in a visible field.
			// $properties->target_filename is expected to be a tipo as 'test100'
				$properties = $this->get_properties();
				if (isset($properties->target_filename) && safe_tipo($properties->target_filename)) {
					// get target component
					$current_section_id			= $this->get_section_id();
					$target_section_tipo		= $this->get_section_tipo();
					$targe_filename_tipo		= safe_tipo($properties->target_filename);
					$model_name_target_filename	= ontology_node::get_model_by_tipo($targe_filename_tipo, true);
					$component_target_filename	= component_common::get_instance(
						$model_name_target_filename,
						$targe_filename_tipo,
						$current_section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$target_section_tipo,
						false
					);
					$file_name_data = [(object)[
						'value' => $original_file_name,
						'lang' => DEDALO_DATA_NOLAN
					]];
					$component_target_filename->set_data( $file_name_data );
					$component_target_filename->save();
				}

			// Generate default_image_format.
			// If the uploaded file is not in the Dédalo standard format (jpg) it is converted;
			// the original file is always preserved alongside the converted copy
			// (e.g., both 'myfilename.tiff' and 'myfilename.jpg' coexist on disk).
			// regenerate_component() orchestrates the full rebuild sequence:
			//  - check_normalized_files() creates missing normalized JPEGs for original/modified tiers
			//  - all quality derivatives are rebuilt via convert_quality()
			//  - the SVG overlay file is created/refreshed
			//  - component data is saved
				$result = $this->regenerate_component();
				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
				}

			// custom_postprocessing_image. postprocessing_image_script
			// (!) The sleep(1) is intentional: it gives the filesystem a moment to flush
			// all written files before the external script reads them. Do not remove it
			// without verifying the post-processing script is safe to call immediately.
				if (defined('POSTPROCESSING_IMAGE_SCRIPT')) {
					sleep(1);
					require( POSTPROCESSING_IMAGE_SCRIPT );
					custom_postprocessing_image($this);
				}

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

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
	* CREATE_DEFAULT_SVG_STRING_NODE
	* Builds an SVG XML string that wraps the default-quality JPEG as an embedded image node.
	*
	* The resulting SVG contains a single <g id="raster"> group with an <image> element whose
	* dimensions match the actual pixel size of the default-quality file. The xlink:href
	* points to the relative media URL of the JPEG, not a base64-encoded inline version.
	* This SVG is written to disk by create_svg_file() and used by the annotation/overlay editor
	* as the background layer reference.
	*
	* (!) Returns null — and logs an ERROR — when the default-quality JPEG does not yet exist
	* on disk. Callers must guard against null before calling create_svg_file().
	*
	* (!) The SVG uses the deprecated xlink:href attribute (SVG 1.1). This is intentional for
	* broad tool compatibility; do not change to href without verifying editor support.
	*
	* @return ?string - SVG XML string ready to write to disk, or null if the source image is missing
	*/
	public function create_default_svg_string_node() : ?string {

		// short vars
			$id				= $this->get_id();
			$source_quality	= $this->get_default_quality();

		// default quality check file
			$file_path = $this->get_media_filepath($source_quality);
			if (!file_exists($file_path)) {
				debug_log(__METHOD__
					." Unable to create create_default_svg_string_node. Default quality file does not exists:". PHP_EOL
					.' file_path: ' . $file_path,
					logger::ERROR
				);
				return null;
			}

		// string_node
			$image_url			= $this->get_media_url_dir($source_quality) .'/'. $id .'.'. $this->get_extension(); // relative path
			$image_dimensions	= $this->get_image_dimensions($file_path);
			$width				= $image_dimensions->width ?? null;
			$height				= $image_dimensions->height ?? null;

			$svg_string_node_pretty = '
				<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'.$width.'" height="'.$height.'" viewBox="0,0,'.$width.','.$height.'">
					 <g id="raster">
						 <image width="'.$width.'" height="'.$height.'" xlink:href="'.$image_url.'"/>
					 </g>
				</svg>
			';
			// strip leading tabs from each line so the written file is compact but still readable
			$svg_string_node = trim(preg_replace('/\t+/', '', $svg_string_node_pretty));


		return $svg_string_node;
	}//end create_default_svg_string_node



	/**
	* GET_SVG_FILE_PATH
	* Returns the absolute filesystem path where the SVG overlay file for this image is stored.
	*
	* The SVG is stored in a 'svg' quality sub-directory within the image media tree:
	*   DEDALO_MEDIA_PATH / {folder} / {initial_media_path} / svg / {additional_path} / {id}.svg
	* Example: /var/dedalo/media/image/my_project/svg/0/dd522_dd128_1.svg
	*
	* This path is used by create_svg_file(), get_base_svg_url(), and regenerate_component()
	* to check existence and write the SVG file.
	*
	* @return string - Absolute filesystem path to the .svg file
	*/
	public function get_svg_file_path() : string {

		$id					= $this->get_id();
		$additional_path	= $this->get_additional_path();
		$initial_media_path	= $this->get_initial_media_path();
		$folder				= $this->get_folder();

		// media_path
		$media_path = DEDALO_MEDIA_PATH . $folder . $initial_media_path . '/svg' . $additional_path;

		// file_path
		$file_path = $media_path . '/' . $id . '.svg';

		return $file_path;
	}//end get_svg_file_path



	/**
	* CREATE_SVG_FILE
	* Writes an SVG string to the overlay file for this image component.
	*
	* Creates the target directory (0750) if it does not already exist.
	* Overwrites any existing SVG file at the path returned by get_svg_file_path().
	* Logs an ERROR and returns false when file_put_contents() fails (e.g., permission
	* error or out-of-disk-space); returns false without logging when directory creation fails.
	*
	* @param string $svg_string_node - Well-formed SVG XML string to write (e.g., from create_default_svg_string_node())
	* @return bool - True on successful write, false on directory creation failure or file write failure
	*/
	public function create_svg_file(string $svg_string_node) : bool {

		// paths
			$file_path	= $this->get_svg_file_path();
			$path_parts	= pathinfo($file_path);
			$media_path	= $path_parts['dirname'];

		// check target folder exists or create it
			if(!create_directory($media_path, 0750)) {
				return false;
			}

		// write string_node to disk file
			if( !file_put_contents($file_path, $svg_string_node) ) {
				debug_log(__METHOD__
					." Failed to create file for default SVG file: " . PHP_EOL
					.' file_path: ' . $file_path
					, logger::ERROR
				);
				return false;
			}

		// debug
			debug_log(__METHOD__
				." Created svg file file_path: ".to_string($file_path)
				, logger::DEBUG
			);


		return true;
	}//end create_svg_file



	/**
	* GET_BASE_SVG_URL
	* Returns the URL to the SVG overlay file for this image component.
	*
	* By default returns the expected URL without checking whether the file actually exists
	* on disk. When $test_file is true, the corresponding filesystem path is checked:
	* - If the SVG exists, its URL is returned normally.
	* - If the SVG does not exist and $add_default is false, returns null (caller should
	*   handle missing SVG gracefully).
	* - If the SVG does not exist and $add_default is true, returns the URL of the generic
	*   placeholder SVG at DEDALO_CORE_URL/themes/default/0.svg.
	*
	* @param bool $test_file = false  - Whether to verify the file exists before returning the URL
	* @param bool $absolute = false   - When true, prepends DEDALO_PROTOCOL + DEDALO_HOST to make a full absolute URL
	* @param bool $add_default = false - When true and test_file fails, return the placeholder URL instead of null
	* @return ?string - SVG file URL, placeholder URL, or null when the file is missing and add_default is false
	*/
	public function get_base_svg_url(bool $test_file=false, bool $absolute=false, bool $add_default=false) : ?string {

		// short vars
			$id					= $this->get_id();
			$additional_path	= $this->get_additional_path();
			$initial_media_path	= $this->get_initial_media_path();
			$base_path			= DEDALO_IMAGE_FOLDER . $initial_media_path . '/svg' . $additional_path;

		// image_url. Default url
			$image_url = DEDALO_MEDIA_URL . $base_path . '/' . $id . '.svg';

		// test_file
			if($test_file===true) {

				$file = DEDALO_MEDIA_PATH . $base_path . '/' . $id . '.svg';
				if( !file_exists($file) ) {
					if ($add_default===false) {
						return null;
					}
					$image_url = DEDALO_CORE_URL . '/themes/default/0.svg';
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$image_url = DEDALO_PROTOCOL . DEDALO_HOST . $image_url;
			}


		return $image_url;
	}//end get_base_svg_url



	/**
	* GET_FILE_CONTENT
	* Returns a self-contained SVG string with the JPEG image data embedded as a base64 data-URI.
	*
	* Reads the stored SVG overlay file for this image and replaces the external xlink:href
	* JPEG URL with an inline base64-encoded data-URI, producing a portable SVG that does
	* not depend on external HTTP access. Used for PDF generation or offline export where
	* the image must be self-contained.
	*
	* Returns null when either the SVG file or the JPEG file cannot be read (logs WARNING).
	* The regex replacement targets the pattern 'xlink:href="…jpg"'; other image extensions
	* in the SVG are not substituted.
	*
	* @param string $quality = DEDALO_IMAGE_QUALITY_DEFAULT - Quality tier whose JPEG is embedded
	* @return ?string - SVG string with embedded base64 image data, or null on read failure
	*/
	public function get_file_content( string $quality=DEDALO_IMAGE_QUALITY_DEFAULT ) : ?string {

		// short vars
			$id					= $this->get_id();
			$additional_path	= $this->get_additional_path();
			$initial_media_path	= $this->get_initial_media_path();
			$additional_path	= $this->get_additional_path();

		// svg
			$svg_file_name	= $id .'.'. DEDALO_SVG_EXTENSION;
			$svg_file_path	= DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . $initial_media_path . '/' .DEDALO_SVG_EXTENSION . $additional_path . '/' . $svg_file_name;
			// svg data
			$svg_data		= file_get_contents($svg_file_path); // returns the read data or false on failure.
			if (empty($svg_data)) {
				debug_log(__METHOD__
					." Unable to read svg_file_path: ".to_string($svg_file_path)
					, logger::WARNING
				);
				return null;
			}

		// img
			$img_file_name	= $id .'.'. $this->get_extension();
			$img_file_path	= DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . $initial_media_path . '/' . $quality . $additional_path . '/' . $img_file_name;
			// img data
			$img_data		= file_get_contents($img_file_path); // returns the read data or false on failure.
			if (empty($img_data)) {
				debug_log(__METHOD__
					." Unable to read img_file_path: ".to_string($img_file_path)
					, logger::WARNING
				);
				return null;
			}
			// base64_encode image data
			$type	= pathinfo($img_file_path, PATHINFO_EXTENSION);
			$base64	= 'data:image/' . $type . ';base64,' . base64_encode($img_data);

		// file_content. Clean SVG code.
		// Replace the external JPEG href in the SVG with the base64 data-URI.
		// (!) Only matches .jpg extension; .png or other formats in the SVG are not substituted.
			$file_content = preg_replace('/xlink:href=".*?.jpg"/', 'xlink:href="'.$base64.'"', $svg_data);


		return $file_content;
	}//end get_file_content



	/**
	* UPDATE_DATA_VERSION
	* Data-migration hook called during system upgrades to transform stored component data
	* from one schema version to another.
	*
	* Result codes (shared convention across all media components):
	*  0 - This component has no migration logic for the requested version (ignored)
	*  1 - Migration was applied successfully
	*  2 - Migration was attempted but the data was already in the target shape (no-op)
	*
	* Currently component_image has no version-specific migrations and always returns 0.
	* The switch/default structure is kept for forward compatibility.
	*
	* @param object $options - Migration options:
	*   - update_version  : array   Version tuple (e.g., [7, 0, 3]) joined to '7.0.3' for switch comparison
	*   - data_unchanged  : mixed   Flag from the caller indicating unchanged data
	*   - reference_id    : mixed   Reference identifier for logging
	*   - tipo            : ?string Component tipo
	*   - section_id      : mixed   Section record id
	*   - section_tipo    : ?string Section tipo
	*   - context         : string  Caller context label (default: 'update_component_data')
	* @return object $response - stdClass with result (int) and msg (string) fields
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



	/**
	* ROTATE
	* Rotates the image file at the given quality tier in place using ImageMagick.
	*
	* The source and target file are the same path (overwrites the existing file).
	* Two rotation modes are supported:
	*  - 'default'  : rotates within the original canvas bounding box (may clip corners)
	*  - 'expanded' : expands the canvas to fit the rotated image (adds background fill)
	*
	* Alpha channel handling: JPG files do not support transparency, so $alpha is forced
	* to false when the extension is 'jpg' regardless of what the caller passes.
	*
	* After rotating the source-quality file the caller is responsible for rebuilding
	* any derived quality files (e.g., via build_version()) if they also need updating.
	*
	* @param object $options - Rotation configuration:
	*   - quality          : ?string  Quality tier whose file is rotated (e.g., 'original', '1.5MB')
	*   - extension        : ?string  File extension override (e.g., 'jpg', 'png'); uses default if null
	*   - degrees          : int|float Rotation angle; positive = clockwise, negative = counter-clockwise
	*   - rotation_mode    : string   'default' (in-place canvas) or 'expanded' (canvas grows); defaults to 'default'
	*   - background_color : ?string  Fill colour for exposed corners in 'expanded' mode (e.g., '#ffffff')
	*   - alpha            : bool     Preserve alpha channel; automatically false for jpg extension
	* @return ?string - Raw command output from ImageMagick::rotate(), or null on error
	*/
	public function rotate( object $options) : ?string {

		$quality			= $options->quality ?? null;
		$extension			= $options->extension ?? null;
		$degrees			= $options->degrees;
		$rotation_mode		= $options->rotation_mode ?? 'default'; // default || expanded
		$background_color	= $options->background_color ?? null;
		$alpha				= $options->alpha ?? false;

		// alpha channel cannot be preserved in JPEG format; force it off regardless of input
		$alpha =($alpha && $extension === 'jpg')
			? false
			: $alpha;


		// get the source file path
		$source = $this->get_media_filepath($quality, $extension);

		// fallback target to source (overwrite file)
		$target = $source;

		$rotation_options = new stdClass();
			$rotation_options->source			= $source;
			$rotation_options->target			= $target;
			$rotation_options->degrees			= $degrees;
			$rotation_options->rotation_mode	= $rotation_mode;
			$rotation_options->background_color	= $background_color;
			$rotation_options->alpha			= $alpha;

		$command_result = ImageMagick::rotate($rotation_options);

		return $command_result;
	}//end rotate



	/**
	* CROP
	* Crops the image file at the given quality tier in place using ImageMagick.
	*
	* The source and target file are the same path (overwrites the existing file).
	* Crop coordinates are in pixels and must be within the original image bounds;
	* ImageMagick clips silently if they exceed the canvas.
	*
	* After cropping the source-quality file the caller is responsible for rebuilding
	* any derived quality files (e.g., via build_version()) if they also need updating.
	*
	* @param object $options - Crop configuration:
	*   - quality   : ?string Quality tier whose file is cropped (e.g., 'original', 'modified')
	*   - extension : ?string File extension override; uses default if null
	*   - crop_area : object  Pixel-coordinate region:
	*       - x      : int|float  Left edge of crop box
	*       - y      : int|float  Top edge of crop box
	*       - width  : int|float  Width of crop box in pixels
	*       - height : int|float  Height of crop box in pixels
	* @return ?string - Raw command output from ImageMagick::crop(), or null on error
	*/
	public function crop( object $options) : ?string {

		$quality			= $options->quality ?? null;
		$extension			= $options->extension ?? null;
		$crop_area			= $options->crop_area;

		// get the source file path
		$source = $this->get_media_filepath($quality, $extension);

		// fallback target to source (overwrite file)
		$target = $source;

		$crop_options = new stdClass();
			$crop_options->source			= $source;
			$crop_options->target			= $target;
			$crop_options->crop_area		= $crop_area;

		$command_result = ImageMagick::crop($crop_options);

		return $command_result;
	}//end crop



	/**
	* CONVERT_QUALITY
	* Builds one quality-tier derivative file from a higher-quality source using ImageMagick.
	*
	* Sequence:
	*  1. Ensures normalized files exist for original and modified tiers (check_normalized_files()).
	*  2. Calculates target pixel dimensions based on the MB target encoded in $target_quality,
	*     using get_target_pixels_to_quality_conversion(). Resize is skipped for lossless tiers
	*     (original, modified) and thumb (which uses fixed dimensions).
	*  3. Never enlarges an image: if the computed target exceeds the source pixel count the
	*     source dimensions are used as-is.
	*  4. Converts via ImageMagick::convert(). For lossless tiers, quality=100 is forced.
	*  5. Creates any configured alternative-format files (e.g., webp, avif) at the same tier
	*     by calling create_alternative_version() for each entry in get_alternative_extensions().
	*
	* CLI progress data (common::$pdata) is emitted at key checkpoints when the method is called
	* from a CLI batch script (running_in_cli() === true), allowing progress bars.
	*
	* @param object $options - Conversion options:
	*   - source_quality : string  Quality tier of the source file (e.g., 'original', 'modified')
	*   - target_quality : string  Quality tier to produce (e.g., '1.5MB', 'thumb')
	* @return bool - True on successful conversion, false when directory creation fails
	*/
	public function convert_quality(object $options) : bool {

		// options
			$source_quality	= $options->source_quality;
			$target_quality	= $options->target_quality;

		// CLI process data
			if ( running_in_cli()===true ) {
				$start_time2=start_time();
				if (!isset(common::$pdata)) {
					common::$pdata = new stdClass();
				}
			}

		// source_quality files check and create it if they not are created before.
		// original_file check (normalized Dédalo original viewable). If not exist, create it
			$normalized_file = $this->get_media_filepath($source_quality); //  $this->get_original_file_path('original');

		// check the normalized files
			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->msg			= (label::get_label('processing') ?? 'Processing') . ' normalized files | id: ' . $this->section_id;
					common::$pdata->current_time= exec_time_unit($start_time2, 'ms');
					common::$pdata->total_ms	= (common::$pdata->total_ms ?? 0) + common::$pdata->current_time; // cumulative time
					// send to output
					print_cli(common::$pdata);
				}
			$this->check_normalized_files();

		// Image source
			$source_image			= $normalized_file;
			$image_dimensions		= $this->get_image_dimensions($normalized_file);
			$source_pixels_width	= $image_dimensions->width ?? null;
			$source_pixels_height	= $image_dimensions->height ?? null;

		// Image target
			$target_image = $this->get_media_filepath($target_quality);

		// Resize
		// Only size-capped qualities need a resize string. Master tiers (original, modified) are
		// stored full-size; thumb has its own fixed-dimension path in get_target_pixels_to_quality_conversion().
			$resize = null;
			if( $target_quality !== $this->get_original_quality() &&
				$target_quality !== $this->get_modified_quality() &&
				$target_quality !== $this->get_thumb_quality() ){

				$ar_target				= component_image::get_target_pixels_to_quality_conversion(
					$source_pixels_width,
					$source_pixels_height,
					$target_quality
				);
				$target_pixels_width	= $ar_target[0] ?? null;
				$target_pixels_height	= $ar_target[1] ?? null;

				// Avoid enlarge images
				// If the computed target pixel area exceeds the source, cap it at the source dimensions.
				// This prevents upscaling a small source to fill a large quality bucket.
					if ( ($source_pixels_width*$source_pixels_height)<($target_pixels_width*$target_pixels_height) ) {
						$target_pixels_width	= $source_pixels_width;
						$target_pixels_height	= $source_pixels_height;
					}

				// defaults when no value is available
				// Guard against null/zero dimensions returned when the source file could not be read.
					if((int)$target_pixels_width<1)  $target_pixels_width  = 720;
					if((int)$target_pixels_height<1) $target_pixels_height = 720;

					$resize = $target_pixels_width.'x'.$target_pixels_height;
			}

		// Target folder verify (exists and permissions)
			$target_dir = $this->get_media_path_dir($target_quality);
			if(!create_directory($target_dir, 0750)) {
				return false;
			}

		// convert
			$convert_options = new stdClass();
				$convert_options->source_file = $source_image;
				$convert_options->target_file = $target_image;

			// thumbnail
			if ($target_quality===$this->get_thumb_quality()) {
				$convert_options->thumbnail = true;
			}
			// resize
			if( isset($resize) ){
				$convert_options->resize = $resize;
			}
			// quality
			if( $target_quality === $this->get_original_quality() ||
				$target_quality === $this->get_modified_quality() ){
				$convert_options->quality = 100;
			}

			// CLI process data
				if ( running_in_cli()===true ) {
					common::$pdata->msg			= (label::get_label('processing') ?? 'Processing') . ' version: ' . $target_quality . ' | id: ' . $this->section_id;
					common::$pdata->current_time= exec_time_unit($start_time2, 'ms');
					common::$pdata->total_ms	= (common::$pdata->total_ms ?? 0) + common::$pdata->current_time; // cumulative time
					// send to output
					print_cli(common::$pdata);
				}

			// convert with ImageMagick command
			ImageMagick::convert($convert_options);

		// alternative_versions
			$alternative_convert_options = new stdClass();
				$alternative_convert_options->resize = $resize;

			$alternative_extensions	= $this->get_alternative_extensions() ?? [];
			foreach ($alternative_extensions as $current_extension) {

				// CLI process data
					if ( running_in_cli()===true ) {
						common::$pdata->msg				= (label::get_label('processing') ?? 'Processing') . ' alternative version: ' . $current_extension . ' | id: ' . $this->section_id;
						common::$pdata->memory			= dd_memory_usage();
						common::$pdata->target_quality	= $target_quality;
						common::$pdata->current_time	= exec_time_unit($start_time2, 'ms');
						common::$pdata->total_ms		= (common::$pdata->total_ms ?? 0) + common::$pdata->current_time; // cumulative time
						// send to output
						print_cli(common::$pdata);
					}

				// create alternative version file
				$this->create_alternative_version(
					$target_quality,
					$current_extension,
					$alternative_convert_options
				);
			}


		return true;
	}//end convert_quality



	/**
	* BUILD_VERSION
	* Builds a single quality-tier file for this image component and optionally saves the component.
	*
	* Orchestrates the full workflow for producing one derivative:
	*  1. Resolves the best available source file via get_image_source() (modified > original > other available).
	*  2. Calls convert_quality() to produce the target-quality JPEG (and alternative formats).
	*  3. When the target is the default quality, deletes and recreates the SVG overlay file
	*     so it reflects the current pixel dimensions of the newly built file.
	*  4. Logs a 'NEW VERSION' activity entry to the activity logger.
	*  5. Saves the component data if $save is true.
	*
	* The $async parameter is declared in the interface contract but is not used by this
	* implementation; conversion is always synchronous. Callers should not rely on async
	* behaviour in this class.
	*
	* @param string $quality - Target quality identifier to build (e.g., '1.5MB', 'thumb')
	* @param bool $async = true   - Declared by interface; not used — conversion is synchronous
	* @param bool $save = true    - Whether to call save() after building the file
	* @return object $response - stdClass with result (bool), msg (string), and errors (array) fields
	*/
	public function build_version(string $quality, bool $async=true, bool $save=true) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// source
			$image_source	= $this->get_image_source( $quality );
			$source_file	= $image_source->source_file;
			$source_quality	= $image_source->source_quality;

		// source file not found case
			if(empty($source_file)){

				debug_log(__METHOD__
					." Unable to locate source_file. File does not exists:" . PHP_EOL
					.' source_file: ' . to_string($source_file) . PHP_EOL
					.' tipo: ' . to_string($this->tipo) . PHP_EOL
					.' section_tipo: ' . to_string($this->section_tipo) . PHP_EOL
					.' section_id: ' . to_string($this->section_id) . PHP_EOL
					.' quality: ' . to_string($quality)
					, logger::ERROR
				);

				// response
					$response->result			= false;
					$response->msg				= 'Unable to locate source_file. File does not exists';
					$response->command_response	= null;
					$response->errors[]			= 'invalid source_file';

				return $response;
			}

		// convert_quality
			$result = $this->convert_quality((object)[
				'source_quality'	=> $source_quality,
				'target_quality'	=> $quality
			]);

		// svg file. Create file again
			$default_quality = $this->get_default_quality();
			if ($quality===$default_quality) {
				$svg_file_path = $this->get_svg_file_path();
				if (file_exists($svg_file_path)) {
					unlink($svg_file_path);
				}
				// If default quality file already exists, svg_string_node will be generated, else null
				$svg_string_node = $this->create_default_svg_string_node();
				if (!empty($svg_string_node)) {
					// create the svg default file
					$this->create_svg_file($svg_string_node);
				}
			}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version. Generated image file',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $this->get_id(),
					'quality'			=> $quality,
					// 'source_quality'	=> $source_quality,
					'target_quality'	=> $quality
				],
				logged_user_id() // int
			);

		// update component data files info and save
			if ($save===true) {
				$this->save();
			}

		// response
			$response->result			= $result;
			$response->msg				= 'Building file version in background';
			$response->command_response	= null;


		return $response;
	}//end build_version



	/**
	* GET_IMAGE_SOURCE
	* Resolves the best available source file to use when building a quality derivative.
	*
	* Selection priority (first match wins):
	*  1. Modified (retouched) master, when the target is not itself the 'original' tier.
	*  2. Original master.
	*  3. Any other existing quality file, iterating get_ar_quality() from highest to lowest,
	*     stopping at the target quality level so a low-quality file is never used as a source
	*     for a higher-quality output.
	*
	* The $quality parameter gates the fallback iteration: the loop breaks once it reaches a
	* tier at or below the target, preventing upscaling from a coarser derivative.
	*
	* @param string $quality - The target quality tier that will be built (used only to gate the fallback iteration)
	* @return object - stdClass with:
	*   - source_file    : ?string  Absolute filesystem path of the resolved source file, or null if none found
	*   - source_quality : ?string  Quality identifier of the resolved source file, or null
	*/
	public function get_image_source( string $quality ) : object {

		// modified_file full file path try
		$uploaded_modified_file = $this->get_uploaded_file(
			$this->get_modified_quality()
		);
		if ($quality!==$this->get_original_quality() && isset($uploaded_modified_file) && file_exists($uploaded_modified_file)) {
			$source_quality	= $this->get_modified_quality();
			$source_file	= $uploaded_modified_file;
		}else{
			// original_file full file path try
			$uploaded_original_file = $this->get_uploaded_file(
				$this->get_original_quality()
			);
			if(isset($uploaded_original_file) && file_exists($uploaded_original_file)) {
				$source_quality	= $this->get_original_quality();
				$source_file	= $uploaded_original_file;
			}
		}

		// try to use non original / modified / default qualities
		// e.g. user upload a file to an intermediate quality like '3MB' with tool media versions,
		// without having uploaded an 'original' or 'modified' master
		if(empty($source_file)){
			// Iterate qualities from high to low; stop when we reach the target quality level
			// so we never use a lower-resolution file as a source for a higher-quality derivative.
			foreach ($this->get_ar_quality() as $current_quality) {
				if ($current_quality!==$quality) {
					if (file_exists($this->get_media_filepath($current_quality))) {
						$source_quality	= $current_quality;
						$source_file	= $this->get_media_filepath($current_quality);
						break;
					}
				}
				if ($current_quality===$this->quality) {
					// do not use quality smaller than current instance quality
					break;
				}
			}
		}

		// image_source
			$image_source = new stdClass();
				$image_source->source_file		= $source_file ?? null;
				$image_source->source_quality	= $source_quality ?? null;

		return $image_source;
	}//end get_image_source



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* Removes media files for the specified quality tiers, with SVG overlay cleanup.
	*
	* Delegates to parent::remove_component_media_files() for the standard quality-file removal,
	* then additionally deletes the SVG overlay file when the default quality is included in
	* $ar_quality. This keeps the SVG in sync with the raster files: if the default-quality
	* JPEG is gone, the SVG that references it is also removed.
	*
	* Returns false immediately on SVG deletion failure (after logging ERROR), even if the
	* parent call succeeded for other quality files.
	*
	* (!) Typo in the original doc-block: 'component_medai_common' should be 'component_media_common'.
	* Corrected here, not in code.
	*
	* @param array $ar_quality = []       - Quality identifiers whose files should be removed
	* @param ?string $extension = null    - File extension filter; null removes the default extension file
	* @return bool - True when all deletions succeed, false on first failure
	*/
	public function remove_component_media_files( array $ar_quality=[], ?string $extension=null ) : bool {

		$result = parent::remove_component_media_files($ar_quality, $extension);

		// delete svg file when quality is default_quality
			$default_quality = $this->get_default_quality();
			if (in_array($default_quality, $ar_quality)) {
				$svg_file = $this->get_svg_file_path();
				if (file_exists($svg_file)) {
					// delete existing file
					if (!unlink($svg_file)) {
						debug_log(__METHOD__
							. " Error on delete SVG file " . PHP_EOL
							. ' svg_file: ' . $svg_file
							, logger::ERROR
						);
						return false;
					}
				}
			}


		return $result;
	}//end remove_component_media_files



	/**
	* CHECK_NORMALIZED_FILES
	* Ensures that normalized JPEG files exist for both the 'original' and 'modified' quality tiers.
	*
	* A "normalized" file is the Dédalo-standard JPEG copy derived from the uploaded master
	* (which may be a TIFF, PSD, RAW, etc.). The normalized file is what all lower-quality
	* derivatives are built from; without it, convert_quality() would fail.
	*
	* For each master quality tier (original, modified):
	*  1. Locates the uploaded source file via get_uploaded_file(). Skips tiers with no upload.
	*  2. Checks whether the normalized JPEG already exists. If missing, converts via ImageMagick
	*     at quality=100 to produce it.
	*  3. For each configured alternative extension (e.g., webp, avif), checks whether the
	*     alternative-format copy exists at that tier and creates it if not.
	*
	* Called by convert_quality() before performing any resizing, so derivatives are always
	* built from a known-good JPEG source rather than directly from a PSD/RAW.
	*
	* @return void
	*/
	public function check_normalized_files() : void {

		// use qualities
		$original_quality	= $this->get_original_quality();
		$modified_quality	= $this->get_modified_quality();

		$ar_quality = [$original_quality, $modified_quality];

		$alternative_extensions	= $this->get_alternative_extensions() ?? [];

		foreach ($ar_quality as $quality) {

			$source_file = $this->get_uploaded_file($quality);
			if( empty($source_file) || !file_exists($source_file) ){
				continue;
			}

			$normalized_file = $this->get_media_filepath($quality);

			// normalized_file . Create if it does not already exist
			if ( !file_exists($normalized_file) ) {

				$target_file = $normalized_file;

				$options = new stdClass();
					$options->source_file	= $source_file;
					$options->target_file	= $target_file;
					$options->quality		= 100;

				ImageMagick::convert($options);
			}

			foreach ($alternative_extensions as $alternative_extension) {

				$alternative_target_file = $this->get_media_filepath($quality, $alternative_extension);
				if( !file_exists($alternative_target_file) ){

					// create_alternative_version
						$this->create_alternative_version(
							$quality,
							$alternative_extension
						);
				}
			}
		}
	}//end check_normalized_files



	/**
	* GET_MEDIA_ATTRIBUTES
	* Reads technical attributes of a media file using the ImageMagick helper.
	*
	* Despite the reference to 'ffmpeg' in the original doc-block, this method delegates
	* to ImageMagick::get_media_attributes() — not ffmpeg. (ffmpeg is used by component_av.)
	* The returned array contains format-specific metadata such as dimensions, color space,
	* bit depth, and resolution as reported by ImageMagick identify.
	*
	* @param string $file_path - Absolute filesystem path to the image file to inspect
	* @return ?array - Associative array of media attributes, or null if reading fails
	*/
	public function get_media_attributes(string $file_path) : ?array {

		$media_attributes = ImageMagick::get_media_attributes($file_path);

		return $media_attributes;
	}//end get_media_attributes



	/**
	* GET_IMAGE_DIMENSIONS
	* Returns the pixel dimensions of the image at the given file path.
	*
	* Despite the mention of 'exif_read_data' in the original doc-block, the actual
	* implementation delegates to ImageMagick::get_dimensions() (not the PHP exif extension).
	* ImageMagick is used because it handles a wider range of formats (TIFF, PSD, HEIC, etc.)
	* and reads dimensions reliably regardless of EXIF orientation tags.
	*
	* Early-return cases (return an empty stdClass with no width/height):
	*  - $this->external_source is set: dimensions of external images cannot be read
	*    server-side without fetching the remote file.
	*  - The file does not exist on disk: logs ERROR and returns empty object.
	*
	* Callers must guard against a missing width/height via the null-coalescing operator
	* (e.g., `$dimensions->width ?? null`) because the returned object may be empty.
	*
	* @param string $file_path - Absolute filesystem path to the image file
	* @return object - stdClass with 'width' (int) and 'height' (int) properties,
	*                  or an empty stdClass when the file cannot be read
	*/
	public function get_image_dimensions(string $file_path) : object {

		$image_dimensions = new stdClass();

		// file path
		// External source images live outside the Dédalo media store; we cannot read their
		// pixel dimensions without a remote HTTP fetch, so we return an empty object immediately.
			if($this->external_source) {

				$file_path = $this->external_source;

				return $image_dimensions;
			}

		// file do not exists case
			if ( !file_exists( $file_path )) {
				debug_log(__METHOD__
					." Error. Image file not found " . PHP_EOL
					. 'file_path: ' .$file_path . PHP_EOL
					. 'section_tipo: ' .$this->section_tipo . PHP_EOL
					. 'section_id: ' .$this->section_id . PHP_EOL
					, logger::ERROR
				);
				// debug
					// if(SHOW_DEBUG===true) {
					// 	dump(debug_backtrace(), ' debug_backtrace ++ '.to_string());
					// }
				return $image_dimensions;
			}

		try {

			$image_dimensions = ImageMagick::get_dimensions($file_path);

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Error. get_image_dimensions error 2 " . PHP_EOL
				.' filename: ' . $file_path .PHP_EOL
				.' Caught exception: '.  $e->getMessage()
				, logger::ERROR
			);
		}


		return $image_dimensions;
	}//end get_image_dimensions



	/**
	* GET_TARGET_PIXELS_TO_QUALITY_CONVERSION
	* Calculates the target pixel dimensions for a given quality tier based on the source image size.
	*
	* Three branches:
	*  - 'thumb' quality : returns the fixed thumbnail dimensions from config
	*    (DEDALO_IMAGE_THUMB_WIDTH × DEDALO_IMAGE_THUMB_HEIGHT; defaults 222 × 148).
	*  - 'original' / 'modified' tiers : no resizing allowed; returns source dimensions unchanged.
	*  - All other size-capped tiers (e.g., '1.5MB', '6MB') : derives pixel dimensions
	*    using the formula:
	*      target_megabytes = convert_quality_to_megabytes(target_quality) × 350 000
	*      short_axis       = target_megabytes / aspect_ratio
	*      height           = √(short_axis)
	*      width            = round(height × aspect_ratio)
	*    The magic multiplier 350 000 is an empirically tuned constant that maps a JPEG
	*    file-size target (in MB) to a pixel area at typical JPEG compression ratios.
	*
	* Returns null when either source dimension is zero (invalid/missing image).
	*
	* @param int|string|null $source_pixels_width  - Source image width in pixels
	* @param int|string|null $source_pixels_height - Source image height in pixels
	* @param string $target_quality                - Target quality identifier (e.g., 'thumb', '1.5MB', 'original')
	* @return ?array - Two-element array [width, height] in pixels, or null on invalid input
	*/
	public static function get_target_pixels_to_quality_conversion(int|string|null $source_pixels_width, int|string|null $source_pixels_height, string $target_quality) : ?array {

		// check valid pixels
			if((int)$source_pixels_width===0 || (int)$source_pixels_height===0) {
				debug_log(__METHOD__
					." Invalid pixels received." .PHP_EOL
					.' source_pixels_width: ' . to_string($source_pixels_width) .PHP_EOL
					.' source_pixels_height: ' . to_string($source_pixels_height) .PHP_EOL
					.' target_quality: ' . to_string($target_quality) .PHP_EOL
					, logger::ERROR
				);
				return null;
			}

		// thumb_quality v6.2.0
		$thumb_quality = defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';

		switch ($target_quality) {

			case $thumb_quality:
				// Default 222x148
				$result = [
					DEDALO_IMAGE_THUMB_WIDTH,
					DEDALO_IMAGE_THUMB_HEIGHT
				];
				break;

			case DEDALO_IMAGE_QUALITY_ORIGINAL:
			case DEDALO_IMAGE_QUALITY_RETOUCHED:
				// resizing is not allowed
				$result = [
					$source_pixels_width,
					$source_pixels_height
				];
				break;

			default:
				// ratio
					$source_ratio = (int)$source_pixels_width / (int)$source_pixels_height;
				// target megabytes: the MB value from the quality name multiplied by the empirical
				// pixel-area constant (350 000) that maps file-size to pixel count for JPEG images.
					$target_megabytes = component_image::convert_quality_to_megabytes($target_quality) * 350000;
				// calculate the short_axis: the number of pixels along the shorter dimension
				// derived from total pixel area divided by the aspect ratio.
					$short_axis = $target_megabytes / $source_ratio;
				// set the values for height and width.
				// For landscape images the ratio is > 1 (e.g., 1.33), for portrait it is < 1 (e.g., 0.75).
				// sqrt() gives us the short-axis pixel count from the total pixel area.
					$height	= intval(sqrt($short_axis));
					$width	= round($height * $source_ratio);

				$result = [
					$width,
					$height
				];
				break;
		}


		return $result;
	}//end get_target_pixels_to_quality_conversion



	/**
	* PIXEL_TO_CENTIMETERS
	* Converts image pixel dimensions to centimetres at the specified DPI resolution.
	*
	* Reads the physical pixel dimensions from the quality-tier file using PHP's getimagesize(),
	* then applies the standard inch-to-centimetre conversion: px × 2.54 / dpi.
	* The result is formatted with two decimal places using a comma as the decimal separator
	* (locale-style formatting; not the '.' separator used by number_format's default English locale).
	*
	* (!) Uses getimagesize() rather than ImageMagick, which may fail or return incorrect results
	* for formats like TIFF, PSD, or HEIC that are not natively supported by PHP's GD/exif stack.
	* In those cases the caller may receive [0, 0] dimensions and incorrect centimetre values.
	*
	* @param string $quality       - Quality tier to read file from (e.g., 'original', 'modified')
	* @param int $dpi = DEDALO_IMAGE_PRINT_DPI - Dots per inch for conversion (config.php default: 150)
	* @return array - Two-element array [width_cm, height_cm] formatted as strings (e.g., ['15,50cm', '10,35cm'])
	*/
	public function pixel_to_centimeters(string $quality, int $dpi=DEDALO_IMAGE_PRINT_DPI) : array {

		$image_path = $this->get_media_filepath($quality);

		$size = getimagesize($image_path);
		$x = $size[0];
		$y = $size[1];

		// Convert to centimetre: pixels × 2.54 (cm per inch) ÷ dpi
		$h = $x * 2.54 / $dpi;
		$l = $y * 2.54 / $dpi;

		// Format a number with grouped thousands
		$h = number_format($h, 2, ',', ' ');
		$l = number_format($l, 2, ',', ' ');

		$px2cm = [
			$h.'cm',
			$l.'cm'
		];

		return $px2cm;
	}//end pixel_to_centimeters



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-build and save its data.
	* Extends regeneration with image-specific actions:
	* - Optionally deletes normalized image files
	* - Creates SVG representation file if missing
	* - Fixes image paths in existing SVG files
	*
	* @see class.tool_update_cache.php
	* @param object|null $options Configuration options:
	*   - delete_normalized_files : bool Whether to delete normalized files (default: true)
	*
	* @return bool True on success, false on failure
	*/
	public function regenerate_component( ?object $options=null ) : bool {

		// options
			$delete_normalized_files = $options->delete_normalized_files ?? true;

		// common regenerate_component exec after specific actions (this action saves at the end)
			$regenerate_options = new stdClass();
				$regenerate_options->delete_normalized_files = $delete_normalized_files;

			$result = parent::regenerate_component( $regenerate_options );
			if ( $result === false ) {
				return false;
			}

		// svg file. Create file if not exists
			$svg_file_path = $this->get_svg_file_path();
			if (!file_exists($svg_file_path)) {
				// If default quality file exists, svg_string_node will be generated, else null
				$svg_string_node = $this->create_default_svg_string_node();
				if (!empty($svg_string_node)) {
					// create the svg default file
					$this->create_svg_file($svg_string_node);
				}
			}else{
				// SVG file already exists. Verify that the embedded image href still matches the
				// current media URL. Paths can drift when an installation is migrated to a new server
				// path or when the initial_media_path / additional_path values change.
				// Example of a stale href: '/v6/media/media_development/image/1.5MB/0/rsc29_rsc170_1.jpg'
				$content = file_get_contents($svg_file_path);
				// sample :
				// <svg version="1.1" ..><g id="raster"><image width="1366" height="1024" xlink:href="/v6/media/media_development/image/1.5MB/0/rsc29_rsc170_1.jpg"/></g></svg>
				if (is_string($content)) {
					$ext		= $this->get_extension();
					$quality	= $this->get_default_quality();
					preg_match('/xlink:href="(\S+\.'.$ext.')"/', $content, $output_array);
					if (isset($output_array[1])) {
						// sample: '/v6/media/media_development/image/1.5MB/0/rsc29_rsc170_1.jpg'
						$image_url = $this->get_media_url_dir($quality) .'/'. $this->get_id() .'.'. $ext; // relative path
						if ($image_url!==$output_array[1]) {
							// replace string
							$svg_string_node = str_replace($output_array[1], $image_url, $content);
							$this->create_svg_file($svg_string_node);
							debug_log(__METHOD__
								. " Updated SVG image path " . PHP_EOL
								. ' old path: ' . to_string($output_array[1]) .PHP_EOL
								. ' new pah:' 	. to_string($image_url)
								, logger::WARNING
							);
						}
					}
				}
			}

		return $result;
	}//end regenerate_component



	/**
	* CREATE_ALTERNATIVE_VERSION
	* Creates an alternative image format file (e.g., webp, avif) at the given quality tier.
	*
	* Guards and early-return conditions (returns false without conversion):
	*  - $quality is the thumb tier (thumb files are JPEG-only; no alternative formats).
	*  - $extension is not in DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS.
	*  - The primary JPEG at $quality does not exist (no source to convert from).
	*  - No resolvable source file found via get_image_source().
	*
	* Source-file selection: attempts to use a same-extension file from the master quality
	* (e.g., 'original/myid.avif') when one exists, so avif→avif conversions bypass the JPEG
	* intermediate. Falls back to the main source file otherwise.
	*
	* The target file is written to the same directory as the primary JPEG for $quality,
	* with the alternative extension replacing '.jpg'. Existing alternative files are overwritten.
	*
	* @param string $quality        - Quality tier to produce the alternative version for
	* @param string $extension      - Target extension without dot (e.g., 'webp', 'avif')
	* @param ?object $options = null - Optional options:
	*   - resize : ?string  ImageMagick resize spec (e.g., '1280x960'); null for no resize
	* @return bool - True on successful creation, false on any failure or skip condition
	*/
	public function create_alternative_version( string $quality, string $extension, ?object $options=null ) : bool {

		// options
			$resize = $options->resize ?? null;

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

		// current_quality file
			$current_quality_file = $this->get_media_filepath($quality);
			if (!file_exists($current_quality_file)) {
				debug_log(__METHOD__
					. " Ignored alternative_version creation. Source file do not exists " . PHP_EOL
					. 'current_quality_file: ' . to_string($current_quality_file)
					, logger::WARNING
				);
				return false;
			}

		// source file
			// get uploaded image as source | modified, original or high quality available.
				$image_source = $this->get_image_source( $quality );
					$source_file	= $image_source->source_file;
					$source_quality	= $image_source->source_quality;

			// get the original file with the extension of the alternative image
			// if the original directory has a copy with the same extension, use it (avif -> avif),
			// else use the original source file (tiff -> avif)
				$alternative_source_file = $this->get_media_filepath($source_quality, $extension);
				if($source_quality!==$quality && file_exists($alternative_source_file) ){
					$source_file = $alternative_source_file;
				}

				if (!file_exists($source_file)) {
					debug_log(__METHOD__
						. " Ignored alternative_version creation. Source file do not exists " . PHP_EOL
						. 'quality: ' . to_string($quality) . PHP_EOL
						. 'source_file: ' . to_string($source_file)
						, logger::WARNING
					);
					return false;
				}

		// short vars
			$file_name		= $this->get_id();
			$target_path	= $this->get_media_path_dir($quality);
			$target_file	= $target_path . '/' . $file_name . '.' . strtolower($extension);

		// convert to alternative format using ImageMagick.
		// (!) Label "generate from PDF" is a copy-paste error from component_pdf — this is an image component.
			$im_options = new stdClass();
				$im_options->source_file	= $source_file;
				$im_options->target_file	= $target_file;
				$im_options->quality		= 100;
				$im_options->resize			= $resize;

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



}//end class component_image
