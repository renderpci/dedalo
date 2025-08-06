<?php declare(strict_types=1);
/**
* INTERFACE COMPONENT_MEDIA_COMMON
* Used as common base from all components that works with media
* like component_3d, component_av, component_image, component_pdf, component_svg
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
	public static function update_dato_version(object $options);
	public function remove_component_media_files(array $ar_quality=[]);
	public function regenerate_component();
	public function create_alternative_version(string $quality, string $extension, ?object $options=null);

}//end component_media_interface



/**
* CLASS COMPONENT_MEDIA_COMMON
* Used as common base from all components that works with media
* like component_3d, component_av, component_image, component_pdf, component_svg
*/
class component_media_common extends component_common {



	/**
	* CLASS VARS
	*/
		// string quality
		public $quality;
		// string additional_path. An optional file path to files to conform path as /media/images/my_initial_media_path/<1.5MB/..
		public $additional_path;
		// string initial_media_path
		public $initial_media_path;
		// string target_filename
		public $target_filename;
		// string target_dir
		public $target_dir;
		// string folder. From config element definitions like: DEDALO_PDF_FOLDER
		public $folder;
		// string id. Usually is a flat locator like 'dd522_dd128_1'
		public $id;
		// string extension. like 'mp4'
		public $extension;
		// external_source
		public $external_source;



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



	/* REMOVED !
		//	"original_file_name": "icon_link.svg",
		//	"original_file_upload_date": {
		//		"day": 27,
		//		"hour": 17,
		//		"time": 65009757539,
		//		"year": 2022,
		//		"month": 8,
		//		"minute": 58,
		//		"second": 59
		//	},
		*/



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {

		// lang. Force always DEDALO_DATA_NOLAN when is not translatable
		// (note that PDF can be translatable)
			$translatable = RecordObj_dd::get_translatable($tipo);
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
	* Return array with model names of defined as 'media components'.
	* Add future media components here
	* @return array
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
	* GET DATO
	*
	* Sample data:
	* [{
	*    "original_file_name": "poblado_raspa.jpg",
	*    "original_upload_date": {
	*      "day": 20,
	*      "hour": 17,
	*      "time": 65009152486,
	*      "year": 2022,
	*      "month": 8,
	*      "minute": 54,
	*      "second": 46
	*    }
	* }]
	* @return array|null $dato
	* 	(!) Note that in v5 data update could be different to null|array
	* 	Because this, do not apply type constrain here ! ( : ?array)
	* @test true
	*/
	public function get_dato() {

		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {
			$dato = [$dato];
		}

		return $dato;
	}//end get_dato



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $grid_cell_object
	* @test true
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// current_url. get from dato
			$dato = $this->get_dato();
			if(isset($dato)){

				$element_quality = ($this->mode==='edit')
					? $this->get_default_quality()
					: $this->get_thumb_quality();

				// Caller class name, the name of who instantiate the component
				// the URI resolution of the data depends of the caller
				// when is caller by tool_export it needs to be absolute (with the protocol and domain)
				// when is caller by tool_diffusion it needs to be relative (without the protocol and domain)
				switch ($this->caller) {
					case 'tool_export':
						$absolute = true;
						break;

					default:
						$absolute = false;
						break;
				}
				// get the URI of the data
				$current_url = $this->get_url(
					$element_quality, // string quality
					false, // bool test_file
					$absolute,  // bool absolute
					false // bool default_add
				);
			}else{
				$current_url = '';
			}

		// label
			$label = $this->get_label();

		// class_list
			$class_list = isset($ddo)
				? ($ddo->class_list ?? null)
				: null;

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('img');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_value([$current_url]);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	* @return string
	* @test true
	*/
	public function get_valor() {

		return $this->get_id() .'.'. $this->get_extension();
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
	* @test true
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : ?string {

		$element_quality	= $this->get_default_quality();
		$valor				= $this->get_url(
			$element_quality,
			true, // bool test_file, output dedalo image placeholder when not file exists
			true, // bool absolute, output absolute path like 'http://myhost/mypath/myimage.jpg'
			false // bool default_add
		);

		return $valor;
	}//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	* @test true
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// data
			$dato = $this->get_dato();
			if (empty($dato) || empty($dato[0])) {
				return null;
			}
			$files_info = $dato[0]->files_info ?? [];
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
	* Resolve the default diffusion data
	* is used by the `diffusion_data`
	* for component_section_id the default is its own data
	* @param object $ddo
	* @return array $diffusion_data
	*
	* @see class.diffusion_data.php
	* @test false
	*/
	public function get_diffusion_data( object $ddo ) : array {

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
				if( !function_exists($this->$fn) ){
					debug_log(__METHOD__
						. " function doesn't exist " . PHP_EOL
						. " function name: ". $fn
						, logger::ERROR
					);

					return $diffusion_data;
				}

				// not all functions are available for diffusion
				// in the function is allowed get its value and return
				// if the function is NOT allowed (default) return a diffusion value as null
				switch ($fn) {
					// functions allowed for diffusion environment
					case 'get_posterframe_url':

						$test_file		= $ddo->options->test_file ?? false;
						$absolute		= $ddo->options->absolute ?? false;
						$avoid_cache	= $ddo->options->avoid_cache ?? false;

						$diffusion_value = $this->{$fn}($test_file, $absolute, $avoid_cache);

						break;

					default:
						// function is not allowed for diffusion environment
						debug_log(__METHOD__
							. " function is can not be used by diffusion " . PHP_EOL
							. " function name: ". $fn
							, logger::ERROR
						);
						$diffusion_value = null;

						break;
				}
				// set the diffusion value and return the diffusion data
				$diffusion_data_object->set_value( $diffusion_value );
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
				$dato = $this->get_dato();
				if (empty($dato) || empty($dato[0])) {
					return $diffusion_data;
				}
				// get the files_info, it has the file_exist parameter that determinate if file exists in the media tree
				$files_info = $dato[0]->files_info ?? [];
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
	* GET_ID
	* @return string|null $id
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
						." Component dato (section_id: $this->section_id,section_tipo: $this->section_tipo) is empty"
						, logger::WARNING
					);
				}
				return null;
			}

		// get identifier
			$id	= $this->get_identifier();

		// add lang when translatable
			if (RecordObj_dd::get_translatable($this->tipo)===true){
				$id .= '_'.DEDALO_DATA_LANG;
			}

		// fix value
			$this->id = $id;


		return $id;
	}//end get_id



	/**
	* GET_NAME
	* Alias of get_id
	* @return string|null $id
	* @test true
	*/
	public function get_name() : ?string {

		return $this->get_id();
	}//end get_name



	/**
	* GET_INITIAL_MEDIA_PATH
	* Used by component_image, component_pdf
	* @return string|null $this->initial_media_path
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
	* Calculate item additional path from 'properties' json config.
	* Used by component_image, component_pdf
	* @return string|null $additional_path
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
			$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// valor
				$valor = trim($component->get_valor());

			// Add a slash at the beginning if it doesn't already exist
				if ( substr($valor, 0, 1)!=='/' ) {
					$valor = '/'.$valor;
				}

			// Remove the trailing slash if it exists
				if ( substr($valor, -1)==='/' ) {
					$valor = substr($valor, 0, -1);
				}

			// add
				$additional_path = $valor;
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
	* Extensions list of preferable extensions in original or modified qualities.
	* Ordered by most preferable extension, first is the best.
	* @return array
	* @test true
	*/
	public function get_best_extensions() : array {

		return [];
	}//end get_best_extensions



	/**
	* QUALITY_FILE_EXIST
	* Check if quality given file exists
	* @param string $quality
	* @return bool
	* @test true
	*/
	public function quality_file_exist(string $quality) : bool {

		$file_path_abs	= $this->get_media_filepath($quality);
		$file_exists	= file_exists($file_path_abs);

		return $file_exists;
	}//end quality_file_exist



	/**
	* ADD_FILE
	* Receive a file info object from tool upload
	* and move/rename the file to the proper target
	* @param object $options
	* {
	* 	"name": "montaje3.jpg",
	*	"type": "image/jpeg",
	*   "tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
	*	"tmp_name": "/private/var/tmp/php6nd4A2",
	*	"error": 0,
	*	"size": 132898
	* }
	* @return object $response
	* {
	* 	"original_file_name" : $name, // montaje3.jpg
	*	"full_file_name"	 : $full_file_name, // rsc29_rsc170_1.jpg
	*	"full_file_path"	 : $full_file_path // /media/image/original/0/rsc29_rsc170_1.jpg
	* }
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
			$source_file 	= $options->source_file ?? null;

		// source_file
			if (empty($tmp_dir) || !defined($tmp_dir)) {
				$msg = 'constant is not defined! tmp_dir: '. json_encode($tmp_dir);
				$response->msg .= $msg;
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' tmp_dir: ' . $tmp_dir
					, logger::ERROR
				);
				$response->errors[] = 'invalid tmp_dir value';
				return $response;
			}

			$user_id		= logged_user_id();
			$source_file	= isset($source_file)
				? $source_file
				: constant($tmp_dir). '/'. $user_id .'/'. rtrim($key_dir, '/') . '/' . $tmp_name;

		// check source file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' source_file: ' . $source_file
					, logger::ERROR
				);
				$response->errors[] = 'source file not found';
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
	* Overwrite this method on each component that's needed it, for example 'component_av'
	* @param string $tmp_name
	* @param string $folder_path
	* @param string $file_nam
	* @return object $response
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
	* @param $file_name string as 'test175_test65_3'
	* @param $folder_path string
	* @return object $response
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
	* @return bool
	* @test true
	*/
	public function valid_file_extension(string $file_extension) : bool {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return (bool)$valid;
	}//end valid_file_extension



	/**
	* GET_ALTERNATIVE_EXTENSIONS
	* 	Overwrite in each component like component_image do
	* @return array|null $alternative_extensions
	* @test true
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* PROCESS_UPLOADED_FILE
	* Dummy method. Overwrite it in each component
	* @param object|null $file_data
	* @param object|null $process_options
	* @return object $response
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
	* Get file info for every quality from disk
	* Included alternative_extensions files and original from original_normalized_name
	* @param bool $include_empty = false
	* @return array $files_info
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
		$extensions				= array_merge($extensions, $allowed_extensions);

		$alternative_extensions	= $this->get_alternative_extensions() ?? [];
		$extensions				= array_merge( $extensions, $alternative_extensions);

		$unique_extensions		= array_unique($extensions);
		$dato					= $this->get_dato();

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
			if (isset($dato[0]) && isset($dato[0]->original_normalized_name)) {

				$original_quality	= $this->get_original_quality();
				$file_extension		= get_file_extension($dato[0]->original_normalized_name);

				// original file like 'memoria_oral_presentacion.mov'
					$original_file_path	= $this->get_media_path_dir($original_quality) .'/'. $dato[0]->original_normalized_name;
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
			if (isset($dato[0]) && isset($dato[0]->modified_normalized_name)) {

				$modified_quality	= $this->get_modified_quality();
				$file_extension		= get_file_extension($dato[0]->modified_normalized_name);

				// original file like 'memoria_oral_presentacion.mov'
					$modified_file_path	= $this->get_media_path_dir($modified_quality) .'/'. $dato[0]->modified_normalized_name;
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
	* Creates a list of file info items iterating all qualities from
	* the component dato
	* @return array $datalist
	* @test true
	*/
	public function get_datalist() : array {

		// files_info from files
			// $files_info = $this->get_files_info(
			// 	true // bool include_empty
			// );

		// from component DDBB data
			$dato = $this->get_dato();
			$files_info = isset($dato[0]) && isset($dato[0]->files_info)
				? $dato[0]->files_info
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
	* Reduced version of get_dato to use in list mode.
	* Unused quality and alternative extension info files will be ignored
	* @return array|null $list_value
	* @test true
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
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
		foreach ($dato as $item) {

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
	* 	Takes quality from fixed value or fallback to default config value
	* @return string $quality
	* @test true
	*/
	public function get_quality() : string {

		$quality = $this->quality ?? $this->get_default_quality();

		return $quality;
	}//end get_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* @return array $normalized_ar_quality
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
	* @return string $thumb_quality
	* @test true
	*/
	public function get_thumb_quality() : string {

		$thumb_quality = defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';

		return $thumb_quality;
	}//end get_thumb_quality



	/**
	* GET_THUMB_PATH
	* @return string $image_thumb_path
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
	* @return string $thumb_extension
	* @test true
	*/
	public function get_thumb_extension() : string {

		$thumb_extension = defined('DEDALO_THUMB_EXTENSION') ? DEDALO_THUMB_EXTENSION : 'jpg';

		return $thumb_extension;
	}//end get_thumb_extension



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files directory
	* @see component_image->remove_component_media_files
	* @param string $quality
	* @param string|null $extension = null
	* @return object $response
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

			// update dato on delete original
				if( !isset($extension) ){
					$original_quality	= $this->get_original_quality();
					$modified_quality	= $this->get_modified_quality();
					if ($quality===$original_quality || $quality===$modified_quality) {
						$dato = $this->get_dato();
						if (isset($dato[0]) && is_object($dato[0])) {
							foreach ($dato[0] as $name => $current_value) {
								// delete all info about the current quality (file_name, upload_date, normalized_name, ..)
								if (strpos($name, $quality.'_')===0 && isset($dato[0]->{$name})) {
									unset($dato[0]->{$name});
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

			// save to force update dato files_info
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}


		return $response;
	}//end delete_file



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked
	* to current component (all quality versions)
	* Is triggered wen section that contain media elements is deleted
	* @see section:remove_section_media_files
	* @param array $ar_quality = []
	* @param string|null $extension = null
	* @return bool
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
			$ar_extensions			= array_merge(
				[$normalized_extension],
				$alternative_extensions,
				$allowed_extensions
			);

		// dato
			$dato = $this->get_dato();

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
						$original_normalized_name	= isset($dato[0]) && isset($dato[0]->original_normalized_name)
							? $dato[0]->original_normalized_name
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
						$modified_normalized_name	= isset($dato[0]) && isset($dato[0]->modified_normalized_name)
							? $dato[0]->modified_normalized_name
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
	* @param object $options
	* @return bool
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
	* Duplicate all media file linked (copy all media files into a new section_id)
	* of current component (all quality versions)
	* Is triggered wen section that contain media elements is duplicated
	* @see section:duplicate_current_section
	* @param string|int $target_section_id
	* @param array $ar_quality = []
	* @param string|null $extension = null
	* @return bool
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
			$ar_extensions			= array_merge(
				[$normalized_extension],
				$alternative_extensions,
				$allowed_extensions
			);

		// data
			$dato = $this->get_dato();

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
						$original_normalized_name	= isset($dato[0]) && isset($dato[0]->original_normalized_name)
							? $dato[0]->original_normalized_name
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
						$modified_normalized_name	= isset($dato[0]) && isset($dato[0]->modified_normalized_name)
							? $dato[0]->modified_normalized_name
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
	* @param object $options
	* {
	* 	source_file : string full path of the file to be copied
	* 	target_file : string full path of the target file
	* }
	* @return bool
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
	* @return bool
	* 	Default is true. Override when component is sortable
	* @test true
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* GET_ORIGINAL_FILES
	* Returns the full path of the original file/s found
	* The original files are saved renamed but keeping the extension.
	* @return array $original_files
	* 	Array of full path files found
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
	* Returns the full path of the original file/s found
	* The original files are saved renamed but keeping the extension.
	* @param string $quality
	* @return array $original_files
	* 	Array of full path files found
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
	* Resolve normalized name from given quality
	* It is used to resolve orgininal_normalized_name and modified_normalized_name
	* @param string $quality
	* 	Sample 'modified'
	* @return string|null $normalized_name
	*  Sample: 'rsc29_rsc170_1070.tiff'
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
	* From component dato with fallback to files
	* @param string $quality
	* @return string|null $original_quality
	* @test true
	*/
	public function get_uploaded_file(string $quality) : ?string {

		$uploaded_file = null;

		// short vars
			$dato			= $this->get_dato();
			$property_name	= $quality . '_normalized_name';
			$file_name		= null;

		if (isset($dato[0]) && isset($dato[0]->{$property_name})) {

			// already in dato case
			$file_name = $dato[0]->{$property_name};

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
	* Read the given quality file data, in media common dato item format
	* Result sample:
	* {
	* 	"quality": "50MB",
	*	"file_url": "/v6/master_dedalo/media/image/50MB/0/rsc29_rsc170_1.jpg",
	*	"file_name": "rsc29_rsc170_1.jpg",
	*	"file_path": "/Users/pepe/v6/master_dedalo/media/image/50MB/0/rsc29_rsc170_1.jpg",
	*	"file_size": 11270469,
	*	"file_time": {
	*		"day": 29,
	*		"hour": 18,
	*		"time": 65001897875,
	*		"year": 2022,
	*		"month": 5,
	*		"minute": 44,
	*		"second": 35,
	*		"timestamp": "2022-05-29 18:44:35"
	*	}
	* }
	* @param string $quality
	* @param string|null $extension = null
	* @return object $dato_item
	* @test true
	*/
	public function get_quality_file_info( string $quality, ?string $extension=null ) : object {

		// external source (link to image outside Dédalo media)
			$external_source = $this->get_external_source();
			if(!empty($external_source)){

				$extension = pathinfo($external_source)['extension'];

				$dato_item = (object)[
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
				return $dato_item;
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

				$dato_item = (object)[
					'quality'		=> $quality,
					'file_exist'	=> false,
					'file_name'		=> null,
					'file_path'		=> null,
					// 'file_url'		=> null,
					'file_size'		=> null,
					'file_time'		=> null,
					'extension'		=> null
				];
				return $dato_item;
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
			$file_time_dd->time			= dd_date::convert_date_to_seconds($file_time_dd);
			$file_time_dd->timestamp	= $file_time;

		// media_attributes
			// $media_attributes = $this->get_media_attributes($file_path);

		// file_exists
			$file_exist = file_exists($file_path);

		// file_path relative
			$file_path_relative = str_replace(DEDALO_MEDIA_PATH, '', $file_path);

		// add quality file info
			$dato_item = (object)[
				'quality'		=> $quality,
				'file_exist'	=> $file_exist,
				'file_name'		=> $file_name,
				'file_path'		=> $file_path_relative,
				// 'file_url'		=> $file_url,
				'file_size'		=> $file_size,
				'file_time'		=> $file_time_dd,
				'extension'		=> $extension
			];


		return $dato_item;
	}//end get_quality_file_info



	/**
	* GET_TARGET_FILENAME
	* @return string target_filename
	*  as 'rsc29_rsc170_1363.jpg'
	* @test true
	*/
	public function get_target_filename() : string {

		$target_filename = $this->id .'.'. $this->get_extension();

		return $target_filename;
	}//end get_target_filename



	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array $ar_quality (Order by quality big to small)
	* @param string $target_quality
	* @return string|null $current_quality
	* 	first suitable quality file to use as source
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
	* Search the original file into the original path and returns the file extension if is found
	* If a file with an extension other than DEDALO_IMAGE_EXTENSION is uploaded, it is converted to DEDALO_IMAGE_EXTENSION.
	* The original files are saved renamed but keeping the ending.
	* This function is used to locate them by checking if there is more than one.
	* @param bool $exclude_converted = true
	* @return string|null $result
	* 	File extensions like 'jpg', 'mp4', ...
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
					trigger_error("Error Processing Request. Too much original files found and all have invalid extension ($n)");
					#throw new Exception("Error Processing Request. Too much original files found", 1);
				}
			}


		return $result;
	}//end get_original_extension



	/**
	* GET_ORIGINAL_FILE_PATH
	* Returns the full path of the original file (with no default extension) if exists
	* If a file with an extension other than DEDALO_xxx_EXTENSION is uploaded, it is converted to DEDALO_xxx_EXTENSION.
	* The original files are saved renamed but keeping the ending. This function is used to locate them by checking if
	* there is more than one.
	* @return string|null $result
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
	* GET_MEDIA_PATH_DIR
	* Get the absolute path to the media in current quality as:
	* 	'/user/myuser/httpddocs/dedalo/media/pdf/web'
	* @param string $quality
	* @return string $media_path
	* @test true
	*/
	public function get_media_path_dir(string $quality) : string {

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
	* 	Creates the relative URL path in current quality as
	* 	'/dedalo/media/pd/standard'
	* @param string $quality
	* @return string $media_url_dir
	* @test true
	*/
	public function get_media_url_dir(string $quality) : string {

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
	* Get image url for current quality
	*
	* @param string|bool $quality = null
	* @param bool $test_file = true
	*	Check if file exists. If not use 0.jpg as output
	* @param bool $absolute = false
	* @param bool $default_add = true
	* @return string|null $url
	*	Return relative o absolute url
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
	* Unified method to get thumbnail, posterframe, etc.
	* Alias of get_url with fixed thumb quality
	* @return string|null
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
	* Remove all image versions that are different of the uploaded files (normalized files), including the alternative versions
	* Remove in original and modified qualities only
	* Keep the original uploaded files
	* @return bool
	*/
	public function delete_normalized_files() : bool {

		// component defined normalized qualities to be delete.
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

			if ( $media_filepath!==$uploaded_file && file_exists($media_filepath) && isset($uploaded_file) && file_exists($uploaded_file) ) {

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

				if ($alternative_path!==$uploaded_file && file_exists($alternative_path)) {

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
	* Force the current component to re-build and save its data
	* @see class.tool_update_cache.php
	* @param object|null $options=null
	* @return bool
	* @test true
	*/
	public function regenerate_component( ?object $options=null ) : bool {

		// Options
			$delete_normalized_files = $options->delete_normalized_files ?? true;


		// full remove the original files except the uploaded file (.pdf, .tiff, .psd, .mov etc)
			if( $delete_normalized_files===true ){
				$this->delete_normalized_files();
			}

		// default check default quality
			$default_quality	= $this->get_default_quality();
			$file_path			= $this->get_media_filepath($default_quality);
			if (!file_exists($file_path)) {
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

		// thumb. Re-create thumb always (from default quality file)
			$this->create_thumb();

		// files_info. Updates component dato files info values iterating available files
		// This action updates the component data ($this->data) but does not save it
		// Note that this method is called again on save, but this is intentional
			$this->update_component_dato_files_info();

		// dato. Current updated stored dato
			$dato = $this->get_dato();

		// empty case. Previous update_component_dato_files_info generates
		// a new dato if files are found. Else no dato is set (null)
			if (empty($dato)) {
				return false;
			}

		// bad dato case
			if (isset($dato[0]) && !is_object($dato[0])) {
				debug_log(__METHOD__
					. " Invalid component data. Expected object and received array " . PHP_EOL
					. ' dato: ' . to_string($dato)
					, logger::ERROR
				);
				return false;
			}

		// original_file_name: from target_filename (use example: component_image rsc29)
		// When original_file_name is not defined, we look in the properties definition
		// to get the filename in the target_filename defined (as component_input_text)
			if (!isset($dato[0]->original_file_name)) {

				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					// get the target filename defined in properties as `Original file name` rsc398
					$tipo  = $properties->target_filename;
					$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					$component = component_common::get_instance(
						$model, // string model
						$tipo, // string tipo
						$this->section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$this->section_tipo // string section_tipo
					);
					$filename_dato = $component->get_dato();

					// original_file_name
					if( !empty($filename_dato[0]) ) {

						$dato[0]->original_file_name = $filename_dato[0];

						// original_normalized_name
						if ( !isset($dato[0]->original_normalized_name) ) {
							$dato[0]->original_normalized_name = $this->get_id() .'.'. get_file_extension($filename_dato[0]);
						}

						// original_upload_date
						if (!isset($dato[0]->original_upload_date)) {

							$file_path = $this->get_media_path_dir( $this->get_original_quality() ) .'/'. $dato[0]->original_normalized_name;
							if (file_exists($file_path)) {
								$modification_time				= filectime($file_path);
								$dato[0]->original_upload_date	= !empty($modification_time)
									? dd_date::get_dd_date_from_unix_timestamp($modification_time)
									: null;
							}
						}
					}

					// replace existing dato
					$this->set_dato($dato);
				}
			}

		// original_normalized_name
			if (!isset($dato[0]->original_normalized_name)) {

				$original_quality = $this->get_original_quality();

				$original_normalized_name = $this->get_normalized_name_from_files(
					$original_quality
				);
				if (!empty($original_normalized_name)) {

					$dato[0]->original_normalized_name = $original_normalized_name;

					// original_upload_date
					if (!isset($dato[0]->original_upload_date)) {

						$file_path = $this->get_media_path_dir($original_quality) .'/'. $original_normalized_name;
						if (file_exists($file_path)) {
							$modification_time				= filectime($file_path);
							$dato[0]->original_upload_date	= !empty($modification_time)
								? dd_date::get_dd_date_from_unix_timestamp($modification_time)
								: null;
						}
					}
				}
			}

		// modified_normalized_name
			if (!isset($dato[0]->modified_normalized_name)) {

				$modified_quality = $this->get_modified_quality();

				// not all components has modified quality as component_pdf
				if(!empty($modified_quality)){
					$modified_normalized_name = $this->get_normalized_name_from_files(
						$modified_quality
					);
					if (!empty($modified_normalized_name)) {
						$dato[0]->modified_normalized_name = $modified_normalized_name;

						// modified_upload_date
						if (!isset($dato[0]->modified_upload_date)) {

							$file_path = $this->get_media_path_dir($modified_quality) .'/'. $modified_normalized_name;
							if (file_exists($file_path)) {
								$modification_time				= filectime($file_path);
								$dato[0]->modified_upload_date	= !empty($modification_time)
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
	* Get full file path in local media
	* @param string|null $quality = null
	* 	Like 'original'
	* @param string|null $extension = null
	* 	Like 'avif'
	* @return string $path
	* 	complete absolute file path like '/Users/myuser/works/dedalo/media/images/dd152-1.jpg'
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
	* Sync this quality value
	* set value must be inside config ar_quality definition
	* @param string $quality
	* @return bool
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
	* FILE SIZE
	* Get file physical size in bytes (or KB/MB)
	* @param string $quality
	* @return string|null $size
	* 	(round to KB or MB with label like '256 KB')
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
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool
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

		// update component dato files info and save
			if ($save===true) {
				$this->Save();
			}

		// response
			$response->result	= true;
			$response->msg		= 'Copied file. Remember overwrite this method to real conversion';


		return $response;
	}//end build_version



	/**
	* UPDATE_COMPONENT_DATO_FILES_INFO
	* Get component files info reading current media and
	* updates the component dato. Does not save!
	* @return bool
	* @test true
	*/
	protected function update_component_dato_files_info() : bool {

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

		// save component dato
			$dato = $this->get_dato();
			if (isset($dato[0])) {
				if (!is_object($dato[0])) {

					// bad dato case
					debug_log(__METHOD__
						." ERROR. BAD COMPONENT DATO " .PHP_EOL
						.' dato:' . json_encode($dato, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					return false;

				}else{

					// replace files info values
					$dato[0]->files_info = $files_info;
				}
			}else{

				if (empty($files_info) && empty($dato)) {

					$dato = null;

				}else{

					if (empty($dato)) {
						// create a new dato from scratch
						$dato_item = (object)[
							'files_info' => $files_info
						];
						$dato = [$dato_item];
					}else{
						// Leave dato as is (used in test unit)
					}
				}
			}

		// updates dato
			$this->set_dato($dato);


		return true;
	}//end update_component_dato_files_info



	/**
	* SAVE
	* Update component dato reading media files before Save
	* @return int|null $section_matrix_id
	* @test true
	*/
	public function Save() : ?int {

		$this->update_component_dato_files_info();

		return parent::Save();
	}//end Save



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses component SQO query
	* @param object $query_object
	* @return object $query_object
	*	Edited/parsed version of received object
	* @test true
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// media components are not searchable at now
		debug_log(__METHOD__
			. " media components are not searchable at now " . PHP_EOL
			. ' query_object: ' . to_string($query_object)
			, logger::ERROR
		);


		return $query_object;
	}//end resolve_query_object_sql



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

		debug_log(__METHOD__
			. " Use specific component method to overwrite this ! $quality - $extension"
			, logger::WARNING
		);

		return true;
	}//end create_alternative_version



	/**
	* CREATE_ALTERNATIVE_VERSIONS
	* Render all alternative_version files in all quality versions.
	* This method overwrites any existing file with same path
	* @param object|null $options = null
	* @return bool
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
	* DELETE_thumb
	* Remove thumb file version from disk
	* @return bool
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

		// save to force update dato files_info
			$this->Save();


		return true;
	}//end delete_thumb



	/**
	* GET_REGENERATE_OPTIONS
	* Used by tool_update_cache to get custom regeneration options from component
	* @return array|null $options
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
