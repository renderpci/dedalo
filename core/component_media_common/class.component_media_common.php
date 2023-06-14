<?php
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
	protected function __construct(string $tipo, $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, string $section_tipo=null) {

		// lang. Force always DEDALO_DATA_NOLAN when is not translatable
		// (note that PDF can be translatable)
			$translatable = RecordObj_dd::get_translatable($tipo);
			if ($translatable!==true) {
				$lang = DEDALO_DATA_NOLAN;
			}

		// common constructor. Creates the component as normally do with parent class
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo);

		// quality
			$this->quality = $this->get_quality();

		// id. Set and fix current id
			if (!empty($this->section_id)) {

				// id. Set and fix current id
					$this->id = $this->get_id();

				// initial_media_path set
					$this->initial_media_path = $this->get_initial_media_path();

				// additional_path : Set and fix current additional image path
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
	*/
	public function get_dato() : ?array {

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
			$class_list = $ddo->class_list ?? null;

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
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$default_quality = $this->get_default_quality();
		$diffusion_value = $this->get_url(
			$default_quality,
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
					debug_log(__METHOD__." Component dato (parent:$this->section_id,section_tipo:$this->section_tipo) is empty for:".to_string(), logger::WARNING);
				}
				return null;
			}

		// flat locator as id
			$locator = new locator();
				$locator->set_section_tipo($this->get_section_tipo());
				$locator->set_section_id($this->get_section_id());
				$locator->set_component_tipo($this->get_tipo());

			$id	= $locator->get_flat();

		// add lang when translatable
			if ($this->traducible==='si') {
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
	* Calculate image additional path from 'properties' json config.
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

		if ( !is_null($additional_path_tipo) && !empty($section_id) ) {

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

		if(empty($valor) && isset($properties->max_items_folder)) {

			// max_items_folder defined case
				$max_items_folder	= (int)$properties->max_items_folder;
				$int_section_id		= (int)$section_id;

			// add
				$additional_path = '/'.$max_items_folder*(floor($int_section_id / $max_items_folder));

			// // update component dato. Final dato must be an array to saved into component_input_text
			// 	$final_dato = array( $additional_path );
			// 	$component->set_dato( $final_dato );

			// // save if mode is edit
			// 	if ($this->mode==='edit') {
			// 		$component->Save();
			// 	}
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
	* @param object $file_data
	* {
	* 	"name": "montaje3.jpg",
	*	"type": "image/jpeg",
	*	"tmp_name": "/private/var/tmp/php6nd4A2",
	*	"error": 0,
	*	"size": 132898
	* }
	* @return object $response
	* {
	* 	"original_file_name" : $name,
	*	"full_file_name"	 : $full_file_name,
	*	"full_file_path"	 : $full_file_path
	* }
	*/
	public function add_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// file_data sample
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
			$name			= $file_data->name; // string original file name like 'IMG_3007.jpg'
			$key_dir		= $file_data->key_dir; // string upload caller name like 'oh1_oh1'
			$tmp_dir		= $file_data->tmp_dir; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$tmp_name		= $file_data->tmp_name; // string like 'phpJIQq4e'
			$quality 		= $file_data->quality ?? $this->get_quality() ?? $this->get_original_quality();
			$source_file 	= $file_data->source_file ?? null;

		// source_file
			if (!defined($tmp_dir)) {
				$msg = 'constant is not defined!  tmp_dir: '.$tmp_dir;
				$response->msg .= $msg;
				debug_log(__METHOD__
					.' ' .$response->msg . PHP_EOL
					. ' tmp_dir: ' . $tmp_dir
					, logger::ERROR
				);
				return $response;
			}

			$user_id = navigator::get_user_id();
			$source_file 	= isset($source_file)
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
				." media_common.add_file Target file (full_file_path): "
				.to_string($full_file_path)
				, logger::DEBUG
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

		// all is ok
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
	protected function rename_old_files(string $file_name, string $folder_path) : object {

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
					//dump($current_possible_file, ' current_possible_file'.to_string());
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
	* PROCESS_UPLOADED_FILE
	* Dummy method. Overwrite it in each component
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

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
			$user_id			= $options->user_id ?? navigator::get_user_id();
			$user_id_label		= $options->user_id_label ?? 'user_id';

		// set value properties
			$value->{$file_name_label}		= $file_name;
			$value->{$upload_date_label}	= $upload_date;
			$value->{$user_id_label}		= (int)$user_id;


		return $value;
	}//end build_media_value



	/**
	* GET_FILES_INFO
	* Get file info for every quality
	* Used as 'datalist' in component data API response
	* @param bool $include_empty = true
	* @return array $files_info
	*/
	public function get_files_info( bool $include_empty = true ) : array {

		$ar_quality = $this->get_ar_quality();

		// files check
			$files_info = [];
			foreach ($ar_quality as $quality) {

				$quality_file_info = $this->get_quality_file_info($quality);
				if ($include_empty===false && $quality_file_info->file_exist===false) {
					// skip quality without file
					continue;
				}

				// add
				$files_info[] = $quality_file_info;
			}//end foreach ($ar_quality as $quality)


		return $files_info;
	}//end get_files_info



	/**
	* GET_DATALIST
	* @return array $datalist
	*/
	public function get_datalist() {

		$files_info = $this->get_files_info(
			true // bool include_empty
		);

		$datalist = array_map(function($el){
			$item = (object)[
				'quality'		=> $el->quality,
				'file_exist'	=> $el->file_exist,
				'file_url'		=> $el->file_url,
				'file_size'		=> $el->file_size,
				'external'		=> $el->external ?? false
			];

			return $item;
		}, $files_info);

		return $datalist;
	}//end get_datalist



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
		$result = $this->remove_component_media_files([$quality]);
		if ($result===true) {

			// save To update valor_list
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

		$date=date("Y-m-d_Hi");

		// ar_quality. Get all if not received any
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// files remove
			foreach ($ar_quality as $current_quality) {

				// media_path is full path of file like '/www/dedalo/media_test/media_development/svg/standard/rsc29_rsc170_77.svg'
					$media_path = $this->get_media_filepath($current_quality);
					if (!file_exists($media_path)) continue; # Skip

				// delete directory
					$folder_path_del = $this->get_target_dir($current_quality) . '/deleted';
					if( !is_dir($folder_path_del) ) {
						if( !mkdir($folder_path_del, 0777,true) ) {
							debug_log(__METHOD__
								. " Error on read or create directory \"deleted\". Permission denied " . PHP_EOL
								. ' folder_path_del: ' . $folder_path_del
								, logger::ERROR
							);
							return false;
						}
					}

				// move/rename file
					$file_name			= $this->get_name();
					$media_path_moved	= $folder_path_del . '/' . $file_name . '_deleted_' . $date . '.' . $this->get_extension();
					if( !rename($media_path, $media_path_moved) ) {
						trigger_error(" Error on move files to folder \"deleted\" [1]. Permission denied . The files are not deleted");
						return false;
					}

				debug_log(__METHOD__
					." Moved file". PHP_EOL
					. ' media_path: ' . $media_path . PHP_EOL
					. ' media_path_moved: ' . $media_path_moved
					, logger::WARNING
				);
			}//end foreach


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
	public function get_quality_file_info( string $quality ) : object {

		// external source (link to image outside Dédalo media)
			$external_source = $this->get_external_source();
			if(!empty($external_source)){

				$dato_item = (object)[
					'quality'		=> $quality,
					'file_exist'	=> true,
					'file_name'		=> null,
					'file_path'		=> null,
					'file_url'		=> $external_source,
					'file_size'		=> null,
					'file_time'		=> null,
					'external'		=> true
				];
				return $dato_item;
			}


		// file path
			$file_path = $this->get_media_filepath($quality);
			// original could override default path
			if ($quality==='original') {
				$raw_path = $this->get_original_file_path($quality);
				if ($raw_path!==$file_path) {
					$file_path = $raw_path;
				}
			}

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
					'file_url'		=> null,
					'file_size'		=> null,
					'file_time'		=> null
				];
				return $dato_item;
			}

		// file_name
			$file_name = basename($file_path);

		// file_url
			$file_url = $this->get_url(
				$quality, // string quality
				true, // bool test_file
				false, // bool absolute
				true // bool default_add
			);
			if ($quality==='original') {
				// replace default extension for the real file extension
				$path_parts	= pathinfo($file_path);
				$url_parts	= pathinfo($file_url);
				if($url_parts['extension']!==$path_parts['extension']) {
					$file_url = $url_parts['dirname'].'/'.$url_parts['filename'].'.'.$path_parts['extension'];
				}
			}

		// file_size
			$file_size = (function() use($file_path) {
				try {
					$size = @filesize($file_path);
				} catch (Exception $e) {
					trigger_error( __METHOD__ . ' Error on read file size. ' . $e->getMessage() , E_USER_NOTICE);
				}
				return $size ?? null; // in bytes
			 })();

		// file_time (creation or modification date timestamp). The time when the content of the file was changed
			$file_time = date("Y-m-d H:i:s", filemtime($file_path));
			$dd_date					= new dd_date();
			$file_time_dd				= $dd_date->get_date_from_timestamp($file_time);
			$file_time_dd->time			= dd_date::convert_date_to_seconds($file_time_dd);
			$file_time_dd->timestamp	= $file_time;


		// media_attributes
			// $media_attributes = $this->get_media_attributes($file_path);

		// add quality file info
			$dato_item = (object)[
				'quality'				=> $quality,
				'file_exist'			=> true,
				'file_name'				=> $file_name,
				'file_path'				=> $file_path,
				'file_url'				=> $file_url,
				'file_size'				=> $file_size,
				'file_time'				=> $file_time_dd
				// 'media_attributes'	=> $media_attributes
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
					if(strtolower($ext)!==strtolower($default_extension)) {
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
					trigger_error("ERROR (DEBUG ONLY): Current quality have more than one file. ".to_string($ar_originals));
				}
			}


		return $result;
	}//end get_original_file_path



	/**
	* GET_MEDIA_PATH_dir
	* 	Get the absolute path to the media in current quality as:
	* 	'/user/myuser/httpddocs/dedalo/media/pdf/web'
	* @param string $quality
	* @return string $media_path
	* 	Absolute media path
	*/
	public function get_media_path_dir(string $quality) : string {

		$initial_media_path	= $this->initial_media_path ?? '';
		$additional_path	= $this->additional_path ?? '';
		$folder				= $this->get_folder(); // like '/svg'
		$base_path			= $folder . $initial_media_path . '/' . $quality . $additional_path;
		$media_path			= DEDALO_MEDIA_PATH . $base_path;

		return $media_path;
	}//end get_media_path_dir



	/**
	* GET_MEDIA_url_DIR
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
	* GET_TARGET_DIR
	* @param string|null $quality
	* @return string $target_dir
	*/
	public function get_target_dir(string $quality) : string {

		$target_dir = $this->get_media_path_dir($quality);

		return $target_dir;
	}//end get_target_dir



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-build and save its data
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// get files info
			$files_info	= $this->get_files_info(
				false // bool include_empty. Prevent to store empty quality files
			);

		// create a new dato from scratch
			$dato_item = (object)[
				'files_info' => $files_info
			];
			$dato = [$dato_item];

		// replace existing dato
			$this->set_dato($dato);

		// save
			$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_MEDIA_FILEPATH
	* Get full file path in local media
	* @return string $path
	* 	complete absolute file path like '/Users/myuser/works/dedalo/media/images/dd152-1.jpg'
	*/
	public function get_media_filepath(?string $quality=null) : string {

		if(empty($quality)) {
			$quality = $this->get_quality();
		}

		$path = $this->get_media_path_dir($quality) .'/'. $this->get_name() . '.' . $this->get_extension();

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
	* (!) Note that this generic method on copy files,
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

		// copy file from source quality to target quality
			$copy_result = copy(
				$original_file_path, // from original quality directory
				$target_quality_path // to default quality directory
			);
			if ($copy_result===false) {
				debug_log(__METHOD__ . PHP_EOL
					. " Error: Unable copy file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::ERROR
				);
			}else{
				debug_log(__METHOD__ . PHP_EOL
					. " Copied file : " . PHP_EOL
					. ' original_file_path: ' . $original_file_path . PHP_EOL
					. ' target_quality_path: ' . $target_quality_path
					, logger::DEBUG
				);
			}

		// response
			$response->result	= true;
			$response->msg		= 'Copied file. Remember overwrite this method to real conversion';

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $id,
					'quality'			=> $quality,
					'source_quality'	=> $original_quality,
					'target_quality'	=> $quality
				]
			);

		return $response;
	}//end build_version



}//end component_media_common
