<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components that works with media
* like component_av, component_image, component_pdf, component_svg, etc..
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
	protected function __construct(string $tipo, $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, string $section_tipo=null, bool $cache=true) {

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
	*
	* @return dd_grid_cell_object $grid_cell_object
	*/
	public function get_grid_value(?object $ddo=null) : dd_grid_cell_object {

		// column_obj. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$column_obj = isset($this->column_obj)
				? $this->column_obj
				: (object)[
					'id' => $this->section_tipo.'_'.$this->tipo
				  ];

		// current_url. get from dato
			$dato = $this->get_dato();
			if(isset($dato)){

				$element_quality = ($this->mode==='edit')
					? $this->get_default_quality()
					: $this->get_thumb_quality();

				$current_url = $this->get_url(
					$element_quality, // string quality
					false, // bool test_file
					false,  // bool absolute
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
			$grid_cell_object = new dd_grid_cell_object();
				$grid_cell_object->set_type('column');
				$grid_cell_object->set_label($label);
				$grid_cell_object->set_ar_columns_obj([$column_obj]);
				$grid_cell_object->set_cell_type('img');
				if(isset($class_list)){
					$grid_cell_object->set_class_list($class_list);
				}
				$grid_cell_object->set_value([$current_url]);


		return $grid_cell_object;
	}//end get_grid_value



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {

		return $this->get_id() .'.'. $this->get_extension();
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
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
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

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
	* GET_ID
	* @return string|null $id
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
	*/
	public function get_name() : ?string {

		return $this->get_id();
	}//end get_name



	/**
	* GET_INITIAL_MEDIA_PATH
	* Used by component_image, component_pdf
	* @return string|null $this->initial_media_path
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
	* QUALITY_FILE_EXIST
	* Check if quality given file exists
	* @param string $quality
	* @return bool
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
	*/
	public function add_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

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

		// short vars
			$name			= $options->name; // string original file name like 'IMG_3007.jpg'
			$key_dir		= $options->key_dir; // string upload caller name like 'oh1_oh1'
			$tmp_dir		= $options->tmp_dir; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$tmp_name		= $options->tmp_name; // string like 'phpJIQq4e'
			$quality 		= $options->quality ?? $this->get_quality() ?? $this->get_original_quality();
			$source_file 	= $options->source_file ?? null;

		// source_file
			if (!defined($tmp_dir)) {
				$msg = 'constant is not defined! tmp_dir: '.$tmp_dir;
				$response->msg .= $msg;
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' tmp_dir: ' . $tmp_dir
					, logger::ERROR
				);
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
				return $response;
			}

		// target file info
			$file_extension	= strtolower(pathinfo($name, PATHINFO_EXTENSION));
			$file_name		= $this->get_name();
			// $folder_path	= $this->get_target_dir_abs($quality);
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
				return $response;
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
	* @return object $response
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
	*/
	public function rename_old_files(string $file_name, string $folder_path) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// check target fir
			if (empty($folder_path)) {
				$msg = "Invalid folder_path: '$folder_path' from filename: '$file_name'. Ignored rename";
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}

		// deleted dir. Verify / create the dir "deleted"
			if( !file_exists($folder_path . '/deleted') ) {
				if( !mkdir($folder_path.'/deleted', 0775, true) ) {
					$msg = "Error on create dir: '$folder_path' . Permission denied";
					debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
					$response->msg .= $msg;
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
	*/
	public function get_alternative_extensions() : ?array {

		$alternative_extensions = null;

		return $alternative_extensions;
	}//end get_alternative_extensions



	/**
	* PROCESS_UPLOADED_FILE
	* Dummy method. Overwrite it in each component
	* @return object $response
	*/
	public function process_uploaded_file(object $options) : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end process_uploaded_file



	/**
	* BUILD_MEDIA_VALUE
	*  Creates a standardized media value
	* Used by each media component to store their data
	* @param object $options
	* @return object $value
	*/
	protected function build_media_value(object $options) : object {

		throw new Exception("Error . REMOVE THIS METHOD !", 1);


		// options
			$value				= $options->value ?? new stdClass();
			$file_name			= $options->file_name;
			$file_name_label	= $options->file_name_label ?? 'original_file_name';
			$upload_date		= $options->upload_date ?? component_date::get_date_now();
			$upload_date_label	= $options->upload_date_label ?? 'upload_date';
			$user_id			= $options->user_id ?? logged_user_id();
			$user_id_label		= $options->user_id_label ?? 'user_id';

		// set value properties
			$value->{$file_name_label}		= $file_name;
			$value->{$upload_date_label}	= $upload_date;
			$value->{$user_id_label}		= (int)$user_id;


		return $value;
	}//end build_media_value



	/**
	* GET_FILES_INFO
	* Get file info for every quality from disk
	* Included alternative_extensions files and original from original_normalized_name
	* @param bool $include_empty = false
	* @return array $files_info
	*/
	public function get_files_info( bool $include_empty=false ) : array {

		$ar_quality = $this->get_ar_quality();

		$thumb_quality		= $this->get_thumb_quality();
		$thumb_extension	= $this->get_thumb_extension();
		if(!in_array($thumb_quality, $ar_quality)){
			$ar_quality[] = $thumb_quality;
		}

		$alternative_extensions	= $this->get_alternative_extensions();
		$extensions				= is_array($alternative_extensions)
			? array_merge([$this->get_extension()], $alternative_extensions)
			: [$this->get_extension()];
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
						// add
						$files_info[] = $quality_file_info;
					}
			}


		return $files_info;
	}//end get_files_info



	/**
	* GET_DATALIST
	* Creates a list of file info items iterating all qualities from
	* the component dato
	* @return array $datalist
	*/
	public function get_datalist() {

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
	*/
	public function get_quality() : string {

		$quality = $this->quality ?? $this->get_default_quality();

		return $quality;
	}//end get_quality



	/**
	* GET_THUMB_QUALITY
	* @return string $thumb_quality
	*/
	public function get_thumb_quality() : string {

		$thumb_quality = defined('DEDALO_QUALITY_THUMB') ? DEDALO_QUALITY_THUMB : 'thumb';

		return $thumb_quality;
	}//end get_thumb_quality



	/**
	* GET_THUMB_PATH
	* @return string $image_thumb_path
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
	* @return object $response
	*/
	public function delete_file(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files(
			[$quality] // array ar_quality
		);
		if ($result===true) {

			// update dato on delete original
				$original_quality	= $this->get_original_quality();
				$modified_quality	= $this->get_modified_quality();
				if ($quality===$original_quality || $quality===$modified_quality) {
					$dato = $this->get_dato();
					if (isset($dato[0]) && is_object($dato[0])) {
						foreach ($dato[0] as $name => $current_value) {
							if (strpos($name, $quality.'_')===0 && isset($dato[0]->{$name})) {
								unset($dato[0]->{$name});
							}
						}
					}
				}

			// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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
					]
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
	* @return bool
	*/
	public function remove_component_media_files(array $ar_quality=[]) : bool {

		$date = date('Y-m-d_Hi');

		// ar_quality. Get all if not received any
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// ar_extensions
			$extension				= $this->get_extension();
			$alternative_extensions	= $this->get_alternative_extensions();
			$ar_extensions			= !empty($alternative_extensions)
				? array_merge([$extension], $alternative_extensions)
				: [$extension];

		// dato
			$dato = $this->get_dato();

		// files remove
			foreach ($ar_quality as $current_quality) {

				// deleted directory check
					$folder_path_del = $this->get_target_dir($current_quality) . '/deleted';
					if( !is_dir($folder_path_del) ) {
						if( !mkdir($folder_path_del, 0750, true) ) {
							debug_log(__METHOD__
								. " Error on read or create directory \"deleted\". Permission denied " . PHP_EOL
								. ' folder_path_del: ' . $folder_path_del
								, logger::ERROR
							);
							continue;
						}
					}

				// original case. If defined 'original_normalized_name', add extension to list to delete
					if ($current_quality==='original') {
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
					if ($current_quality==='modified') {
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

						// media_path is full path of file like '/www/dedalo/media_test/media_development/svg/standard/rsc29_rsc170_77.svg'
							$media_path = $this->get_media_filepath($current_quality, $current_extension);
							if (!file_exists($media_path)) {
								// dump($media_path, ' SKIP media_path ++ '.to_string());
								continue; // Skip
							}

						// move/rename file
							$file_name			= $this->get_name();
							$media_path_moved	= $folder_path_del . '/' . $file_name . '_deleted_' . $date . '.' . $current_extension;
							if( !rename($media_path, $media_path_moved) ) {
								debug_log(__METHOD__
									. " Error on move files to folder \"deleted\" [1]. Permission denied . The files are not deleted" . PHP_EOL
									. ' media_path: ' . $media_path . PHP_EOL
									. ' media_path_moved: ' . $media_path_moved
									, logger::ERROR
								);
								return false;
							}

						// debug
							debug_log(__METHOD__
								. ' Moved file'. PHP_EOL
								. ' media_path: ' . $media_path . PHP_EOL
								. ' media_path_moved: ' . $media_path_moved
								, logger::WARNING
							);
					}//end foreach ($ar_extensions as $current_extension)
			}//end foreach ($ar_quality as $current_quality)


		return true;
	}//end remove_component_media_files



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
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
	public function get_original_files() : array {

		$original_files = [];

		// quality
			$initial_quality = $this->get_quality();
			// change current component quality temporally
			$original_quality = $this->get_original_quality();
			$this->set_quality($original_quality);

		// target_dir
			$target_dir = $this->get_target_dir($original_quality);
			if(!file_exists($target_dir)) {
				return $original_files; // empty array
			}

		// ar_originals. list of original found files
			$ar_originals	= [];
			$findme			= $this->get_name() . '.';
			if ($handle = opendir($target_dir)) {

				while( false!==($file = readdir($handle)) ) {

					// note that '.' and '..' are returned even
					if( strpos($file, $findme)!==false ) {
						$ar_originals[] = $file;
					}
				}

				closedir($handle);
			}

		// check found files
			$n = count($ar_originals);
			if ($n===0) {

				// no file found. Return empty array

			}elseif($n===1) {

				// all is OK, found 1 file as expected
				$original_files[] = $target_dir . '/' . $ar_originals[0];

			}else{

				// more than one file are found
				foreach ($ar_originals as $current_file) {
					$original_files[] = $target_dir . '/' . $current_file;
				}
			}

		// restore component quality
			$this->set_quality($initial_quality);


		return $original_files;
	}//end get_original_files



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
	* @return object $dato_item
	*/
	public function get_quality_file_info(string $quality, string $extension=null) : object {

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
	*/
	public function get_source_quality_to_build(string $target_quality) : ?string {

		$ar_quality			= $this->get_ar_quality();
		$original_quality	= $this->get_original_quality();
		foreach($ar_quality as $current_quality) {

			if ($target_quality!==$original_quality && $target_quality!==$current_quality) {
				// check file
				$filename = $this->get_original_file_path($current_quality);
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
	*/
	public function get_original_extension(bool $exclude_converted=true) : ?string {

		$result = null;

		// original_files (from component_media_common)
			$original_files	= $this->get_original_files(); // return array

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
	* @param string $quality
	* @return string|null $result
	*/
	public function get_original_file_path(string $quality) : ?string {

		$result = null;

		// original_files (from component_media_common)
			$original_files	= $this->get_original_files(); // return array
			$ar_originals	= $original_files;

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
	* GET_TARGET_DIR
	*  Alias of get_media_path_dir
	* @param string|null $quality
	* @return string $target_dir
	*/
	public function get_target_dir(string $quality) : string {

		$target_dir = $this->get_media_path_dir($quality);

		return $target_dir;
	}//end get_target_dir



	/**
	* GET_MEDIA_URL_DIR
	* 	Creates the relative URL path in current quality as
	* 	'/dedalo/media/pd/standard'
	* @param string $quality
	* @return string $media_url_dir
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
	*
	* @return string|null $url
	*	Return relative o absolute url
	*/
	public function get_url(?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=false) : ?string {

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
	* REGENERATE_COMPONENT
	* Force the current component to re-build and save its data
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// re-create thumb always
			$this->create_thumb();

		// files_info. Updates component dato files info values iterating available files
		// This action updates the component data ($this->data) but does not save it
		// Note that this method is called again on save, but this is intentional
			$this->update_component_dato_files_info();

		// target_filename (use example: component_image rsc29)
		// When original_file_name is not defined, we look in the properties definition for
			$dato = $this->get_dato();
			if (!isset($dato[0]->original_file_name)) {
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {
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
					if(!empty($filename_dato[0]) && is_object($filename_dato[0])) {
						$dato[0]->original_file_name = $filename_dato[0];

						// original_normalized_name
						if (!isset($dato[0]->original_normalized_name) && is_object($filename_dato[0])) {
							$dato[0]->original_normalized_name = $this->get_id() .'.'. pathinfo($filename_dato[0])['extension'];
						}
					}

					// replace existing dato
					$this->set_dato($dato);
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
	* @param string $extension = null
	* 	Like 'avif'
	* @return string $path
	* 	complete absolute file path like '/Users/myuser/works/dedalo/media/images/dd152-1.jpg'
	*/
	public function get_media_filepath(?string $quality=null, string $extension=null) : string {

		// quality fallback
			if(empty($quality)) {
				$quality = $this->get_quality();
			}

		// extension fallback
			if(empty($extension)) {
				$extension = $this->get_extension();
			}

		$path = $this->get_media_path_dir($quality) .'/'. $this->get_name() . '.' . $extension;


		return	$path;
	}//end get_media_filepath



	/**
	* SET_QUALITY
	* Sync this quality value
	* set value must be inside config ar_quality definition
	* @return bool
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
	* @return string|null $size
	* 	(round to KB or MB with label like '256 KB')
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
	*/
	public function restore_component_media_files() : bool {

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

			natsort($ar_files);	# sort the files from newest to oldest
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
			}

			debug_log(__METHOD__
				." Moved file using restore_component_media_files:" .PHP_EOL
				.' last_file_path: '. $last_file_path . PHP_EOL
				.' new_file_path: '. $new_file_path
				, logger::WARNING
			);
		}//end foreach


		return true;
	}//end restore_component_media_files



	/**
	* BUILD_VERSION - Overwrite in each component for real process
	* Creates a new version based on target quality
	* (!) Note that this generic method only copy files,
	* to real process, overwrite in each component !
	* @param string $quality
	* @param bool $async = true
	* @return object $response
	*/
	public function build_version(string $quality, bool $async=true) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// short vars
			$id					= $this->get_id();
			$original_quality	= $this->get_original_quality();
			$original_file_path	= $this->get_original_file_path($original_quality);
			if (empty($original_file_path) || !file_exists($original_file_path)) {
				$response->msg .= ' Invalid original_file_path. Skip conversion';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. " original_quality: " . $original_quality . PHP_EOL
					. ' original_file_path: ' . to_string($original_file_path)
					, logger::ERROR
				);
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
					return $response;
				}
			}

			if($quality==='thumb'){
				// thumb quality
				$result = $this->create_thumb();

			}else{
				// copy file from source quality to target quality
				$result = copy(
					$original_file_path, // from original quality directory
					$target_quality_path // to default quality directory
				);
			}


			if ($result===false) {
				debug_log(__METHOD__ . PHP_EOL
					. " Error: Unable to build version file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__ . PHP_EOL
					. " Built file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::DEBUG
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
				]
			);

		// update component dato files info and save
			$this->Save();

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
	*/
	public function Save() : ?int {

		$this->update_component_dato_files_info();

		return parent::Save();
	}//end Save



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*	Edited/parsed version of received object
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



}//end component_media_common
