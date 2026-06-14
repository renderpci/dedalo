<?php declare(strict_types=1);
include_once 'trait.search_component_media_common.php';
/**
* INTERFACE COMPONENT_MEDIA_INTERFACE
* Contract that every concrete media component must satisfy.
*
* All five media component types (component_3d, component_av, component_image,
* component_pdf, component_svg) implement this interface alongside their common
* behaviour, which lives in component_media_common. The interface is the minimal
* surface that calling code (diffusion, tools, section delete/restore, etc.) can
* depend on without knowing the concrete subclass.
*
* Methods are grouped logically:
* - Identity / path helpers: get_id, get_initial_media_path, get_additional_path,
*   get_media_path_dir, get_media_url_dir, get_media_filepath
* - File lifecycle: add_file, delete_file, quality_file_exist, get_quality_files,
*   rename_old_files (via add_file), restore_component_media_files,
*   remove_component_media_files, create_alternative_versions
* - Inspection: get_files_info, get_quality_file_info, get_normalized_name_from_files,
*   get_uploaded_file, get_size, get_url, get_thumb_url, get_thumb_path
* - Quality / extension metadata: get_ar_quality, get_default_quality,
*   get_original_quality, get_extension, get_allowed_extensions, get_folder,
*   get_best_extensions, get_alternative_extensions
* - Transcoding pipeline: build_version, create_thumb, create_alternative_version,
*   process_uploaded_file, update_data_version, regenerate_component
*
* @package Dédalo
* @subpackage Core
*/
interface component_media_interface {

	// from component_media_common


	public function get_id();
	public function get_initial_media_path();
	public function get_additional_path();
	public function quality_file_exist(string $quality);
	public function add_file(object $options);
	public function valid_file_extension(string $file_extension);
	public function get_files_info(bool $include_empty=false);
	public function get_thumb_path();
	public function get_thumb_extension();
	public function delete_file(string $quality);
	public function get_quality_files(string $quality);
	public function get_normalized_name_from_files(string $quality);
	public function get_uploaded_file(string $quality);
	public function get_quality_file_info(string $quality, ?string $extension=null);
	public function get_source_quality_to_build(string $target_quality);
	public function get_original_extension(bool $exclude_converted=true);
	public function get_original_file_path();
	public function get_media_path_dir(string $quality);
	public function get_media_url_dir(string $quality);
	public function get_url(?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=false);
	public function get_thumb_url();
	public function get_media_filepath(?string $quality=null, ?string $extension=null);
	public function get_size(string $quality);
	public function restore_component_media_files();
	public function create_alternative_versions(?object $options=null);

	// others
	public function get_ar_quality();
	public function get_default_quality();
	public function get_original_quality();
	public function get_extension();
	public function get_allowed_extensions();
	public function get_folder();
	public function get_best_extensions();
	public function get_alternative_extensions();
	public function build_version(string $quality, bool $async=true, bool $save=true);
	public function create_thumb();
	public function process_uploaded_file(object $file_data, object $process_options);
	public static function update_data_version(object $options);
	public function remove_component_media_files(array $ar_quality=[]);
	public function regenerate_component();
	public function create_alternative_version(string $quality, string $extension, ?object $options=null);

}//end component_media_interface



/**
* CLASS COMPONENT_MEDIA_COMMON
* Abstract base class shared by all five media component types in Dédalo.
*
* Responsibilities:
* - Builds deterministic filesystem paths and public URLs for every quality level
*   (original, default/web, thumb, and any component-specific sizes such as '1.5MB').
* - Coordinates the full media lifecycle: upload staging → file move → version
*   transcoding → thumbnail creation → data-update → save.
* - Provides "soft delete" semantics: files are never hard-deleted; they are
*   renamed with a datestamp and moved to a 'deleted/' sub-folder within each
*   quality directory.
* - Generates component data (the `files_info` JSONB array stored in the matrix)
*   by scanning the filesystem on every save.
* - Wires into the diffusion pipeline via get_diffusion_value / get_diffusion_data,
*   and into the export pipeline via get_export_value.
*
* Concrete subclasses (all must also implement component_media_interface):
* - component_3d  — 3D model files
* - component_av  — audio / video files
* - component_image — raster images
* - component_pdf — PDF documents
* - component_svg — SVG graphics
*
* Data shape stored per component (one element in the JSONB array):
* {
*   "files_info": [
*     {
*       "quality"          : string,   // e.g. 'original', '1.5MB', 'thumb'
*       "file_exist"       : bool,
*       "file_name"        : string|null,
*       "file_path"        : string|null, // relative to DEDALO_MEDIA_PATH
*       "file_size"        : int|null,    // bytes
*       "file_time"        : dd_date|null,
*       "extension"        : string|null,
*       "external"         : bool         // true when file_path is an external URL
*     }, …
*   ],
*   "original_file_name"      : string|null,
*   "original_normalized_name": string|null,  // e.g. 'dd522_dd128_1.tif'
*   "original_upload_date"    : dd_date|null,
*   "modified_normalized_name": string|null,
*   "modified_upload_date"    : dd_date|null,
*   "lib_data"                : object|null   // component_image only
* }
*
* Uses trait search_component_media_common for SQO/SQL search stubs
* (media components are not currently full-text searchable).
*
* Extends component_common — inherits get_data/set_data, save, locator helpers,
* properties resolution, and the component cache.
*
* @package Dédalo
* @subpackage Core
*/
class component_media_common extends component_common {


	// traits. Files added to current class file to split the large code.
	use search_component_media_common;


	/**
	* CLASS VARS
	*/

		/**
		* Active quality level for this component instance.
		* Examples: 'original', '1.5MB', 'standard', 'thumb'.
		* Controls which sub-directory under the media folder is addressed by path/URL helpers.
		* Initialized in __construct from get_quality(); callers can override via set_quality().
		* @var ?string $quality
		*/
		public ?string $quality = null;

		/**
		* Optional sub-directory appended after the quality segment in the media path.
		* Used to cap the number of files per directory (max_items_folder) or to honour
		* a section-level 'additional_path' property that maps to another component's value
		* (e.g. a numeric bucket like '/0', '/1000', '/2000').
		* Null when neither mechanism is configured.
		* @var ?string $additional_path
		*/
		public ?string $additional_path = null;

		/**
		* Optional top-level sub-directory inserted between the folder root and the quality
		* segment, sourced from the parent section's 'initial_media_path' property keyed by
		* this component's tipo (e.g. '/archive_photos').
		* Null when the section defines no custom path for this tipo.
		* @var ?string $initial_media_path
		*/
		public ?string $initial_media_path = null;

		/**
		* Target base filename (without extension) for the media file, i.e. the component id.
		* Built lazily by get_target_filename() as $this->id . '.' . get_extension().
		* Retained as a property so callers can read the planned name before committing the file.
		* @var ?string $target_filename
		*/
		public ?string $target_filename = null;

		/**
		* Absolute filesystem path to the directory where files for the active quality are stored.
		* Computed by get_media_path_dir(); cached here to avoid repeated string concatenation.
		* @var ?string $target_dir
		*/
		public ?string $target_dir = null;

		/**
		* Root media type folder constant value (not the constant name) set by the concrete
		* subclass. Examples: value of DEDALO_IMAGE_FOLDER ('/image'),
		* DEDALO_AV_FOLDER ('/av'), DEDALO_PDF_FOLDER ('/pdf').
		* Forms the first segment after DEDALO_MEDIA_PATH in every path.
		* Concrete subclasses define this via get_folder().
		* @var ?string $folder
		*/
		public ?string $folder = null;

		/**
		* Unique, deterministic file identifier for this component instance.
		* Format: {component_tipo}_{section_tipo}_{section_id}[_{lang}]
		* Example: 'dd522_dd128_1' or 'rsc29_rsc170_770_lg-spa'.
		* Used as the stem of every media file on disk and in generated URLs.
		* Set once in __construct via get_id(); read-only thereafter.
		* @var ?string $id
		*/
		public ?string $id = null;

		/**
		* Default file extension for the normalized/web version of this component's media.
		* Examples: 'jpg' (component_image), 'mp4' (component_av), 'pdf', 'svg'.
		* Concrete subclasses expose this via get_extension().
		* @var ?string $extension
		*/
		public ?string $extension = null;

		/**
		* Absolute URL of an external media source (outside Dédalo's own media tree).
		* When non-null, path and URL helpers short-circuit and return this value directly,
		* bypassing all local filesystem operations. Set by resolving the 'external_source'
		* property on the component's ontology node (which names a companion component_iri).
		* @var ?string $external_source
		*/
		public ?string $external_source = null;

	// Unified data sample:
		// [{
		//	"files_info": [{
		//		'quality'			: $quality,
		//		'file_name'			: $file_name,
		//		'file_path'			: $file_path,
		//		'file_url'			: $file_url,
		//		'file_size'			: $file_size,
		//		'file_time'			: $file_time,
		//		'upload_file_name'	: $source_file_name,
		//		'upload_date'		: $upload_date,
		//		'upload_user'		: $upload_user,
		//	}],
		//	"lib_data": {} // component_image only
		// }]



	/**
	* __CONSTRUCT
	* Initializes the media component by delegating to the parent constructor and
	* then eagerly computing the three path-building ingredients that are needed by
	* almost every method: quality, id, initial_media_path, and additional_path.
	*
	* The constructor forces DEDALO_DATA_NOLAN for non-translatable components so
	* that path helpers always produce the same filename regardless of the caller's
	* language context. (PDF components can be translatable, so this override is
	* conditional on the ontology node's translatable flag.)
	*
	* Path properties are only populated when section_id is known; if the instance
	* is created without a section_id (e.g. for structural/ontology queries) those
	* properties remain null and callers must check before using path helpers.
	*
	* @param string $tipo - ontology tipo identifier for this component (e.g. 'rsc29')
	* @param mixed $section_id = null - parent record id; null for structural-only instantiation
	* @param string $mode = 'list' - rendering mode: 'list', 'edit', 'tm', etc.
	* @param string $lang = DEDALO_DATA_LANG - data language; overridden to DEDALO_DATA_NOLAN for non-translatable components
	* @param ?string $section_tipo = null - parent section tipo; resolved from ontology when null
	* @param bool $cache = true - whether to use the component instance cache
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {

		// lang. Force always DEDALO_DATA_NOLAN when is not translatable
		// (note that PDF can be translatable)
			$translatable = ontology_node::get_translatable($tipo);
			if ($translatable!==true) {
				$lang = DEDALO_DATA_NOLAN;
			}

		// common constructor. Creates the component as normally do with parent class
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);

		// quality
			$this->quality = $this->get_quality();

		// id. Set and fix current id
			if (!empty($this->section_id)) {

				// id. Set and fix current id
					$this->id = $this->get_id();

				// initial_media_path set like 'my_custom_name'
					$this->initial_media_path = $this->get_initial_media_path();

				// additional_path : Set and fix current additional path like '/0'
					$this->additional_path = $this->get_additional_path();
			}
	}//end __construct



	/**
	* GET_MEDIA_COMPONENTS
	* Returns the canonical list of all PHP class names that are classified as
	* "media components" in Dédalo. This list is used wherever code needs to
	* iterate or detect every subclass without hard-coded instanceof chains
	* (e.g. section delete/restore, diffusion, tool_update_cache).
	* To register a new media component, add its class name here.
	* @return array - ordered list of media component class-name strings
	* @test true
	*/
	public static function get_media_components() : array {

		return [
			'component_3d',
			'component_av',
			'component_image',
			'component_pdf',
			'component_svg'
		];
	}//end get_media_components



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract (see component_common::get_export_value).
	*
	* Produces a single export_value atom containing the media URL for the
	* appropriate quality level:
	* - In 'edit' mode: the default (web) quality URL.
	* - In any other mode: the thumb quality URL (smaller, faster).
	*
	* URL absoluteness is driven by export_context::$absolute_urls, replacing
	* the old $this->caller==='tool_export' switch. Pass an export_context with
	* absolute_urls=true to get a fully qualified https:// URL.
	*
	* The atom carries cell_type='img' so spreadsheet/table renderers can treat
	* the value as an image reference rather than plain text.
	* @param export_context|null $context = null
	* @return export_value - single-atom result; URL is empty string when data is null
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		// current_url. get from data
			$data = $this->get_data();
			if (isset($data)) {

				$element_quality = ($this->mode==='edit')
					? $this->get_default_quality()
					: $this->get_thumb_quality();

				$current_url = $this->get_url(
					$element_quality, // string quality
					false, // bool test_file
					$context->absolute_urls, // bool absolute
					false // bool default_add
				);
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
	* GET_DIFFUSION_VALUE
	* Overrides component_common::get_diffusion_value.
	* Computes the value written to a MySQL/MariaDB diffusion field for this component.
	*
	* Returns null when:
	* - The component has no data.
	* - The expected quality+extension combination does not exist on disk
	*   (verified via files_info[].file_exist rather than a live stat() call).
	*
	* When DEDALO_PUBLICATION_CLEAN_URL is true the value is just the bare filename
	* (e.g. 'dd522_dd128_1.jpg'), allowing an external web engine (e.g. with
	* watermark middleware) to reconstruct the serving URL itself. Otherwise the
	* full relative URL is returned.
	* @param string|null $lang = null - unused for media components (kept for interface parity)
	* @param object|null $option_obj = null - unused for media components (kept for interface parity)
	* @return string|null - relative URL, bare filename, or null
	* @see class.diffusion_mysql.php
	* @test true
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// data
			$data = $this->get_data();
			if (empty($data) || empty($data[0])) {
				return null;
			}
			$files_info = $data[0]->files_info ?? [];
			$found = array_find($files_info, function($el){
				return $el->quality === $this->get_default_quality()
					&& $el->extension === $this->get_extension()
					&& $el->file_exist === true;
			});
			if (!is_object($found)) {
				return null;
			}

		$diffusion_value = (defined('DEDALO_PUBLICATION_CLEAN_URL') && true===DEDALO_PUBLICATION_CLEAN_URL)
			? ($this->get_id() .'.'. $this->get_extension())
			: $this->get_url(
				$this->get_default_quality(),
				false,  // bool test_file
				false,  // bool absolute
				false // bool default_add
			  );


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATA
	* Resolves the diffusion payload for this media component.
	* Called by the diffusion chain processor to populate a single diffusion_data_object.
	*
	* Resolution order:
	* 1. If the DDO provides a custom function name ($ddo->fn), call that method on $this.
	*    Only whitelisted functions (currently 'get_posterframe_url') receive structured args;
	*    all others receive ($ddo, $diffusion_element_tipo). Non-existent functions return
	*    a null-valued diffusion_data array immediately.
	* 2. If the component has an external_source configured, use that URL as the value.
	* 3. Otherwise build the URL via get_url() using quality/extension/test_file/absolute/
	*    default_add from $ddo->options (each defaulting to its natural fallback).
	*    file_exist from the stored files_info is checked before calling get_url() to avoid
	*    a redundant filesystem stat.
	*
	* When DEDALO_PUBLICATION_CLEAN_URL is true the value is the bare filename rather than
	* the full URL (see get_diffusion_value for rationale).
	* @param object $ddo - DDO descriptor from the diffusion map
	* @param ?string $diffusion_element_tipo = null - target element tipo (forwarded to custom fn)
	* @return array - array of diffusion_data_object; value is null when the file is missing
	* @see diffusion_chain_processor (consumes the returned diffusion_data_object items)
	* @test false
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo = null ) : array {

		$diffusion_data = [];

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data[] = $diffusion_data_object;

		// Custom function case
			// If ddo provide a specific function to get its diffusion data
			// check if it exists and can be used by diffusion environment
			// if all is ok, use this function and return the value returned by this function
			$fn = $ddo->fn ?? null;

			if( $fn ){
				// check if the function exist
				// if not, return a null value in diffusion data
				// and stop the resolution
				if( !is_callable([$this, $fn]) ){
					debug_log(__METHOD__
						. " function doesn't exist " . PHP_EOL
						. " function name: ". $fn
						, logger::ERROR
					);

					return $diffusion_data;
				}
				try {
					// not all functions are available for diffusion
					// in the function is allowed get its value and return
					// if the function is NOT allowed (default) return a diffusion value as null
					switch ($fn) {
						// functions allowed for diffusion environment
						case 'get_posterframe_url':

							$test_file		= $ddo->options->test_file ?? false;
							$absolute		= $ddo->options->absolute ?? false;
							$avoid_cache	= $ddo->options->avoid_cache ?? false;

							$fn_data = $this->{$fn}($test_file, $absolute, $avoid_cache);

							break;

						default:
							$fn_data = $this->$fn( $ddo, $diffusion_element_tipo );
							break;
					}
				} catch (Throwable $e) {
					// fallback when method does not expect $diffusion_data_object
					debug_log(__METHOD__
						. " error executing diffusion function " . PHP_EOL
						. " function name: ". $fn . PHP_EOL
						. " error: " . $e->getMessage()
						, logger::ERROR
						);
						$fn_data = null;
				}

				$diffusion_data = $fn_data;
				// set the diffusion value and return the diffusion data
				return $diffusion_data;
			}

		// Resolve the external source
			$external_source = $this->get_external_source();
			if (!empty($external_source)) {
				$diffusion_data_object->set_value( $external_source );
				return $diffusion_data;
			}

		// Resolve the data by default
			// If the ddo doesn't provide any specific function the component will use a get_url as default.

			// set the options
				$quality		= $ddo->options->quality ?? $this->get_default_quality();
				$extension		= $ddo->options->extension ?? $this->get_extension();
				$test_file		= $ddo->options->test_file ?? false;
				$absolute		= $ddo->options->absolute ?? false;
				$default_add	= $ddo->options->default_add ?? false;

			// get data from DDBB without checking the files
			// this check use the data of the component to check if the files exists
			// this check is faster than check every media file.
				$data = $this->get_data();
				if (empty($data) || empty($data[0])) {
					return $diffusion_data;
				}
				// if the ddo provides a data_slice property, use it to slice the data
				if(isset($ddo->data_slice)){
					$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
				}
				// get the files_info, it has the file_exist parameter that determinate if file exists in the media tree
				$files_info = $data[0]->files_info ?? [];
				$found = array_find($files_info, function($el) use ($quality, $extension){
					return $el->quality === $quality
						&& $el->extension === $extension
						&& $el->file_exist === true;
				});
				// if the file doesn't exist return the diffusion data with null value.
				if (!is_object($found)) {
					return $diffusion_data;
				}

			// If the files exists get its URI
				// DEDALO_PUBLICATION_CLEAN_URL option
					// Used to get the file name instead the full URI
					// the parameter remove the full URL path and use the id of the media to build a diffusion control of the media files.
					// in those cases the media files are provided by a web engine that handled the files, for example to add a watermark.
				$diffusion_value = (defined('DEDALO_PUBLICATION_CLEAN_URL') && true===DEDALO_PUBLICATION_CLEAN_URL)
					? ($this->get_id() .'.'. $extension)
					: $this->get_url(
						$quality,
						$test_file,  // bool test_file
						$absolute,  // bool absolute
						$default_add // bool default_add
					);

			$diffusion_data_object->set_value( $diffusion_value );


		return $diffusion_data;
	}//end get_diffusion_data



	/**
	* GET_EXTERNAL_SOURCE
	* Resolves the external media URL for this component, if one is configured.
	*
	* The ontology node for this component may carry an 'external_source' property
	* whose value is the tipo of a companion component_iri on the same section (e.g.
	* 'rsc496'). When that IRI component holds a populated dataframe entry with an
	* 'iri' field, the IRI value is used as the external URL instead of any local
	* file path. This lets curators point a media component at an externally hosted
	* image or asset without uploading a local copy.
	*
	* The check on $first_value->dataframe prevents misinterpreting a bare IRI
	* stored without the dataframe pairing from being treated as an external source.
	* @see rsc29 (component_image 'Image') for a production example of this property
	* @return string|null - absolute external URL, or null when not configured / not set
	*/
	public function get_external_source() : ?string {

		$properties = $this->get_properties();
		if (isset($properties->external_source) && !empty($this->section_id)) {

			$component_tipo		= $properties->external_source;
			$component_model	= ontology_node::get_model_by_tipo($component_tipo,true);
			$component			= component_common::get_instance(
				$component_model,
				$component_tipo,
				$this->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$this->section_tipo
			);

			$data			= $component->get_data();
			$first_value	= !empty($data) && is_array($data)
				? $data[0]
				: null;

			// used to change the IRI of the image, don't use it as dataframe section
			// only control if the URI is internal or external.
			if(!empty($first_value->dataframe)){
				if(isset($first_value->iri) && !empty($first_value->iri)) {
					// external_source get from IRI
					$external_source = $first_value->iri;
				}
			}
		}//end if (isset($properties->external_source) && !empty($this->get_parent()) )


		return $external_source ?? null;
	}//end get_external_source



	/**
	* GET_ID
	* Returns (and caches in $this->id) the unique file-name stem for this component.
	*
	* The id is built by get_identifier() from the component's locator, then has the
	* language code appended when the component is translatable. The result is used
	* as the base filename for every media file on disk and in generated URLs.
	* Null is returned (with a WARNING log) when section_id is not set, as is the case
	* for structurally instantiated components with no record context.
	* @return string|null - identifier string (e.g. 'rsc29_rsc170_770'), or null
	* @test true
	*/
	public function get_id() : ?string {

		// already set
			if(isset($this->id) && !empty($this->id)) {
				return $this->id;
			}

		// section_id check
			$section_id = $this->get_section_id();
			if (!isset($section_id)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." Component data (section_id: $this->section_id,section_tipo: $this->section_tipo) is empty"
						, logger::WARNING
					);
				}
				return null;
			}

		// get identifier
			$id	= $this->get_identifier();

		// add lang when translatable
			if (ontology_node::get_translatable($this->tipo)){
				$id .= '_'.DEDALO_DATA_LANG;
			}

		// fix value
			$this->id = $id;


		return $id;
	}//end get_id



	/**
	* GET_NAME
	* Alias of get_id for contexts that request a 'name' rather than an 'id'
	* (e.g. rename_old_files, get_quality_files). Returns the same value.
	* @return string|null - same as get_id()
	* @test true
	*/
	public function get_name() : ?string {

		return $this->get_id();
	}//end get_name



	/**
	* GET_INITIAL_MEDIA_PATH
	* Reads the 'initial_media_path' object from the parent section's properties and
	* returns the sub-path defined for this component's tipo, or null if none exists.
	*
	* The path is stored keyed by component tipo so different media components in the
	* same section can use different top-level sub-directories under the quality root:
	*   properties.initial_media_path.{tipo} = '/archive_photos'
	*
	* A leading slash is injected if the stored value lacks one, ensuring consistent
	* path concatenation in get_media_path_dir().
	*
	* Primarily used by component_image and component_pdf.
	* @return string|null - path segment like '/archive_photos', or null
	* @test true
	*/
	public function get_initial_media_path() : ?string {

		$component_tipo		= $this->tipo;
		$parent_section		= $this->get_my_section();
		$properties			= $parent_section->get_properties();

		if (isset($properties->initial_media_path->{$component_tipo})) {
			$this->initial_media_path = $properties->initial_media_path->{$component_tipo};
			// Add / at begin if not exits
			if ( substr($this->initial_media_path, 0, 1) != '/' ) {
				$this->initial_media_path = '/'.$this->initial_media_path;
			}
		}else{
			$this->initial_media_path = null;
		}

		return $this->initial_media_path;
	}//end get_initial_media_path



	/**
	* GET_ADDITIONAL_PATH
	* Computes the directory bucket sub-path appended after the quality segment.
	*
	* Two sources are checked in order:
	* 1. Component properties.additional_path: a tipo pointing to another component
	*    on the same section (e.g. component_input_text). That component's trimmed
	*    string value is used as the path (leading slash forced, trailing slash stripped).
	* 2. Component properties.max_items_folder: an integer (e.g. 1000) used to bucket
	*    files by section_id: bucket = max_items_folder * floor(section_id / max_items_folder).
	*    This prevents directories from growing to unmanageable sizes on large collections.
	*
	* Returns null when neither property is configured or section_id is absent.
	* The cached value on $this->additional_path is returned immediately on repeat calls.
	* @return string|null - path segment like '/0' or '/2000', or null
	* @test true
	*/
	public function get_additional_path() : ?string {

		// already set case
			if(isset($this->additional_path)) {
				return $this->additional_path;
			}

		// default value
			$additional_path = null;

		// short vars
			$properties				= $this->get_properties();
			$additional_path_tipo	= $properties->additional_path ?? null;
			$section_id				= $this->get_section_id();
			$section_tipo			= $this->get_section_tipo();

		// section_id
			if (empty($section_id)) {
				return null;
			}

		if ( !is_null($additional_path_tipo) ) {

			$component_tipo	= $additional_path_tipo;
			$model			= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// value
				$value = trim($component->get_value() ?? '');

			// Add a slash at the beginning if it doesn't already exist
				if ( substr($value, 0, 1)!=='/' ) {
					$value = '/'.$value;
				}

			// Remove the trailing slash if it exists
				if ( substr($value, -1)==='/' ) {
					$value = substr($value, 0, -1);
				}

			// add
				$additional_path = $value;
		}

		// fallback max_items_folder from properties
			if( empty($additional_path) && isset($properties->max_items_folder) ) {

				$max_items_folder	= (int)$properties->max_items_folder; // normally 1000
				$int_section_id		= (int)$section_id;

				// add
				$additional_path = '/'.$max_items_folder*(floor($int_section_id / $max_items_folder));
			}


		// fix value
			$this->additional_path = $additional_path;


		return $additional_path;
	}//end get_additional_path



	/**
	* GET_BEST_EXTENSIONS
	* Returns the ordered preference list of file extensions when multiple files are
	* found for the same quality (e.g. both '.tiff' and '.jpg' in the original directory).
	* The first extension in the returned array is the most preferred.
	*
	* The base implementation returns an empty array (no preference). Concrete subclasses
	* (e.g. component_image) override this to declare codec priority such as
	* ['tiff', 'png', 'jpg']. Used by get_normalized_name_from_files() to pick the
	* canonical upload file when ambiguity exists.
	* @return array - ordered extension strings (e.g. ['tiff', 'png', 'jpg']), empty when none
	* @test true
	*/
	public function get_best_extensions() : array {

		return [];
	}//end get_best_extensions



	/**
	* QUALITY_FILE_EXIST
	* Checks whether the media file for the given quality level exists on disk.
	* Uses the default extension (get_extension()) for the file path check.
	* This is a fast existence test; for full metadata use get_quality_file_info().
	* @param string $quality - quality level to test (e.g. 'original', '1.5MB')
	* @return bool - true if the file is present on disk
	* @test true
	*/
	public function quality_file_exist(string $quality) : bool {

		$file_path_abs	= $this->get_media_filepath($quality);
		$file_exists	= file_exists($file_path_abs);

		return $file_exists;
	}//end quality_file_exist



	/**
	* ADD_FILE
	* Accepts an upload descriptor from tool_upload / service_upload, validates the
	* source file against a strict security allowlist (SEC-063), then atomically
	* moves it to its final media location under DEDALO_MEDIA_PATH.
	*
	* Security constraints enforced here (see inline SEC-063 comments):
	* - caller-supplied source_file paths are silently ignored; the source is always
	*   reconstructed from the controlled staging root.
	* - tmp_dir must be one of the whitelisted constant names (currently only
	*   'DEDALO_UPLOAD_TMP_DIR'); any other string is rejected.
	* - key_dir and tmp_name are sanitized via sanitize_key_dir() to strip traversal
	*   sequences, null bytes, and path separators.
	* - realpath() confinement confirms the resolved source lives inside the user's
	*   own staging directory, blocking symlink-escape attacks.
	*
	* ZIP files are delegated to move_zip_file() (overridden by component_av).
	* All other files are moved with rename().
	* Old files for all allowed extensions are first backed up by rename_old_files().
	*
	* On success $response->ready contains:
	*   { original_file_name, full_file_name, full_file_path }
	*
	* @param object $options - upload descriptor:
	*   {
	*     "name"      : string,  // original client filename, e.g. 'IMG_3007.jpg'
	*     "type"      : string,  // MIME type (informational only, not trusted)
	*     "tmp_dir"   : string,  // whitelisted constant name, e.g. 'DEDALO_UPLOAD_TMP_DIR'
	*     "key_dir"   : string,  // upload-session sub-directory, e.g. 'tool_upload'
	*     "tmp_name"  : string,  // temp basename chosen by upload handler, e.g. 'phpJIQq4e'
	*     "error"     : int,     // PHP $_FILES error code (0 = ok)
	*     "size"      : int,     // file size in bytes
	*     "extension" : string,  // lowercase extension, e.g. 'jpg'
	*     "quality"   : string   // optional; defaults to component default quality
	*   }
	* @return object $response - {result: bool, msg: string, errors: string[], ready?: object}
	* @test true
	*/
	public function add_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';
			$response->errors	= [];

		// options sample
			// {
			// 	"name": "IMG_3007.jpg",
			// 	"type": "image/jpeg",
			// 	"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
			// 	"key_dir": "tool_upload",
			// 	"tmp_name": "phpJIQq4e",
			// 	"error": 0,
			// 	"size": 22131522,
			// 	"extension": "jpg"
			// }

		// options
			$name			= $options->name; // string original file name like 'IMG_3007.jpg'
			$key_dir		= $options->key_dir; // string upload caller name like 'oh1_oh1'
			$tmp_dir		= $options->tmp_dir; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$tmp_name		= $options->tmp_name; // string like 'phpJIQq4e'
			$quality 		= $options->quality ?? $this->get_quality() ?? $this->get_original_quality();

		// SEC-063: reject user-supplied `source_file` outright. Historically the
		// caller could pass any absolute path and the method would rename it to
		// a component-controlled location, giving write access to arbitrary
		// files on the host (any readable path → overwritten under /media).
		// Every legitimate caller stages uploads through DEDALO_UPLOAD_TMP_DIR
		// (via service_upload / dd_utils_api), so we rebuild the source path
		// from a controlled allowlist and discard any caller override.
			if (isset($options->source_file)) {
				debug_log(__METHOD__
					. ' SEC-063: caller-supplied source_file ignored: ' . (string)$options->source_file
					, logger::WARNING
				);
			}

		// SEC-063: restrict `tmp_dir` to a closed allowlist of constants that
		// name a staging directory under our control. `defined($tmp_dir)` alone
		// was not enough — any constant whose string happens to resolve to a
		// filesystem path would satisfy it (DEDALO_ROOT_PATH, DEDALO_MEDIA_PATH,
		// etc.), letting a caller rebase the source path arbitrarily.
			$allowed_tmp_dir_constants = [
				'DEDALO_UPLOAD_TMP_DIR', // primary staging dir (service_upload)
			];
			if (empty($tmp_dir)
				|| !is_string($tmp_dir)
				|| !in_array($tmp_dir, $allowed_tmp_dir_constants, true)
				|| !defined($tmp_dir)
			) {
				$response->msg .= 'invalid tmp_dir: '. json_encode($tmp_dir);
				debug_log(__METHOD__
					.' SEC-063 tmp_dir rejected: ' . to_string($tmp_dir)
					, logger::ERROR
				);
				$response->errors[] = 'invalid tmp_dir value';
				return $response;
			}

		// SEC-063: strict-sanitise key_dir and tmp_name. key_dir is a
		// caller-supplied folder name under the user's staging root; tmp_name
		// is the basename chosen by the upload handler. Neither may contain
		// path separators, traversal sequences, or null bytes.
			$safe_key_dir	= sanitize_key_dir((string)$key_dir);
			$safe_tmp_name	= sanitize_key_dir((string)$tmp_name);
			if ($safe_key_dir === '' || $safe_tmp_name === '') {
				$response->msg .= ' invalid key_dir or tmp_name';
				debug_log(__METHOD__
					.' SEC-063 rejected key_dir=' . to_string($key_dir)
					.' tmp_name=' . to_string($tmp_name)
					, logger::ERROR
				);
				$response->errors[] = 'invalid key_dir/tmp_name';
				return $response;
			}

			$user_id		= (int)logged_user_id();
			$staging_root	= (string)constant($tmp_dir) . '/' . $user_id . '/' . $safe_key_dir;
			$source_file	= $staging_root . '/' . $safe_tmp_name;

		// check source file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				debug_log(__METHOD__
					.' Source file do not exists:' . $source_file . PHP_EOL
					. ' source_file: ' . $source_file
					, logger::ERROR
				);
				$response->errors[] = 'source file not found';
				return $response;
			}

		// SEC-063: realpath confinement — the resolved source must live
		// inside the user's staging directory for the configured tmp_dir
		// constant. This blocks symlink escapes where the staging dir itself
		// has been replaced or contains a symlink to something else. We run
		// this *after* file_exists so the more user-facing 'source file not
		// found' error is returned for the common missing-upload case.
			$real_source	= realpath($source_file);
			$real_staging	= realpath($staging_root);
			if ($real_source === false
				|| $real_staging === false
				|| !str_starts_with($real_source, $real_staging . DIRECTORY_SEPARATOR)
			) {
				$response->msg .= ' source file outside staging root';
				debug_log(__METHOD__
					.' SEC-063 staging-confinement failed. real_source=' . to_string($real_source)
					.' real_staging=' . to_string($real_staging)
					, logger::ERROR
				);
				$response->errors[] = 'source file outside staging root';
				return $response;
			}

		// target file info
			$file_extension	= strtolower(pathinfo($name, PATHINFO_EXTENSION));
			$file_name		= $this->get_name();
			$folder_path	= $this->get_media_path_dir($quality);
			$full_file_name	= $file_name . '.' . $file_extension;
			$full_file_path	= $folder_path .'/'. $full_file_name;

		// debug
			debug_log(__METHOD__
				." media_common.add_file Target file: " . PHP_EOL
				.' folder_path: ' . to_string($folder_path) . PHP_EOL
				.' full_file_path: ' . to_string($full_file_path)
				, logger::WARNING
			);

		// validate extension
			if (!$this->valid_file_extension($file_extension)) {
				$allowed_extensions = $this->get_allowed_extensions();
				$response->msg  = "Error: " .$file_extension. " is an invalid file type ! ";
				$response->msg .= "Allowed file extensions are: ". implode(', ', $allowed_extensions);
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' file_extension: ' . $file_extension
					, logger::ERROR
				);
				$response->errors[] = 'invalid extension';
				return $response;
			}

		// safe folder_path
			if (!is_dir($folder_path)) {
				if(!mkdir($folder_path, 0750, true)) {
					debug_log(__METHOD__
						.' Error creating directory: ' . PHP_EOL
						.' folder_path: ' . $folder_path
						, logger::ERROR
					);
					$response->msg .= ' Error creating directory';
					debug_log(__METHOD__
						. ' '.$response->msg
						, logger::ERROR
					);
					$response->errors[] = 'creating folder_path directory failed';
					return $response;
				}
			}

		// rename old files when they exists to store a copy before move current an overwrite it
			$renamed = $this->rename_old_files($file_name, $folder_path);
			if ($renamed->result===false) {
				$response->msg .= $renamed->msg;
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' file_name: ' . $file_name . PHP_EOL
					. ' folder_path: ' . $folder_path
					, logger::ERROR
				);
				$response->errors[] = 'renaming old files failed';
				return $response;
			}

		// move file to destination
			if($file_extension==='zip'){
				// zip case. If the file is a .zip like in DVD case, create the folder and copy the VIDEO_TS and AUDIO_TS to the destination folder.

				// unzip file and move elements to final destinations
				$move_zip = self::move_zip_file($source_file, $folder_path, $file_name);
				if (false===$move_zip->result) {
					$response->msg .= $move_zip->msg;
					debug_log(__METHOD__
						.' ' .$response->msg . PHP_EOL
						. ' source_file: ' . $source_file . PHP_EOL
						. ' file_name: ' . $file_name
						, logger::ERROR
					);
					$response->errors[] = 'moving zip files failed';
					return $response;
				}

			}else{
				// usual case
				// move temporary file to final destination and name

				// check target directory
				$target_dir = dirname($full_file_path);
				if (!is_dir($target_dir)) {
					if(!mkdir($target_dir, 0750, true)) {
						debug_log(__METHOD__
							.' Error creating directory: ' . PHP_EOL
							.' target_dir: ' . $target_dir
							, logger::ERROR
						);
						$response->msg .= ' Error creating directory';
						debug_log(__METHOD__
							. ' '.$response->msg
							, logger::ERROR
						);
						$response->errors[] = 'creating target directory failed';
						return $response;
					}
				}

				// move the file
				if (false===rename($source_file, $full_file_path)) {
					$response->msg .= ' Error on move temp file '.basename($tmp_name).' to ' . basename($full_file_name);
					debug_log(__METHOD__
						.' ' .$response->msg . PHP_EOL
						. ' source_file: ' . $source_file . PHP_EOL
						. ' full_file_path: ' . $full_file_path
						, logger::ERROR
					);
					$response->errors[] = 'moving source file failed';
					return $response;
				}
			}

		// all is OK
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

			// uploaded ready file info
			$response->ready = (object)[
				'original_file_name'	=> $name,
				'full_file_name'		=> $full_file_name,
				'full_file_path'		=> $full_file_path
			];


		return $response;
	}//end add_file



	/**
	* MOVE_ZIP_FILE
	* Stub implementation for handling ZIP uploads. Always returns failure in this
	* base class. Concrete subclasses that accept ZIP archives (e.g. component_av
	* for DVD-style uploads with VIDEO_TS/AUDIO_TS directories) must override this
	* method to perform the actual extraction and file placement.
	* @param string $tmp_name - absolute path of the staged source ZIP file
	* @param string $folder_path - absolute target directory for extracted contents
	* @param string $file_name - target base name for the extracted content
	* @return object $response - {result: false, msg: string} always in this base class
	* @test true
	*/
	public static function move_zip_file(string $tmp_name, string $folder_path, string $file_name) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']. This component don\'t have ZIP files options enable. '.get_called_class();


		return $response;
	}//end move_zip_file



	/**
	* RENAME_OLD_FILES
	* Before overwriting with a new upload, moves every existing file matching
	* $file_name (across all allowed extensions and any directory named $file_name)
	* into a '$folder_path/deleted/' sub-directory with a datestamp suffix, e.g.:
	*   rsc29_rsc170_1_deleted_2024-11-15_143022.jpg
	*
	* This preserves old versions for potential manual recovery without blocking the
	* new upload, and without performing a hard delete. Called unconditionally from
	* add_file() before the rename/copy step.
	*
	* The 'deleted' sub-directory is created with 0775 if it does not yet exist.
	* Failure to create it is returned as an error (no partial rename is attempted).
	* @param string $file_name - base filename stem, e.g. 'test175_test65_3'
	* @param string $folder_path - absolute path to the quality directory
	* @return object $response - {result: bool, msg: string, errors: string[]}
	* @test true
	*/
	public function rename_old_files(string $file_name, string $folder_path) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';
				$response->errors	= [];

		// check target fir
			if (empty($folder_path) || !is_dir($folder_path)) {
				$msg = "Invalid folder_path: '$folder_path' from filename: '$file_name'. Ignored rename";
				debug_log(__METHOD__
					." $msg "
					, logger::ERROR
				);
				$response->msg .= $msg;
				$response->errors[] = 'invalid folder path';
				return $response;
			}

		// deleted dir. Verify / create the dir "deleted"
			if( !file_exists($folder_path . '/deleted') ) {
				if( !mkdir($folder_path.'/deleted', 0775, true) ) {
					$msg = "Error on create dir: '$folder_path' . Permission denied";
					debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
					$response->msg .= $msg;
					$response->errors[] = 'unable to create deleted folder';
					return $response;
				}
			}

		// remove old versions by extension. Iterate all extensions looking for possible files to delete
		$allowed_extensions = $this->get_allowed_extensions();
		$dateMovement 		= date("Y-m-d_Gis"); # like 2011-02-08_182033
		foreach ($allowed_extensions as $current_extension) {

			$current_possible_file = $folder_path .'/'. $file_name .'.'. $current_extension;
			if(file_exists($current_possible_file)) {
				$file_to_move_renamed = $folder_path . '/deleted/'. $file_name . '_deleted_'. $dateMovement . '.' . $current_extension ;
				rename($current_possible_file, $file_to_move_renamed);
			}
		}
		// remove old versions by dirname (dvd for example). Check if dirname with file_id exists and move it if yes
		if(is_dir($folder_path.'/'.$file_name)) {
			$file_to_move_renamed = $folder_path . '/deleted/'. $file_name . '_deleted_'. $dateMovement ;
			rename($folder_path.'/'.$file_name , $file_to_move_renamed);
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__METHOD__.']';


		return $response;
	}//end rename_old_files



	/**
	* VALID_FILE_EXTENSION
	* Checks whether the given file extension is in the component's allowed-extensions
	* list (returned by get_allowed_extensions()). The check is case-sensitive; callers
	* should normalize to lowercase before calling (add_file() does this via strtolower).
	* @param string $file_extension - lowercase extension without leading dot, e.g. 'jpg'
	* @return bool - true if the extension is permitted for this component type
	* @test true
	*/
	public function valid_file_extension(string $file_extension) : bool {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return (bool)$valid;
	}//end valid_file_extension



	/**
	* GET_ALTERNATIVE_EXTENSIONS
	* Returns the list of secondary output formats produced alongside the primary
	* extension for each quality level. Typically used for format pairs such as
	* WebP or AVIF alongside JPEG, or WebM alongside MP4.
	*
	* The base implementation returns null (no alternatives). Concrete subclasses
	* (e.g. component_image) override this to declare their extra formats.
	* Used by get_files_info(), remove_component_media_files(), build_version(),
	* and regenerate_component() when iterating all physical files for a quality.
	* @return array|null - alternative extension strings (e.g. ['webp', 'avif']), or null
	* @test true
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* PROCESS_UPLOADED_FILE
	* Stub hook called by the upload pipeline after add_file() succeeds.
	* The base implementation does nothing and returns success, allowing the caller
	* to continue with the default post-upload steps (build_version, save, etc.).
	*
	* Concrete subclasses override this to perform component-specific processing
	* such as EXIF extraction (component_image), audio/video probing (component_av),
	* or text extraction (component_pdf).
	* @param object|null $file_data = null - file descriptor returned by add_file()->ready
	* @param object|null $process_options = null - caller-specific processing flags
	* @return object $response - {result: true, msg: 'OK. Request done'} in this base class
	* @test true
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end process_uploaded_file



	/**
	* GET_FILES_INFO
	* Scans the filesystem for all media files belonging to this component and
	* returns an array of file-info objects (one per quality × extension combination
	* that is actually found, or all when include_empty=true).
	*
	* The scan covers:
	* - Every quality in get_ar_quality() × every unique extension in
	*   [get_extension(), get_allowed_extensions(), get_alternative_extensions()].
	*   The thumb quality always uses get_thumb_extension() regardless of the
	*   component's primary extension.
	* - Any 'original_normalized_name' stored in data[0] (uploaded raw file that may
	*   have a different extension than the normalized one, e.g. '.tiff').
	* - Any 'modified_normalized_name' stored in data[0] (intermediate work file).
	*
	* Each returned object matches the files_info item schema documented on the class.
	* This method is the source of truth for update_component_data_files_info() and
	* is therefore called on every save().
	*
	* When include_empty=false (the default), qualities with no file are silently
	* omitted from the result. Pass include_empty=true to get placeholder objects for
	* every possible quality×extension combination (used by some admin UIs).
	* @param bool $include_empty = false - when true, include zero-file placeholders
	* @return array - array of file-info objects (see class data-shape documentation)
	* @test true
	*/
	public function get_files_info(bool $include_empty=false) : array {

		$ar_quality = $this->get_ar_quality();

		$thumb_quality		= $this->get_thumb_quality();
		$thumb_extension	= $this->get_thumb_extension();
		if(!in_array($thumb_quality, $ar_quality)){
			$ar_quality[] = $thumb_quality;
		}

		$extensions = [$this->get_extension()];

		$allowed_extensions		= $this->get_allowed_extensions();
		$extensions				= [...$extensions, ...$allowed_extensions];

		$alternative_extensions	= $this->get_alternative_extensions() ?? [];
		$extensions				= [...$extensions, ...$alternative_extensions];

		$unique_extensions		= array_unique($extensions);
		$data					= $this->get_data();

		// files check
			$files_info = [];
			foreach ($ar_quality as $quality) {

				// thumb, use thumb extension instead the component extension (for av is .mp4 and for thumb is .jpg)
				if($quality===$thumb_quality){

					$quality_file_info = $this->get_quality_file_info($quality, $thumb_extension);
					// file_exist check
					if ($include_empty===false && $quality_file_info->file_exist===false) {
						// skip quality without file
						continue;
					}

					// add
					$files_info[] = $quality_file_info;

					continue;
				}

				// extensions iterate
				foreach ($unique_extensions as $extension) {

					$quality_file_info = $this->get_quality_file_info($quality, $extension);

					// file_exist check
					if ($include_empty===false && $quality_file_info->file_exist===false) {
						// skip quality without file
						continue;
					}

					// add
					$files_info[] = $quality_file_info;
				}
			}//end foreach ($ar_quality as $quality)

		// original_normalized_name add like 'rsc29_rsc170_770.tif'
			if (isset($data[0]) && isset($data[0]->original_normalized_name)) {

				$original_quality	= $this->get_original_quality();
				$file_extension		= get_file_extension($data[0]->original_normalized_name);

				// original file like 'memoria_oral_presentacion.mov'
					$original_file_path	= $this->get_media_path_dir($original_quality) .'/'. $data[0]->original_normalized_name;
					if (file_exists($original_file_path)) {
						// file_info
						$quality_file_info = $this->get_quality_file_info($original_quality, $file_extension);
						// add
						if(!in_array($quality_file_info, $files_info)) {
							$files_info[] = $quality_file_info;
						}
					}
			}

		// modified_normalized_name add like 'rsc29_rsc170_770.psd'
			if (isset($data[0]) && isset($data[0]->modified_normalized_name)) {

				$modified_quality	= $this->get_modified_quality();
				$file_extension		= get_file_extension($data[0]->modified_normalized_name);

				// original file like 'memoria_oral_presentacion.mov'
					$modified_file_path	= $this->get_media_path_dir($modified_quality) .'/'. $data[0]->modified_normalized_name;
					if (file_exists($modified_file_path)) {
						// file_info
						$quality_file_info = $this->get_quality_file_info($modified_quality, $file_extension);

						// check if file path exists previously
						$current_file_path = $quality_file_info->file_path;
						$found = array_find($files_info, function($item) use($current_file_path) {
							return $item->file_path === $current_file_path;
						});

						if(empty($found)){
							// add
							$files_info[] = $quality_file_info;
						}
					}
			}


		return $files_info;
	}//end get_files_info



	/**
	* GET_DATALIST
	* Builds the client-facing datalist by reading quality entries from the stored
	* component data (files_info in DDBB), rather than scanning the filesystem.
	* This is faster than get_files_info() and appropriate for list/view rendering.
	*
	* For each quality in get_ar_quality():
	* - If files_info has matching entries, they are included with a resolved file_url.
	*   External files (file.external===true) use file_path directly as the URL;
	*   internal files prepend DEDALO_MEDIA_URL when file_exist is true.
	* - If no matching entry exists, a placeholder object is added with all fields null.
	*
	* The resulting array always contains one entry per quality level, making it safe
	* for the client to iterate without null-checking.
	* @return array - datalist objects {quality, file_exist, file_name, file_path, file_url, file_size, external}
	* @test true
	*/
	public function get_datalist() : array {

		// files_info from files
			// $files_info = $this->get_files_info(
			// 	true // bool include_empty
			// );

		// from component DDBB data
			$data = $this->get_data();
			$files_info = isset($data[0]) && isset($data[0]->files_info)
				? $data[0]->files_info
				: [];

		// get_ar_quality
			$datalist = [];
			$ar_quality = $this->get_ar_quality();
			foreach ($ar_quality as $quality) {

				$items = array_filter($files_info, function($e) use($quality) {
					return $e->quality===$quality;
				});
				if (!empty($items)) {
					foreach ($items as $el) {

						$external = $el->external ?? false;
						$file_url = $external===true
							? $el->file_path
							: (isset($el->file_exist) && $el->file_exist===true
								? DEDALO_MEDIA_URL . $el->file_path
								: null);

						$item = (object)[
							'quality'		=> $quality,
							'file_exist'	=> $el->file_exist ?? false,
							'file_name'		=> $el->file_name,
							'file_path'		=> $el->file_path,
							'file_url'		=> $file_url,
							'file_size'		=> $el->file_size,
							'external'		=> $external
						];

						$datalist[] = $item;
					}
				}else{

					$item = (object)[
						'quality'		=> $quality,
						'file_exist'	=> false,
						'file_name'		=> null,
						'file_path'		=> null,
						'file_url'		=> null,
						'file_size'		=> null,
						'external'		=> false
					];

					$datalist[] = $item;
				}
			}//end foreach ($ar_quality as $quality)


		return $datalist;
	}//end get_datalist



	/**
	* GET_LIST_VALUE
	* Returns a stripped-down subset of files_info suitable for list-mode rendering.
	* Only the default quality and thumb quality entries matching the component's
	* primary extension (or thumb extension for the thumb quality) are included.
	* All other quality levels and alternative-extension variants are omitted, keeping
	* the data payload small for index/grid views that only need a preview image.
	*
	* Returns null when the component has no data at all.
	* @return array|null - filtered files_info entries for default + thumb qualities only
	* @test true
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		// extension
			$extension			= $this->get_extension();
			$thumb_extension	= $this->get_thumb_extension();

		// ar_quality_to_include
			$ar_quality_to_include = [
				$this->get_default_quality(),
				$this->get_thumb_quality()
			];

		$list_value = [];
		foreach ($data as $item) {

			$files_info = $item->files_info ?? null;
			if (!empty($files_info)) {

				foreach ($files_info as $file_info) {

					// debug only
						if (!isset($file_info->extension)) {
							// dump($file_info, ' file_info without extension info: ++ '.to_string());
							debug_log(__METHOD__
								. ' file_info without extension info ' . PHP_EOL
								. ' file_info: ' . to_string($file_info) . PHP_EOL
								. ' tipo: ' . $this->tipo . PHP_EOL
								. ' section_id: ' . to_string($this->section_id) . PHP_EOL
								. ' component: ' . get_called_class()
								, logger::ERROR
							);
						}

					$current_extension = $file_info->quality==='thumb'
						? $thumb_extension
						: $extension;

					if ( (isset($file_info->extension) && $file_info->extension===$current_extension)
						&&  in_array($file_info->quality, $ar_quality_to_include)
						) {

						$list_value[] = $file_info;
					}
				}
			}
		}

		return $list_value;
	}//end get_list_value



	/**
	* GET_QUALITY
	* Returns the currently active quality level for this instance.
	* Uses $this->quality if already set (e.g. by set_quality() or __construct),
	* otherwise falls back to get_default_quality() from component configuration.
	* @return string - quality level string, e.g. 'standard', '1.5MB'
	* @test true
	*/
	public function get_quality() : string {

		$quality = $this->quality ?? $this->get_default_quality();

		return $quality;
	}//end get_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* Returns the pair of quality levels that hold 'normalized' (derived/transcoded)
	* files: the original upload quality and the default (web) quality. Used by
	* delete_normalized_files() to scope which directories need to be cleaned before
	* regenerating from the uploaded source.
	* @return array - two-element array [original_quality, default_quality]
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$original_quality	= $this->get_original_quality();
		$default_quality	= $this->get_default_quality();

		$normalized_ar_quality = [$original_quality, $default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_THUMB_QUALITY
	* Returns the thumbnail quality-level string. Reads from the DEDALO_QUALITY_THUMB
	* constant if defined (allowing site configuration to override the key), otherwise
	* falls back to the hardcoded string 'thumb'.
	* @return string - quality key for the thumbnail directory, typically 'thumb'
	* @test true
	*/
	public function get_thumb_quality() : string {

		$thumb_quality = defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';

		return $thumb_quality;
	}//end get_thumb_quality



	/**
	* GET_THUMB_PATH
	* Returns the absolute filesystem path to the thumbnail file.
	* Convenience wrapper around get_media_filepath() that hard-wires the
	* thumb quality level.
	* @return string - absolute path, e.g. '/srv/dedalo/media/image/thumb/0/rsc29_rsc170_1.jpg'
	* @test true
	*/
	public function get_thumb_path() : string {

		$thumb_quality = $this->get_thumb_quality();

		// target data (target quality is thumb)
		$image_thumb_path = $this->get_media_filepath($thumb_quality);

		return $image_thumb_path;
	}//end get_thumb_path



	/**
	* GET_THUMB_EXTENSION
	* Returns the file extension used for thumbnail files. Reads from the
	* DEDALO_THUMB_EXTENSION constant if defined, otherwise falls back to 'jpg'.
	* Thumbnails always use this extension regardless of the component's primary
	* extension (e.g. an AV component stores its posterframe thumb as a .jpg).
	* @return string - thumbnail extension without leading dot, e.g. 'jpg'
	* @test true
	*/
	public function get_thumb_extension() : string {

		$thumb_extension = defined('DEDALO_THUMB_EXTENSION') ? DEDALO_THUMB_EXTENSION : 'jpg';

		return $thumb_extension;
	}//end get_thumb_extension



	/**
	* DELETE_FILE
	* Soft-deletes the media file for a specific quality level by moving it to the
	* 'deleted/' sub-directory (via remove_component_media_files()).
	* After a successful move:
	* - If deleting the original or modified quality without a specific extension,
	*   all {quality}_* properties are stripped from data[0] so they are not
	*   serialized back to the database on the subsequent save.
	* - An activity log entry is written via logger.
	* - save() is called to persist the updated files_info.
	*
	* Rejects qualities not in get_ar_quality() with an error response.
	* @see component_image::remove_component_media_files
	* @param string $quality - quality level to delete (e.g. 'original', '1.5MB')
	* @param string|null $extension = null - restrict deletion to one extension; null deletes all
	* @return object $response - {result: bool, msg: string, errors: string[]}
	* @test true
	*/
	public function delete_file(string $quality, ?string $extension=null) : object {

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
			[$quality], // array ar_quality
			$extension
		);
		if ($result===true) {

			// update data on delete original
				if( !isset($extension) ){
					$original_quality	= $this->get_original_quality();
					$modified_quality	= $this->get_modified_quality();
					if ($quality===$original_quality || $quality===$modified_quality) {
						$data = $this->get_data();
						if (isset($data[0]) && is_object($data[0])) {
							foreach ($data[0] as $name => $current_value) {
								// delete all info about the current quality (file_name, upload_date, normalized_name, ..)
								if (strpos($name, $quality.'_')===0 && isset($data[0]->{$name})) {
									unset($data[0]->{$name});
								}
							}
						}
					}
				}

			// logger activity : WHAT (action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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

			// save to force update data files_info
				$this->save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}


		return $response;
	}//end delete_file



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* Soft-deletes (moves to 'deleted/' directory) every physical media file linked
	* to this component. Iterates all requested quality levels × all known extensions.
	*
	* When ar_quality is empty, all qualities from get_ar_quality() are processed.
	* When extension is given, only files with that extension are moved; otherwise all
	* known extensions ([get_extension(), get_alternative_extensions(), get_allowed_extensions()])
	* are checked and moved where they exist.
	*
	* For the original and modified quality levels, the stored normalized_name from data[0]
	* (e.g. 'rsc29_rsc170_770.tiff') is added to the extension list so that non-standard
	* format uploads are cleaned up alongside the standard formats.
	*
	* Returns true as soon as at least one quality directory is processed successfully;
	* returns false if any individual move fails (move_deleted_file returns false).
	* Triggered by section::remove_section_media_files() when a record is deleted.
	* @see section::remove_section_media_files
	* @param array $ar_quality = [] - quality levels to process; defaults to all
	* @param string|null $extension = null - restrict to one extension; null = all
	* @return bool - true if at least one file was processed; false on any move error
	* @test true
	*/
	public function remove_component_media_files( array $ar_quality=[], ?string $extension=null ) : bool {

		$result = false;

		// ar_quality. Get all if not received any
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// ar_extensions
			$normalized_extension	= $this->get_extension();
			$alternative_extensions	= $this->get_alternative_extensions() ?? [];
			$allowed_extensions 	= $this->get_allowed_extensions();
			$ar_extensions			= [
				$normalized_extension,
				...$alternative_extensions,
				...$allowed_extensions
			];

		// data
			$data = $this->get_data();

		// valid quality list
			$valid_ar_quality = $this->get_ar_quality();

		// files remove of each quality
			foreach ($ar_quality as $current_quality) {

				// check valid quality
					if (!in_array($current_quality, $valid_ar_quality)) {
						debug_log(__METHOD__
							. " Ignored invalid quality " . PHP_EOL
							. to_string($current_quality)
							, logger::WARNING
						);
						continue;
					}

				// original case. If defined 'original_normalized_name', add extension to list to delete
					if ( $current_quality===$this->get_original_quality() ) {
						$original_normalized_name	= isset($data[0]) && isset($data[0]->original_normalized_name)
							? $data[0]->original_normalized_name
							: null;
						if (isset($original_normalized_name)) {
							$original_normalized_extension = get_file_extension($original_normalized_name);
							if(!in_array($original_normalized_extension, $ar_extensions)) {
								$ar_extensions[] = $original_normalized_extension;
							}
						}
					}

				// modified case. If defined 'modified_normalized_name', add extension to list to delete
					if ( $current_quality===$this->get_modified_quality() ) {
						$modified_normalized_name	= isset($data[0]) && isset($data[0]->modified_normalized_name)
							? $data[0]->modified_normalized_name
							: null;
						if (isset($modified_normalized_name)) {
							$modified_normalized_extension = get_file_extension($modified_normalized_name);
							if(!in_array($modified_normalized_extension, $ar_extensions)) {
								$ar_extensions[] = $modified_normalized_extension;
							}
						}
					}

				// files by ar_extensions
					foreach ($ar_extensions as $current_extension) {

						if( isset($extension) && $current_extension !== $extension ){
							continue;
						}

						// media_path is full path of file like '/www/dedalo/media_test/media_development/svg/standard/rsc29_rsc170_77.svg'
							$media_path = $this->get_media_filepath($current_quality, $current_extension);
							if (!file_exists($media_path)) {
								// dump($media_path, ' SKIP media_path ++ '.to_string());
								continue; // Skip
							}

							$move_file_options = new stdClass();
								$move_file_options->quality			= $current_quality;
								$move_file_options->file			= $media_path;
								$move_file_options->bulk_process_id	= $this->bulk_process_id ?? null;
								$move_file_options->file_name		= $this->get_name();

							$move_file = $this->move_deleted_file( $move_file_options );

							if( $move_file === false ) {
								return false;
							}

						// debug
							debug_log(__METHOD__
								. ' Moved file'. PHP_EOL
								. ' media_path: ' . $media_path . PHP_EOL
								. ' move_file: ' . json_encode( $move_file )
								, logger::WARNING
							);
					}//end foreach ($ar_extensions as $current_extension)

				// fix result as true if any of qualities pass here
					$result = true;
			}//end foreach ($ar_quality as $current_quality)


		return $result;
	}//end remove_component_media_files



	/**
	* MOVE_DELETED_FILE
	* Performs the actual file rename/move into the 'deleted/' sub-directory for
	* a single file. The destination filename is:
	* - Normal case: {file_name}_deleted_{Y-m-d_Hi}.{extension}
	* - Bulk-process case (bulk_process_id set): {file_name}.{extension}
	*   (no datestamp, because the bulk process manages its own versioning directory).
	*
	* The target sub-directory is created via create_directory() if absent.
	* Called by remove_component_media_files() and delete_normalized_files().
	* @param object $options - {
	*   quality: string,           // quality level for path resolution
	*   file: string,              // absolute source file path
	*   file_name: string,         // base name stem (no extension), e.g. 'rsc29_rsc170_1'
	*   bulk_process_id: string|null // optional batch run identifier
	* }
	* @return bool - true on success, false if directory creation or rename fails
	*/
	public function move_deleted_file( object $options) : bool {

		//options
		$quality			= $options->quality;
		$file				= $options->file;
		$bulk_process_id	= $options->bulk_process_id ?? null;
		$file_name			= $options->file_name;

		// get the file extension
		$extension			= get_file_extension($file);

		// date to add at file names
			$date = date('Y-m-d_Hi');

		$bulk_proccess_dir = isset($bulk_process_id)
			? '/' . $bulk_process_id
			: '';

		// deleted directory check
			$folder_path_del = $this->get_media_path_dir($quality) . '/deleted' . $bulk_proccess_dir;

			$check_directory = create_directory($folder_path_del, 0750);

			if( $check_directory === false ) {
				return false;
			}

		// move the file to de directory
			$media_path_moved = isset( $bulk_process_id )
				? $folder_path_del . '/' . $file_name . '.' . $extension
				: $folder_path_del . '/' . $file_name . '_deleted_' . $date . '.' . $extension;

			if( !rename($file, $media_path_moved) ) {
				debug_log(__METHOD__
					. " Error on move files to folder \"deleted\" [1]. Permission denied . The files are not deleted" . PHP_EOL
					. ' file: ' . $file . PHP_EOL
					. ' media_path_moved: ' . $media_path_moved
					, logger::ERROR
				);
				return false;
			}

		return true;
	}//end move_deleted_file



	/**
	* DUPLICATE_COMPONENT_MEDIA_FILES
	* Copies all physical media files for this component into a new target section's
	* media directories, effectively duplicating the component's media for the new record.
	* Triggered by section_record::duplicate() when an entire section is duplicated.
	*
	* The target component is instantiated for $target_section_id so that its
	* get_media_path_dir() / get_name() produce the correctly keyed paths.
	* For each quality × extension combination, get_media_filepath() is called on the
	* source component and the result copied to the matching target path via duplicate_file().
	*
	* Original and modified quality levels also check normalized_name from data[0] to
	* include non-standard upload formats (e.g. '.tiff', '.psd').
	*
	* Returns false immediately if any individual copy fails; otherwise true when at
	* least one quality directory was processed.
	* @see section_record::duplicate()
	* @param string|int $target_section_id - section_id of the newly created duplicate record
	* @param array $ar_quality = [] - quality levels to copy; defaults to all
	* @param string|null $extension = null - restrict to one extension; null = all
	* @return bool - true when at least one file was copied; false on any copy error
	* @test false
	*/
	public function duplicate_component_media_files( string|int $target_section_id, array $ar_quality=[], ?string $extension=null ) : bool {

		$result = false;

		// ar_quality. Get all if not received any
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// ar_extensions
			$normalized_extension	= $this->get_extension();
			$alternative_extensions	= $this->get_alternative_extensions() ?? [];
			$allowed_extensions 	= $this->get_allowed_extensions();
			$ar_extensions			= [
				$normalized_extension,
				...$alternative_extensions,
				...$allowed_extensions
			];

		// data
			$data = $this->get_data();

		// valid quality list
			$valid_ar_quality = $this->get_ar_quality();


		// target component
			$target_component = component_common::get_instance(
				$this->get_model(),
				$this->get_tipo(),
				$target_section_id,
				'list',
				$this->get_lang(),
				$this->get_section_tipo()
			);

		// files remove of each quality
			foreach ($ar_quality as $current_quality) {

				// check valid quality
					if (!in_array($current_quality, $valid_ar_quality)) {
						debug_log(__METHOD__
							. " Ignored invalid quality " . PHP_EOL
							. to_string($current_quality)
							, logger::WARNING
						);
						continue;
					}

				// original case. If defined 'original_normalized_name', add extension to list to duplicate
					if ( $current_quality===$this->get_original_quality() ) {
						$original_normalized_name	= isset($data[0]) && isset($data[0]->original_normalized_name)
							? $data[0]->original_normalized_name
							: null;
						if (isset($original_normalized_name)) {
							$original_normalized_extension = get_file_extension($original_normalized_name);
							if(!in_array($original_normalized_extension, $ar_extensions)) {
								$ar_extensions[] = $original_normalized_extension;
							}
						}
					}

				// modified case. If defined 'modified_normalized_name', add extension to list to delete
					if ( $current_quality===$this->get_modified_quality() ) {
						$modified_normalized_name	= isset($data[0]) && isset($data[0]->modified_normalized_name)
							? $data[0]->modified_normalized_name
							: null;
						if (isset($modified_normalized_name)) {
							$modified_normalized_extension = get_file_extension($modified_normalized_name);
							if(!in_array($modified_normalized_extension, $ar_extensions)) {
								$ar_extensions[] = $modified_normalized_extension;
							}
						}
					}

				// files by ar_extensions
					foreach ($ar_extensions as $current_extension) {

						if( isset($extension) && $current_extension !== $extension ){
							continue;
						}

						// media_filepath is full path of file like '/www/dedalo/media_test/media_development/svg/standard/rsc29_rsc170_77.svg'
							$source_file = $this->get_media_filepath($current_quality, $current_extension);
							if (!file_exists($source_file)) {
								// dump($source_file, ' SKIP media_filepath ++ '.to_string());
								continue; // Skip
							}
							// get the target directory and create the new target filename
							$target_media_path_dir	= $target_component->get_media_path_dir($current_quality);
							$base_name				= $target_component->get_name();
							$target_filename		= $base_name.'.'.$current_extension;
							// build the full target file with its path
							$target_file			= $target_media_path_dir.'/'.$target_filename;

							// duplicate the file
							$duplicate_file_options = new stdClass();
								$duplicate_file_options->source_file	= $source_file;
								$duplicate_file_options->target_file	= $target_file;

							$move_file = $this->duplicate_file( $duplicate_file_options );

							if( $move_file === false ) {
								return false;
							}

						// debug
							debug_log(__METHOD__
								. ' Duplicated file'. PHP_EOL
								. ' source_file: ' . $source_file . PHP_EOL
								. ' target_file: ' . $target_file
								, logger::WARNING
							);
					}//end foreach ($ar_extensions as $current_extension)

				// fix result as true if any of qualities pass here
					$result = true;
			}//end foreach ($ar_quality as $current_quality)


		return $result;
	}//end duplicate_component_media_files



	/**
	* DUPLICATE_FILE
	* Copies a single source file to the specified target path, creating the target
	* directory if it does not already exist. Used by duplicate_component_media_files().
	* @param object $options - {
	*   source_file: string, // absolute source file path
	*   target_file: string  // absolute destination file path
	* }
	* @return bool - true on success, false if directory creation or copy fails
	*/
	public function duplicate_file( object $options) : bool {

		//options
		$source_file	= $options->source_file;
		$target_file	= $options->target_file;

		// target directory check
			$target_dir = pathinfo($target_file)['dirname'];

			// if the target directory doesn't exist create it.
			$check_directory = create_directory($target_dir, 0750);

			if( $check_directory === false ) {
				return false;
			}

		// duplicate the file
		if( !copy($source_file, $target_file) ) {
			debug_log(__METHOD__
				. " Error on copy files [1]. Permission denied . The file is not duplicated" . PHP_EOL
				. ' source_file: ' . $source_file . PHP_EOL
				. ' target_file: ' . $target_file
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end duplicate_file




	/**
	* GET_SORTABLE
	* Indicates whether this component's values support user-controlled sort ordering.
	* Media components are not sortable by default (they represent a single asset per
	* record), so this override hard-returns false. The comment in the doc saying
	* "Default is true" reflects the parent class behaviour; this subclass flips it.
	* @return bool - always false for media components
	* @test true
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* GET_ORIGINAL_FILES
	* (!) This method is commented out and superseded by get_quality_files('original').
	* Returns the full path of the original file/s found.
	* The original files are saved renamed but keeping the extension.
	* @return array $original_files - Array of full path files found
	*/
		// public function get_original_files() : array {

		// 	return $this->get_quality_files(
		// 		$this->get_original_quality()
		// 	);

		// 	/*$original_files = [];

		// 	// quality swap temporally
		// 		$initial_quality = $this->get_quality();
		// 		// change current component quality temporally
		// 		$original_quality = $this->get_original_quality();
		// 		$this->set_quality($original_quality);

		// 	// target_dir
		// 		$target_dir = $this->get_media_path_dir($original_quality);
		// 		if(!file_exists($target_dir)) {
		// 			debug_log(__METHOD__
		// 				. " target directory for originals do not exist " . PHP_EOL
		// 				. ' target_dir: ' . to_string($target_dir)
		// 				, logger::WARNING
		// 			);
		// 			return $original_files; // empty array
		// 		}

		// 	// ar_originals. list of original found files
		// 		$ar_originals	= [];
		// 		$findme			= $this->get_name() . '.';
		// 		if ($handle = opendir($target_dir)) {

		// 			while( false!==($file = readdir($handle)) ) {

		// 				// note that '.' and '..' are returned even
		// 				if( strpos($file, $findme)!==false ) {
		// 					$ar_originals[] = $file;
		// 				}
		// 			}
		// 			closedir($handle);
		// 		}

		// 	// check found files
		// 		$n = count($ar_originals);
		// 		if ($n===0) {

		// 			// no file found. Return empty array

		// 		}elseif($n===1) {

		// 			// all is OK, found 1 file as expected
		// 			$original_files[] = $target_dir . '/' . $ar_originals[0];

		// 		}else{

		// 			// more than one file are found
		// 			foreach ($ar_originals as $current_file) {
		// 				$original_files[] = $target_dir . '/' . $current_file;
		// 			}
		// 		}

		// 	// restore component quality
		// 		$this->set_quality($initial_quality);


		// 	return $original_files;*/
		// }//end get_original_files



	/**
	* GET_QUALITY_FILES
	* Scans the quality directory for all files whose basename begins with the
	* component's name stem (get_name() + '.'), regardless of extension. Returns
	* the full absolute paths of every matching file found.
	*
	* Multiple files can legitimately exist in the same directory when an original
	* upload (e.g. '.tiff') and its normalized copy ('.jpg') have both been retained.
	* The directory listing skips '.' and '..' but includes any extension.
	* Returns an empty array when the directory does not exist or contains no match.
	* @param string $quality - quality level to scan (e.g. 'original', 'modified')
	* @return array - absolute file paths of matching files found (may be empty)
	* @test true
	*/
	public function get_quality_files(string $quality) : array {

		$quality_files = [];

		// target_dir
			$target_dir = $this->get_media_path_dir($quality);
			if(!is_dir($target_dir)) {
				debug_log(__METHOD__
					. " target directory for quality '$quality' do not exist " . PHP_EOL
					. ' target_dir: ' . to_string($target_dir)
					, logger::WARNING
				);
				return $quality_files; // empty array
			}

		// ar_originals. list of original found files
			$ar_files	= [];
			$findme		= $this->get_name() . '.';
			if ($handle = opendir($target_dir)) {

				while( false!==($file = readdir($handle)) ) {

					// note that '.' and '..' are returned even
					if( strpos($file, $findme)!==false ) {
						$ar_files[] = $file;
					}
				}
				closedir($handle);
			}

		// add path with image
			foreach ($ar_files as $current_file) {
				$quality_files[] = $target_dir . '/' . $current_file;
			}

		return $quality_files;
	}//end get_quality_files



	/**
	* GET_NORMALIZED_NAME_FROM_FILES
	* Resolves the canonical filename (with extension) for the given quality by
	* inspecting physical files on disk via get_quality_files(). Used to populate
	* 'original_normalized_name' and 'modified_normalized_name' in component data.
	*
	* Disambiguation when multiple files exist (e.g. both '.tiff' and '.jpg'):
	* 1. Try to match a file whose extension appears in get_best_extensions() (ordered
	*    preference list defined by the concrete subclass).
	* 2. Fallback: sort by ctime (oldest → newest) and pick the first file whose
	*    extension is neither the default extension nor an alternative extension but
	*    is in the allowed-extensions list — this usually identifies the raw upload.
	* 3. Last resort: return the first entry in the ctime-sorted list.
	*
	* Returns null when no matching file is found in the quality directory.
	* @param string $quality - quality level to inspect, e.g. 'modified'
	* @return string|null - basename like 'rsc29_rsc170_1070.tiff', or null
	* @test true
	*/
	public function get_normalized_name_from_files(string $quality) : ?string {

		// short vars
			$quality_files		= $this->get_quality_files($quality);
			$default_extension	= $this->get_extension();
			$count				= count( $quality_files );
			$file				= null;

		if($count === 1){

			// only one file exists. Use this file without any other verification
			$file = $quality_files[0];

		}else if($count > 1){

			// more than one file

			// collect files information about modification_time, extension, ..
				$ar_file_object = [];
				foreach ($quality_files as $current_file) {

					$file_object = new stdClass();
						$file_object->modification_time	= filectime($current_file);
						$file_object->extension			= get_file_extension($current_file);
						$file_object->file				= $current_file;

					$ar_file_object[] = $file_object;
				}

			// search file by best_extensions in descending order
				$best_extensions = $this->get_best_extensions();
				foreach ($best_extensions as $current_extension) {
					$found = array_find($ar_file_object, function($current_file) use($current_extension){
						return $current_file->extension === $current_extension;
					});
					if(is_object($found)){
						$file = $found->file;
						break;
					}
				}

			// fallback search by modification_time in descending order
				if(!isset($file)){

					usort($ar_file_object, fn($a, $b) => $a->modification_time - $b->modification_time);
					// iterate from oldest to newest
					foreach ($ar_file_object as $file_object) {

						if( $file_object->extension !== $default_extension // not default (usually jpg)
							&& !in_array($file_object->extension, $this->get_alternative_extensions()) // not alternative
							&& in_array($file_object->extension, $this->get_allowed_extensions()) // is allowed extension
							){

								$file = $file_object->file;
								break;
						}
					}
					// last fallback. Use first file allowing main extension and alternatives
					if(!isset($file)){
						$file = $ar_file_object[0]->file ?? null;
					}
				}
		}

		if(isset($file)){

			// normalized_name as 'rsc29_rsc170_1070.tiff'
			$normalized_name = basename($file);

			return $normalized_name;
		}


		return null;
	}//end get_normalized_name_from_files



	/**
	* GET_UPLOADED_FILE
	* Returns the absolute filesystem path of the uploaded (source) file for the
	* given quality level, combining the quality directory with the stored or
	* disk-resolved normalized filename.
	*
	* Resolution order:
	* 1. Read data[0]->{quality}_normalized_name (e.g. 'original_normalized_name').
	* 2. If not stored, fall back to get_normalized_name_from_files($quality) which
	*    scans the filesystem.
	*
	* Returns null when neither source yields a filename, or when the filename is empty.
	* @param string $quality - quality level to look up (e.g. 'original', 'modified')
	* @return string|null - absolute path like '/srv/dedalo/media/image/original/0/rsc29_rsc170_1.tiff', or null
	* @test true
	*/
	public function get_uploaded_file(string $quality) : ?string {

		$uploaded_file = null;

		// short vars
			$data			= $this->get_data();
			$property_name	= $quality . '_normalized_name';
			$file_name		= null;

		if (isset($data[0]) && isset($data[0]->{$property_name})) {

			// already in data case
			$file_name = $data[0]->{$property_name};

		}else{

			// calculated form files
			$normalized_name = $this->get_normalized_name_from_files( $quality );
			if (!empty($normalized_name)) {
				$file_name = $normalized_name;
			}
		}

		if (!empty($file_name)) {
			$uploaded_file = $this->get_media_path_dir($quality) .'/'. $file_name;
		}


		return $uploaded_file;
	}//end get_uploaded_file



	/**
	* GET_QUALITY_FILE_INFO
	* Reads metadata for the file at the given quality + extension combination and
	* returns a file-info object conforming to the files_info item schema.
	*
	* Two fast-return paths before hitting the filesystem:
	* - External source: returns a synthetic object with file_exist=true and the
	*   external URL as file_path (no disk stat performed).
	* - File not found: returns a placeholder object with file_exist=false and
	*   all other fields null.
	*
	* When the file exists, the returned object includes:
	* - file_name: basename of the file.
	* - file_path: path relative to DEDALO_MEDIA_PATH (not absolute).
	* - file_size: bytes via @filesize() (null on any failure).
	* - file_time: dd_date object built from filemtime() (content-change time).
	* - extension: the resolved extension used for the lookup.
	* - file_exist: true (double-checked after reading metadata).
	*
	* Note: file_url is intentionally omitted (commented out) from the returned
	* object; callers that need a URL should call get_url() separately.
	*
	* Result object shape:
	* {
	*   quality    : string,
	*   file_exist : bool,
	*   file_name  : string|null,
	*   file_path  : string|null, // relative to DEDALO_MEDIA_PATH
	*   file_size  : int|null,    // bytes
	*   file_time  : dd_date|null,
	*   extension  : string|null,
	*   external   : bool          // only set when true (external source path)
	* }
	* @param string $quality - quality level (e.g. '50MB', 'thumb')
	* @param string|null $extension = null - file extension; defaults to get_extension()
	* @return object - file-info data object
	* @test true
	*/
	public function get_quality_file_info( string $quality, ?string $extension=null ) : object {

		// external source (link to image outside Dédalo media)
			$external_source = $this->get_external_source();
			if(!empty($external_source)){

				$extension = pathinfo($external_source)['extension'];

				$data_item = (object)[
					'quality'		=> $quality,
					'file_exist'	=> true,
					'file_name'		=> null,
					'file_path'		=> $external_source,
					// 'file_url'		=> $external_source,
					'file_size'		=> null,
					'file_time'		=> null,
					'extension'		=> $extension,
					'external'		=> true
				];
				return $data_item;
			}

		// file path
			$file_path = $this->get_media_filepath($quality, $extension);
			// original could override default path
				// if ($quality===DEDALO_IMAGE_QUALITY_ORIGINAL) {
				// 	$raw_path = $this->get_original_file_path($quality);
				// 	if ($raw_path!==$file_path) {
				// 		$file_path = $raw_path;
				// 	}
				// }

		// file_exist
			$file_exist	= !empty($file_path)
				? file_exists($file_path)
				: false;

		// no file case
			if ($file_exist===false) {

				$data_item = (object)[
					'quality'		=> $quality,
					'file_exist'	=> false,
					'file_name'		=> null,
					'file_path'		=> null,
					// 'file_url'		=> null,
					'file_size'		=> null,
					'file_time'		=> null,
					'extension'		=> null
				];
				return $data_item;
			}

		// file_name
			$file_name = basename($file_path);

		// file_url
			// $file_url = $this->get_url(
			// 	$quality, // string quality
			// 	true, // bool test_file
			// 	false, // bool absolute
			// 	true // bool default_add
			// );
			// if ($quality==='original') {
			// 	// replace default extension for the real file extension
			// 	$path_parts	= pathinfo($file_path);
			// 	$url_parts	= pathinfo($file_url);
			// 	if($url_parts['extension']!==$path_parts['extension']) {
			// 		$file_url = $url_parts['dirname'].'/'.$url_parts['filename'].'.'.$path_parts['extension'];
			// 	}
			// }

		// file_size
			$file_size = (function() use($file_path) {
				try {
					$size = @filesize($file_path);
				} catch (Exception $e) {
					debug_log(__METHOD__
						. " Error on read file size. (Exception)" . PHP_EOL
						. $e->getMessage()
						, logger::ERROR
					);
				}
				return $size ?? null; // in bytes
			 })();

		// file_time (creation or modification date timestamp). The time when the content of the file was changed
			$file_time					= date("Y-m-d H:i:s", filemtime($file_path));
			$file_time_dd				= dd_date::get_dd_date_from_timestamp($file_time);
			$file_time_dd->set_time( dd_date::convert_date_to_seconds($file_time_dd) );
			$file_time_dd->set_timestamp($file_time);

		// media_attributes
			// $media_attributes = $this->get_media_attributes($file_path);

		// file_exists
			$file_exist = file_exists($file_path);

		// file_path relative
			$file_path_relative = str_replace(DEDALO_MEDIA_PATH, '', $file_path);

		// add quality file info
			$data_item = (object)[
				'quality'		=> $quality,
				'file_exist'	=> $file_exist,
				'file_name'		=> $file_name,
				'file_path'		=> $file_path_relative,
				// 'file_url'		=> $file_url,
				'file_size'		=> $file_size,
				'file_time'		=> $file_time_dd,
				'extension'		=> $extension
			];


		return $data_item;
	}//end get_quality_file_info



	/**
	* GET_TARGET_FILENAME
	* Returns the full filename (stem + extension) for the web/default quality version.
	* Combines the component id with the primary extension, e.g. 'rsc29_rsc170_1363.jpg'.
	* Used by get_original_extension() to detect whether a file in the original
	* directory is a raw upload versus the converted normalized copy.
	* @return string - filename with extension, e.g. 'rsc29_rsc170_1363.jpg'
	* @test true
	*/
	public function get_target_filename() : string {

		$target_filename = $this->id .'.'. $this->get_extension();

		return $target_filename;
	}//end get_target_filename



	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Finds the first quality level (from get_ar_quality(), ordered large to small)
	* that has an existing file and can be used as the transcoding source for
	* $target_quality. Skips $target_quality itself and the 'original' quality.
	*
	* Returns null when no suitable source is found (e.g. no files uploaded yet).
	* Used by build_version() when the direct original is not available and a
	* downsample from an intermediate quality is preferred.
	* @param string $target_quality - the quality level being built
	* @return string|null - quality level string to use as source, or null
	* @test true
	*/
	public function get_source_quality_to_build(string $target_quality) : ?string {

		$ar_quality			= $this->get_ar_quality();
		$original_quality	= $this->get_original_quality();
		foreach($ar_quality as $current_quality) {

			if ($target_quality!==$original_quality && $target_quality!==$current_quality) {
				// check file
				$filename = $this->get_original_file_path();
				if (!empty($filename) && file_exists($filename)) {
					return $current_quality;
				}
			}
		}//end foreach($ar_quality as $quality)


		return null;
	}//end get_source_quality_to_build



	/**
	* GET_ORIGINAL_EXTENSION
	* Determines the file extension of the raw uploaded original file in the original
	* quality directory.
	*
	* When a non-standard format is uploaded (e.g. '.tiff', '.raw', '.mov'), it is
	* converted to the component's default extension but the original is kept alongside.
	* This method distinguishes the two:
	* - exclude_converted=true (default): skips any file whose full name matches
	*   get_target_filename() (i.e. the standard normalized copy) and returns the
	*   extension of the remaining raw file.
	* - exclude_converted=false: returns the extension of any file in the directory.
	*
	* When exactly one qualifying file is found, its extension is returned. When none
	* are found, null is returned. When multiple are found, the first whose extension
	* differs from the default extension is returned (a trigger_error is issued if
	* all remaining files share the default extension — this indicates an unexpected
	* filesystem state).
	* @param bool $exclude_converted = true - if true, skip files with the default extension
	* @return string|null - extension string like 'tiff', 'mov', or null when not found
	* @test true
	*/
	public function get_original_extension(bool $exclude_converted=true) : ?string {

		$result = null;

		// original_files (from component_media_common)
			// $original_files	= $this->get_original_files(); // return array
			$original_files	= $this->get_quality_files(
				$this->get_original_quality()
			);

		// ar_originals
			$ar_originals = [];
			foreach ($original_files as $current_file) {
				if ($exclude_converted===true) {
					// Besides, verify that extension is different to dedalo extension (like .tiff)
					if (strpos($current_file, $this->get_target_filename())===false) {
						$ar_originals[] = $current_file;
					}
				}else{
					// Included all originals (with all extensions)
					$ar_originals[] = $current_file;
				}
			}

		// check found files
			$n = count($ar_originals);
			if ($n===0) {

				// no file found. Return null

			}elseif($n===1) {

				// all is OK, found 1 file as expected
				$ext	= pathinfo($ar_originals[0], PATHINFO_EXTENSION);
				$result	= $ext;

			}else{

				// ! more than one file are found
				foreach ($ar_originals as $current_original) {

					$ext				= pathinfo($current_original, PATHINFO_EXTENSION);
					$default_extension	= $this->get_extension();
					if( strtolower($ext)!==strtolower($default_extension) ) {
						$result = $ext;
						break;
					}
				}
				if(!isset($ext)) {
					trigger_error('Error Processing Request. Too much original files found and all have invalid extension ('.$n.')');
					#throw new Exception("Error Processing Request. Too much original files found", 1);
				}
			}


		return $result;
	}//end get_original_extension



	/**
	* GET_ORIGINAL_FILE_PATH
	* Returns the absolute filesystem path of the original uploaded file.
	*
	* When the original directory contains both a raw upload (e.g. '.tiff') and its
	* normalized copy (e.g. '.jpg'), this method prefers the normalized copy by
	* filtering to the file whose extension matches get_extension(). This ensures
	* that build_version() uses the already-converted file as its source rather than
	* re-converting a potentially large raw original.
	*
	* Returns null when no original file is found. Logs an error (SHOW_DEBUG only)
	* when more than one file survives the extension filter.
	* @return string|null - absolute path to the original file, or null
	* @test true
	*/
	public function get_original_file_path() : ?string {

		$result = null;

		// original_files (from component_media_common)
			$ar_originals = $this->get_quality_files(
				$this->get_original_quality()
			);

		// remove conversions if exists
			$n = count($ar_originals);
			if ($n>1) {
				foreach ($ar_originals as $file) {

					$ext				= pathinfo($file, PATHINFO_EXTENSION);
					$default_extension	= $this->get_extension();
					if(strtolower($ext)===strtolower($default_extension)) {
						// overwrite ar_originals with only one value
						$ar_originals = [$file];
						break;
					}
				}
			}

		// check found files
			$n = count($ar_originals);
			if ($n===0) {

				// no file found. Return null

			}elseif($n===1) {

				// all is OK, found 1 file as expected
				$result = $ar_originals[0];

			}else{

				// ! more than one file are found
				if(SHOW_DEBUG===true) {
					dump($ar_originals, "ar_originals ".to_string($ar_originals));
					// trigger_error("ERROR (DEBUG ONLY): Current quality have more than one file. ".to_string($ar_originals));
					debug_log(__METHOD__
						. " ERROR (DEBUG ONLY): Current quality have more than one file.  " . PHP_EOL
						. ' ar_originals: ' . to_string($ar_originals)
						, logger::ERROR
					);
				}
			}


		return $result;
	}//end get_original_file_path



	/**
	* SANITIZE_QUALITY
	* SEC-065 / MEDIA-04 / MEDIA-05: validates and sanitizes $quality before it is
	* interpolated into filesystem paths or URLs. Only alphanumeric characters,
	* underscores, hyphens, and dots are permitted; pure-dot tokens ('.' / '..')
	* are explicitly rejected to prevent directory traversal escapes.
	* On a mismatch the method logs an ERROR and falls back to get_original_quality().
	* Called by get_media_path_dir() and get_media_url_dir() on every invocation.
	* @param string $quality - raw quality value to validate
	* @return string - the original $quality if valid, or get_original_quality() on rejection
	*/
	private function sanitize_quality(string $quality) : string {

		if ($quality==='.' || $quality==='..' || preg_match('/^[<>]?[A-Za-z0-9_\-\.]+$/', $quality) !== 1) {
			debug_log(__METHOD__
				. ' SEC-065/MEDIA-04: rejecting unsafe quality: ' . to_string($quality)
				, logger::ERROR
			);
			return (string)$this->get_original_quality();
		}

		return $quality;
	}//end sanitize_quality



	/**
	* GET_MEDIA_PATH_DIR
	* Returns the absolute filesystem directory path for media files at the given
	* quality level, e.g. '/srv/dedalo/media/pdf/web/0'.
	*
	* Path construction: DEDALO_MEDIA_PATH + folder + initial_media_path + '/' + quality + additional_path
	* When external_source is set, the directory is derived from the external URL's
	* dirname instead of the local media tree.
	* $quality is sanitized through sanitize_quality() (SEC-065/MEDIA-04/MEDIA-05)
	* before being appended to any path.
	* @param string $quality - quality level, e.g. 'original', '1.5MB'
	* @return string - absolute directory path (may not exist yet)
	* @test true
	*/
	public function get_media_path_dir(string $quality) : string {

		// SEC-065 / MEDIA-05: confine $quality before it reaches the filesystem path.
		$quality = $this->sanitize_quality($quality);

		if(isset($this->external_source)) {

			$external_parts		= pathinfo($this->external_source);
			$media_path			= $external_parts['dirname'];

		}else{

			$initial_media_path	= $this->initial_media_path ?? '';
			$additional_path	= $this->additional_path ?? '';
			$folder				= $this->get_folder(); // like '/svg'
			$base_path			= $folder . $initial_media_path . '/' . $quality . $additional_path;
			$media_path			= DEDALO_MEDIA_PATH . $base_path;
		}


		return $media_path;
	}//end get_media_path_dir



	/**
	* GET_MEDIA_URL_DIR
	* Returns the relative URL directory path for media files at the given quality level.
	* Example: '/dedalo/media/image/standard/0'
	*
	* URL construction: DEDALO_MEDIA_URL + folder + initial_media_path + '/' + quality + additional_path
	* Mirrors get_media_path_dir() but uses DEDALO_MEDIA_URL instead of DEDALO_MEDIA_PATH.
	* Leading double-slashes are collapsed (e.g. '//dedalo/…' → '/dedalo/…').
	* $quality is sanitized via sanitize_quality() for parity with get_media_path_dir().
	* @param string $quality - quality level, e.g. 'standard'
	* @return string - relative URL directory (no trailing slash)
	* @test true
	*/
	public function get_media_url_dir(string $quality) : string {

		// MEDIA-04: validate $quality here too (parity with get_media_path_dir) so the
		// URL and filesystem path stay consistent and no raw client value is reflected.
		$quality = $this->sanitize_quality($quality);

		$initial_media_path	= $this->initial_media_path;
		$additional_path	= $this->additional_path;
		$folder				= $this->get_folder(); // like '/svg'
		$base_path			= $folder . $initial_media_path . '/' . $quality . $additional_path;
		$media_dir			= DEDALO_MEDIA_URL . $base_path;

		// remove possible double slashes ad beginning
		$media_url_dir = preg_replace('/^\/\//', '/', $media_dir);


		return $media_url_dir;
	}//end get_media_url_dir



	/**
	* GET_URL
	* Builds the URL for the media file at the requested quality level.
	*
	* Behaviour matrix:
	* - External source configured: returns the external URL directly, ignoring all other params.
	* - TM (time-machine) mode: scans the 'deleted/' sub-directory for the most recently
	*   deleted file matching this component's id and returns its URL. This allows the UI
	*   to preview what was current at a historical point in time.
	* - Normal mode: constructs URL as get_media_url_dir(quality) + '/' + id + '.' + extension.
	* - test_file=true: does a file_exists() check on disk. If the file is absent:
	*   - default_add=false → returns null.
	*   - default_add=true  → returns the Dédalo placeholder image (0.jpg from the theme).
	* - absolute=true: prepends DEDALO_PROTOCOL + DEDALO_HOST for a fully-qualified URL.
	*
	* (!) The @param type annotation says "string|bool $quality" but the PHP signature
	* uses ?string. The bool form is not meaningful — pass null or a string.
	* @param ?string $quality = null - quality level; defaults to get_quality() when null or empty
	* @param bool $test_file = false - if true, verify the file exists before returning the URL
	* @param bool $absolute = false - if true, prepend protocol + host to produce absolute URL
	* @param bool $default_add = false - if true, return placeholder URL when file is missing
	* @return string|null - URL string, or null when test_file=true and file missing with default_add=false
	* @test true
	*/
	public function get_url( ?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=false ) : ?string {

		// quality fallback to default
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// external source (link to image outside Dédalo media)
			$external_source = $this->get_external_source();
			if(!empty($external_source)){
				$url = $external_source;
				return $url;
			}

		// image id
			$id = $this->get_id();

		// url
			$url = $this->get_media_url_dir($quality) .'/'. $id .'.'. $this->get_extension();
			// tm mode case
			if ($this->mode==='tm' || $this->data_source==='tm') {

				// get last deleted file
				$last_deleted_file = get_last_modified_file(
					$this->get_media_path_dir($quality).'/deleted',
					[$this->get_extension()],
					function($el) use($id) {
						$needle = '/'.$id.'_deleted';
						if (strpos($el, $needle)!==false) {
							return true;
						}
						return false;
					}
				);
				if (!empty($last_deleted_file)) {
					$separator	= '/deleted/';
					$parts		= explode($separator, $last_deleted_file);
					$url		= $this->get_media_url_dir($quality) .$separator. $parts[1];
				}
			}

		// File exists test : If not, show '0' dedalo image logo
			if($test_file===true) {
				$file = $this->get_media_filepath($quality);
				if(!file_exists($file)) {
					if ($default_add===false) {
						return null;
					}
					$default_url = DEDALO_CORE_URL . '/themes/default/0.jpg';
					// remove possible double slashes ad beginning
					$url = preg_replace('/^\/\//', '/', $default_url);
				}
			}

		// Absolute (Default false)
			if ($absolute===true) {
				$url = DEDALO_PROTOCOL . DEDALO_HOST . $url;
			}


		return $url;
	}//end get_url



	/**
	* GET_THUMB_URL
	* Returns the relative URL for the thumbnail/posterframe image.
	* Convenience wrapper around get_url() that fixes the quality to get_thumb_quality().
	* Uses test_file=false, absolute=false, default_add=false — returns null when the
	* thumb does not yet exist (e.g. before create_thumb() has been called).
	* @return string|null - relative thumbnail URL, or null when the thumb is absent
	*/
	public function get_thumb_url() : ?string {

		$thumb_quality = $this->get_thumb_quality();

		# target data (target quality is thumb)
		$image_thumb_url = $this->get_url(
			$thumb_quality,
			false,  // bool test_file
			false,  // bool absolute
			false // bool default_add
		);

		return $image_thumb_url;
	}//end get_thumb_url



	/**
	* DELETE_NORMALIZED_FILES
	* Removes all derived (transcoded/normalized) files for the 'normalized' quality
	* levels (original + default, from get_normalized_ar_quality()), and all alternative
	* extension variants, while preserving the raw uploaded source file.
	*
	* For each quality, the file is only moved to 'deleted/' if:
	* - It exists on disk AND
	* - Either no uploaded source exists for that quality (uploaded_file===null), OR
	*   the file differs from the uploaded source (media_filepath !== uploaded_file)
	*   AND the uploaded source itself exists.
	*
	* This ensures the raw upload is never accidentally deleted, even if it happens to
	* share a path with the normalized output (e.g. when the upload extension matches
	* the default extension and no conversion was needed).
	*
	* Called by regenerate_component() with delete_normalized_files=true before
	* rebuilding versions from a freshly uploaded original.
	* @return bool - true on success; false if any individual file move fails
	*/
	public function delete_normalized_files() : bool {

		// component defined normalized qualities to be delete. This NOT includes 'original' quality.
		$ar_quality = $this->get_normalized_ar_quality();

		$alternative_extensions	= $this->get_alternative_extensions() ?? [];

		foreach ($ar_quality as $quality) {

			// uploaded_file full file path try
			$uploaded_file = $quality===$this->get_default_quality()
				? null
				: $this->get_uploaded_file($quality);

			// media_filepath
			$media_filepath = $this->get_media_filepath(
				$quality
			);

			if ( file_exists($media_filepath)
				&& ( $uploaded_file===null || ($media_filepath!==$uploaded_file && file_exists($uploaded_file)) )
			) {

				$move_file_options = new stdClass();
					$move_file_options->quality			= $quality;
					$move_file_options->file			= $media_filepath;
					$move_file_options->bulk_process_id	= $this->bulk_process_id ?? null;
					$move_file_options->file_name		= $this->get_name();

				$move_file = $this->move_deleted_file( $move_file_options );

				if (!$move_file) {
					debug_log(__METHOD__
						. " Error on delete media_filepath file " . PHP_EOL
						. ' media_filepath: ' . $media_filepath
						, logger::ERROR
					);
					return false;
				}
			}

			foreach ($alternative_extensions as $alternative_extension) {

				$alternative_path = $this->get_media_filepath($quality, $alternative_extension);

				if ( file_exists($alternative_path)
					&& ( $uploaded_file===null || ($alternative_path!==$uploaded_file && file_exists($uploaded_file)) )
				) {

					$move_file_options = new stdClass();
						$move_file_options->quality			= $quality;
						$move_file_options->file			= $alternative_path;
						$move_file_options->bulk_process_id	= $this->bulk_process_id ?? null;
						$move_file_options->file_name		= $this->get_name();

					$move_file = $this->move_deleted_file( $move_file_options );
					if (!$move_file) {
						debug_log(__METHOD__
							. " Error on delete alternative version file " . PHP_EOL
							. ' current_path: ' . $alternative_path
							, logger::ERROR
						);
						return false;
					}
				}
			}
		}


		return true;
	}//end delete_normalized_files



	/**
	* REGENERATE_COMPONENT
	* Performs a full rebuild of this component's media pipeline from the stored
	* original upload. This is the central entry-point for tool_update_cache and
	* any batch re-processing workflow.
	*
	* Pipeline steps:
	* 1. Optionally delete all derived files via delete_normalized_files()
	*    (controlled by options->delete_normalized_files, default true).
	* 2. Ensure the default quality file exists; build it from the original if missing
	*    or if a stale version persists after a failed delete step.
	* 3. Build any missing alternative-extension versions of the default quality.
	* 4. Recreate the thumbnail.
	* 5. Refresh files_info in component data via update_component_data_files_info()
	*    (without saving yet).
	* 6. Populate original_file_name, original_normalized_name, original_upload_date,
	*    modified_normalized_name, and modified_upload_date in data[0] from disk state.
	* 7. Save the component.
	*
	* Returns false when:
	* - update_component_data_files_info() finds no files (data is null).
	* - data[0] is not an object (corrupt data).
	* @see class.tool_update_cache.php
	* @param object|null $options = null - { delete_normalized_files?: bool }
	* @return bool - true on successful rebuild and save; false on any failure
	* @test true
	*/
	public function regenerate_component( ?object $options=null ) : bool {

		// Options
			$delete_normalized_files = $options->delete_normalized_files ?? true;

		// full remove the original files except the uploaded file (.pdf, .tiff, .psd, .mov etc)
			if( $delete_normalized_files===true ){
				$this->delete_normalized_files();
			}

		// check default quality
			$default_quality	= $this->get_default_quality();
			$file_path			= $this->get_media_filepath($default_quality);

			if (!file_exists($file_path)) {
				$this->build_version($default_quality);
			}else if($delete_normalized_files===true && $this->quality !== $default_quality){
				// Fallback safety net: default quality file still exists after delete_normalized_files.
				// This can happen if move_deleted_file failed inside delete_normalized_files.
				// Move the stale file to deleted and rebuild from the new original.
				$move_file_options = new stdClass();
					$move_file_options->quality			= $default_quality;
					$move_file_options->file			= $file_path;
					$move_file_options->bulk_process_id	= $this->bulk_process_id ?? null;
					$move_file_options->file_name		= $this->get_name();
				$this->move_deleted_file( $move_file_options );
				$this->build_version($default_quality);
			}else if($this->quality === $this->get_original_quality() && $this->quality !== $default_quality && file_exists($file_path)){
				// Safety net: new original was uploaded but delete_normalized_files is false.
				// The default quality file may be stale and needs to be rebuilt from the new original.
				// This handles cases where delete_normalized_files was incorrectly set to false
				// (e.g., get_original_extension() returned a wrong value due to leftover files).
				$move_file_options = new stdClass();
					$move_file_options->quality			= $default_quality;
					$move_file_options->file			= $file_path;
					$move_file_options->bulk_process_id	= $this->bulk_process_id ?? null;
					$move_file_options->file_name		= $this->get_name();
				$this->move_deleted_file( $move_file_options );
				$this->build_version($default_quality);
			}

		// check alternatives
			$alternative_extensions	= $this->get_alternative_extensions() ?? [];
			foreach ($alternative_extensions as $current_extension) {

				$alternative_source_file = $this->get_media_filepath($default_quality, $current_extension);
				if (!file_exists($alternative_source_file)) {
					$this->build_version($default_quality);
				}
			}

		// thumb. Re-create thumb always (from current posterframe file)
			$this->create_thumb();

		// files_info. Updates component data files info values iterating available files
		// This action updates the component data ($this->get_data()) but does not save it
		// Note that this method is called again on save, but this is intentional
			$this->update_component_data_files_info();

		// data. Current updated stored data
			$data = $this->get_data();

		// empty case. Previous update_component_data_files_info generates
		// a new data if files are found. Else no data is set (null)
			if (empty($data)) {
				return false;
			}

		// bad data case
			if (isset($data[0]) && !is_object($data[0])) {
				debug_log(__METHOD__
					. " Invalid component data. Expected object and received array " . PHP_EOL
					. ' data: ' . to_string($data)
					, logger::ERROR
				);
				return false;
			}

		// original_file_name: from target_filename (use example: component_image rsc29)
		// When original_file_name is not defined, we look in the properties definition
		// to get the filename in the target_filename defined (as component_input_text)
			if (!isset($data[0]->original_file_name)) {

				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					// get the target filename defined in properties as `Original file name` rsc398
					$tipo  = $properties->target_filename;
					$model = ontology_node::get_model_by_tipo($tipo,true);
					$component = component_common::get_instance(
						$model, // string model
						$tipo, // string tipo
						$this->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$this->section_tipo // string section_tipo
					);
					$filename_data = $component->get_data();

					// original_file_name
					if( !empty($filename_data[0]) ) {

						$data[0]->original_file_name = $filename_data[0];

						// original_normalized_name
						if ( !isset($data[0]->original_normalized_name) ) {
							$data[0]->original_normalized_name = $this->get_id() .'.'. get_file_extension($filename_data[0]);
						}

						// original_upload_date
						if (!isset($data[0]->original_upload_date)) {

							$file_path = $this->get_media_path_dir( $this->get_original_quality() ) .'/'. $data[0]->original_normalized_name;
							if (file_exists($file_path)) {
								$modification_time				= filectime($file_path);
								$data[0]->original_upload_date	= !empty($modification_time)
									? dd_date::get_dd_date_from_unix_timestamp($modification_time)
									: null;
							}
						}
					}

					// replace existing data
					$this->set_data($data);
				}
			}

		// original_normalized_name
			if (!isset($data[0]->original_normalized_name)) {

				$original_quality = $this->get_original_quality();

				$original_normalized_name = $this->get_normalized_name_from_files(
					$original_quality
				);
				if (!empty($original_normalized_name)) {

					$data[0]->original_normalized_name = $original_normalized_name;

					// original_upload_date
					if (!isset($data[0]->original_upload_date)) {

						$file_path = $this->get_media_path_dir($original_quality) .'/'. $original_normalized_name;
						if (file_exists($file_path)) {
							$modification_time				= filectime($file_path);
							$data[0]->original_upload_date	= !empty($modification_time)
								? dd_date::get_dd_date_from_unix_timestamp($modification_time)
								: null;
						}
					}
				}
			}

		// modified_normalized_name
			if (!isset($data[0]->modified_normalized_name)) {

				$modified_quality = $this->get_modified_quality();

				// not all components has modified quality as component_pdf
				if(!empty($modified_quality)){
					$modified_normalized_name = $this->get_normalized_name_from_files(
						$modified_quality
					);
					if (!empty($modified_normalized_name)) {
						$data[0]->modified_normalized_name = $modified_normalized_name;

						// modified_upload_date
						if (!isset($data[0]->modified_upload_date)) {

							$file_path = $this->get_media_path_dir($modified_quality) .'/'. $modified_normalized_name;
							if (file_exists($file_path)) {
								$modification_time				= filectime($file_path);
								$data[0]->modified_upload_date	= !empty($modification_time)
									? dd_date::get_dd_date_from_unix_timestamp($modification_time)
									: null;
							}
						}
					}
				}
			}

		// save
			$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_MEDIA_FILEPATH
	* Returns the complete absolute filesystem path for a specific quality + extension
	* combination: get_media_path_dir(quality) + '/' + get_name() + '.' + extension.
	*
	* Falls back to get_quality() when $quality is null/empty, and to get_extension()
	* when $extension is null/empty.
	* Example result: '/srv/dedalo/media/images/1.5MB/0/rsc29_rsc170_1.avif'
	* @param string|null $quality = null - quality level; defaults to active quality
	* @param string|null $extension = null - file extension; defaults to primary extension
	* @return string - absolute file path (may not exist yet)
	* @test true
	*/
	public function get_media_filepath( ?string $quality=null, ?string $extension=null ) : string {

		// quality fallback
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// extension fallback
			if(empty($extension)) {
				$extension = $this->get_extension();
			}

		$path = $this->get_media_path_dir($quality) .'/'. $this->get_name() . '.' . $extension;


		return $path;
	}//end get_media_filepath



	/**
	* SET_QUALITY
	* Sets the active quality level for this instance, validating it against the
	* allowed list from get_ar_quality(). Rejected values are logged as ERROR and
	* false is returned without modifying $this->quality.
	* @param string $quality - desired quality level (must be in get_ar_quality())
	* @return bool - true when the quality was accepted and set; false when rejected
	* @test true
	*/
	public function set_quality(string $quality) : bool {

		$ar_valid = $this->get_ar_quality();
		if(!in_array($quality, $ar_valid)) {
			debug_log(__METHOD__
				. " quality: '$quality' is not an accepted value as quality (ignored set action). ".get_called_class(). PHP_EOL
				. ". Please configure media options in config.php - tipo: ".$this->tipo
				, logger::ERROR
			);
			return false;
		}

		$this->quality = $quality;

		return true;
	}//end set_quality



	/**
	* GET_SIZE
	* Returns the human-readable file size for the given quality level's primary file.
	* Values are rounded and returned with a unit suffix ('KB' or 'MB').
	* Returns null when the file does not exist or filesize() fails.
	*
	* Note: the path is constructed without a directory separator between
	* get_media_path_dir() and get_name(), relying on get_media_path_dir() NOT
	* ending with a slash. If that invariant ever changes, a '/' must be inserted.
	* @param string $quality - quality level to check (e.g. 'standard')
	* @return string|null - size string like '256 KB' or '1 MB', or null on error
	* @test true
	*/
	public function get_size(string $quality) : ?string {

		$filename = $this->get_media_path_dir($quality) . $this->get_name() . '.' . $this->get_extension() ;

		try {

			if(!file_exists($filename)) {
				return null;
			}

			$size		= @filesize($filename);
			if(!$size)	throw new Exception('Unknown size!');
		} catch (Exception $e) {
			#echo '',  $e->getMessage(), "\n";
			#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;
			return null;
		}

		$size_kb = round($size / 1024);

		if($size_kb <= 1024) {
			return $size_kb . ' KB';
		}

		return round($size_kb / 1024) . ' MB';
	}//end get_size



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* Restores the most recently deleted media file for each quality level by moving
	* it back from the 'deleted/' sub-directory to the live media path.
	*
	* Files in 'deleted/' are named with a datestamp suffix (e.g. 'id_deleted_2024-11-15_1430.jpg').
	* natsort() is applied to the glob result so that the lexicographically last entry
	* (i.e. the most recent deletion) is selected via end().
	*
	* Skips qualities for which no deleted file is found (with a WARNING log) rather than
	* failing the whole operation. Returns true if at least one file was restored.
	* Triggered by tool_time_machine::recover_section_from_time_machine.
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool - true if at least one file was restored; false if none could be moved
	* @test true
	*/
	public function restore_component_media_files() : bool {

		$result = false;

		// element restore
		$ar_quality	= $this->get_ar_quality();
		$extension	= $this->get_extension();
		foreach ($ar_quality as $current_quality) {

			// media_path
			$media_path	= $this->get_media_path_dir($current_quality) . '/deleted';
			$id			= $this->get_id();

			$file_pattern	= $media_path .'/'. $id .'_*.'. $extension;
			$ar_files		= glob($file_pattern);
			if (empty($ar_files)) {
				debug_log(__METHOD__
					." No files to restore were found for id:$id. Nothing was restored (1) "
					, logger::WARNING
				);
				continue; // Skip
			}

			natsort($ar_files);	// sort the files from newest to oldest
			$last_file_path	= end($ar_files);
			$new_file_path	= $this->get_media_filepath($current_quality);

			// move file
				if( !rename($last_file_path, $new_file_path) ) {
					debug_log(__METHOD__
						. " Error on move files to restore folder. Permission denied . Nothing was restored (2) " . PHP_EOL
						. 'last_file_path: '. $last_file_path . PHP_EOL
						. 'new_file_path: '. $new_file_path
						, logger::ERROR
					);
					// throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");
					continue; // Skip
				}

			// result true when at least one element is moved
				$result = true;

			// debug
				debug_log(__METHOD__
					." Moved file using restore_component_media_files:" .PHP_EOL
					.' last_file_path: '. $last_file_path . PHP_EOL
					.' new_file_path: '. $new_file_path
					, logger::WARNING
				);
		}//end foreach


		return $result;
	}//end restore_component_media_files



	/**
	* BUILD_VERSION
	* Creates a quality-level derivative from the original file. This base implementation
	* is a fallback that simply copies the original to the target quality directory.
	*
	* (!) Concrete subclasses MUST override this method to perform real transcoding or
	* resizing (component_image uses ImageMagick, component_av uses FFmpeg, etc.).
	* This copy-only default is intentional so that simple component types (component_svg)
	* can inherit a working pipeline without transcoding logic.
	*
	* Special case: when the target quality is the thumb quality, delegates immediately
	* to create_thumb() and returns its result.
	*
	* After copying, alternative-extension versions are built via create_alternative_version()
	* for each extension in get_alternative_extensions().
	* When $save=true, save() is called after all versions are built.
	*
	* CLI progress output (common::$pdata) is emitted when running_in_cli()===true.
	* @param string $quality - target quality level to build (e.g. '1.5MB')
	* @param bool $async = true - passed to subclass overrides (unused in base class)
	* @param bool $save = true - if true, call save() after building
	* @return object $response - {result: bool, msg: string, errors: string[]}
	* @test true
	*/
	public function build_version(string $quality, bool $async=true, bool $save=true) : object {
		$start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// thumb case
			if($quality===$this->get_thumb_quality()){
				// thumb quality
				$result = $this->create_thumb();

				$response->result	= $result;
				$response->msg		= $result===false ? 'Error building version' : 'OK request done';
				return $response;
			}

		// short vars
			$id					= $this->get_id();
			$original_quality	= $this->get_original_quality();
			$original_file_path	= $this->get_original_file_path();
			// check path from original file
			if (empty($original_file_path)) {
				$response->msg .= ' Invalid empty original_file_path. Skip conversion';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. " original_quality: " . $original_quality . PHP_EOL
					. ' original_file_path: ' . to_string($original_file_path) . PHP_EOL
					. ' model: ' . $this->get_model() . PHP_EOL
					. ' id: ' . $id . PHP_EOL
					. ' quality: ' .$quality . PHP_EOL
					. ' original_quality: ' . to_string($original_quality)
					, logger::WARNING
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

			// copy file from source quality to target quality
				$result = copy(
					$original_file_path, // from original quality directory
					$target_quality_path // to default quality directory
				);

			if ($result===false) {
				debug_log(__METHOD__ . PHP_EOL
					. " Error: Unable to build version file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::ERROR
				);
				$response->errors[] = 'building version failed';
			}else{
				debug_log(__METHOD__ . PHP_EOL
					. " Built file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::DEBUG
				);
			}

		// Alternative versions
			$alternative_convert_options = new stdClass();
			// 	$alternative_convert_options->resize = $resize;

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
					$current_extension,
					$alternative_convert_options
				);
			}

		// logger activity : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version (media common)',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $id,
					'quality'			=> $quality,
					'source_quality'	=> $original_quality,
					'target_quality'	=> $quality
				],
				logged_user_id() // int
			);

		// update component data files info and save
			if ($save===true) {
				$this->save();
			}

		// response
			$response->result	= true;
			$response->msg		= 'Copied file. Remember overwrite this method to real conversion';


		return $response;
	}//end build_version



	/**
	* UPDATE_COMPONENT_DATA_FILES_INFO
	* Scans the filesystem via get_files_info() and writes the result into the
	* component's in-memory data array under data[0]->files_info. Does NOT call save().
	*
	* Three data states are handled:
	* - data[0] already exists and is an object: replace only its files_info property.
	* - data[0] does not exist and files_info is non-empty: create a new data[0] object.
	* - data[0] does not exist and files_info is empty and data is empty: set data to null.
	* - data[0] does not exist but data already has content (unit-test case): leave as is.
	*
	* This method is the single authoritative writer of files_info into component data.
	* It is called by save() before every parent::save() so that the JSONB column always
	* reflects the current filesystem state.
	* @return bool - true on success; false when data[0] is not an object (data corruption)
	* @test true
	*/
	protected function update_component_data_files_info() : bool {

		// get files info
			// $files_info	= [];
			// $ar_quality = $this->get_ar_quality();
			// foreach ($ar_quality as $current_quality) {
			// 	// if ($current_quality==='thumb') continue;
			// 	// read file if exists to get file_info
			// 	$file_info = $this->get_quality_file_info($current_quality);
			// 	// add non empty quality files data
			// 	if (!empty($file_info) ) { // && $file_info->file_exist===true
			// 		$files_info[] = $file_info;
			// 	}
			// }

		// get files info
			$files_info	= $this->get_files_info(
				false // bool include_empty. Prevent to store empty quality files
			);

		// save component data
			$data = $this->get_data();
			if (isset($data[0])) {
				if (!is_object($data[0])) {

					// bad data case
					debug_log(__METHOD__
						." ERROR. BAD COMPONENT DATa " .PHP_EOL
						.' data:' . json_encode($data, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					return false;

				}else{

					// replace files info values
					$data[0]->files_info = $files_info;
				}
			}else{

				if (empty($files_info) && empty($data)) {

					$data = null;

				}else{

					if (empty($data)) {
						// create a new data from scratch
						$data_item = (object)[
							'files_info' => $files_info
						];
						$data = [$data_item];
					}else{
						// Leave data as is (used in test unit)
					}
				}
			}

		// updates data
			$this->set_data($data);


		return true;
	}//end update_component_data_files_info



	/**
	* SAVE
	* Overrides component_common::save() to refresh files_info from the filesystem
	* before persisting component data to the database.
	* update_component_data_files_info() is always called first; if it finds no files
	* and sets data to null, the parent save will store null in the JSONB column.
	* @return bool - result of parent::save()
	* @test true
	*/
	public function save() : bool {

		$this->update_component_data_files_info();

		return parent::save();
	}//end save







	/**
	* CREATE_ALTERNATIVE_VERSION
	* Stub for rendering a single alternative-format derivative (e.g. a WebP file from
	* a JPEG original). The base implementation does nothing useful — it only logs a
	* WARNING and returns true so the pipeline can continue without crashing.
	*
	* (!) Concrete subclasses must override this method to produce real alternative files.
	* For example, component_image uses ImageMagick to convert to WebP/AVIF.
	* @param string $quality - source quality level (e.g. 'standard')
	* @param string $extension - target extension for the alternative (e.g. 'webp')
	* @param object|null $options = null - component-specific conversion options
	* @return bool - always true in the base class (see subclass overrides for real results)
	*/
	public function create_alternative_version( string $quality, string $extension, ?object $options=null ) : bool {

		debug_log(__METHOD__
			. " Use specific component method to overwrite this ! $quality - $extension"
			, logger::WARNING
		);

		return true;
	}//end create_alternative_version



	/**
	* CREATE_ALTERNATIVE_VERSIONS
	* Iterates all quality levels × all alternative extensions and calls
	* create_alternative_version() for each combination. Skips the thumb quality.
	* This method overwrites any existing file with the same target path.
	* @param object|null $options = null - forwarded to create_alternative_version()
	* @return bool - always true (delegates success/failure tracking to the caller)
	*/
	public function create_alternative_versions( ?object $options=null ) : bool {

		$alternative_extensions	= $this->get_alternative_extensions() ?? [];
		$ar_quality				= $this->get_ar_quality();
		foreach ($ar_quality as $quality) {
			if ($quality===$this->get_thumb_quality()) {
				continue; // skip thumb quality
			}
			foreach ($alternative_extensions as $extension) {
				$this->create_alternative_version(
					$quality,
					$extension,
					$options
				);
			}
		}


		return true;
	}//end create_alternative_versions



	/**
	* DELETE_THUMB
	* Hard-deletes the thumbnail file from disk using unlink().
	* Unlike remove_component_media_files() this is a direct deletion, not a soft
	* move-to-deleted — thumbnail regeneration is cheap so versioned backup is
	* unnecessary.
	* After unlinking, save() is called to update files_info to reflect the absence.
	* Returns false and logs an ERROR if unlink fails (e.g. permissions issue).
	* @return bool - true on success; false when unlink fails
	*/
	public function delete_thumb() {

		// short vars
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// unlink file
			if ( !unlink($target_file) ) {
				debug_log(__METHOD__
					. " Error deleting thumb file. Unable to unlink file " . PHP_EOL
					. 'target_file: ' . to_string($target_file)
					, logger::ERROR
				);
				return false;
			}

		// save to force update data files_info
			$this->save();


		return true;
	}//end delete_thumb



	/**
	* GET_REGENERATE_OPTIONS
	* Returns the list of configurable option descriptors exposed to tool_update_cache
	* for batch regeneration runs. Each descriptor defines a parameter name, type,
	* and default value that the tool UI surfaces to the operator.
	*
	* Currently exposes:
	* - delete_normalized_files (boolean, default false): when true, derived files are
	*   removed before rebuilding, ensuring a clean slate. Default is false to avoid
	*   accidental mass-deletion in cautious batch runs.
	* @return array|null - option descriptor objects, or null when none are defined
	*/
	public static function get_regenerate_options() : ?array {

		$options = [];

		// delete_normalized_files
			$delete_normalized_files = new stdClass();
				$delete_normalized_files->name		= 'delete_normalized_files';
				$delete_normalized_files->type		= 'boolean';
				$delete_normalized_files->default	= false;

		$options[] = $delete_normalized_files;


		return $options;
	}//end get_regenerate_options



}//end component_media_common
