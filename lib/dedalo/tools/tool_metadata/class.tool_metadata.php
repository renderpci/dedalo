<?php
/*
* CLASS tool_metadata
*
*
*/
class tool_metadata extends tool_common {

	# files
	public static $processed_files;
	public static $total_files = 0;


	# component
	protected $section_tipo;
	public $search_options;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_tipo, $modo='button') {
			
		# Fix modo
		$this->modo = $modo;


		// fix section tipo. (!) To unify tools vars, param section_tipo could be a full section object in some cases	
		$this->section_tipo = (is_object($section_tipo))
			? $section_tipo->get_tipo()
			: $section_tipo;

		# Fix search options
		$search_options_id		= $this->section_tipo; // section tipo like oh1
		$saved_search_options	= section_records::get_search_options( $search_options_id );
		
		// save cloned version of saved_search_options	
		$this->search_options = unserialize(serialize($saved_search_options));

		return true;
	}//end __construct



	/**
	* COUNT_FILES
	* @return object $response
	*/
	public static function count_files($path, $extensions=['jpg']) {
		
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$dir		= DEDALO_MEDIA_BASE_PATH . rtrim($path, '/');
		$process	= function($file) {
			self::$total_files++;
		};

		$result = self::iterate_dir($dir, $process, $extensions);

		$response->result	= self::$total_files;
		$response->msg		= 'Ok. Request done';
	

		return $response;
	}//end count_files



	/**
	* CHECK_EXIFTOOL
	* @return object $response
	*/
	public static function check_exiftool() {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$command	= EXIFTOOL_PATH . "exiftool -ver";
		$output		= shell_exec($command);

		$result = (object)[
			'command'	=> $command,
			'output'	=> trim($output),
			'path'		=> EXIFTOOL_PATH . "exiftool"
		];

		$response->result	= $result;
		$response->msg		= 'Ok. Request done';
	

		return $response;
	}//end check_exiftool



	// /**
	// * PROCESS_FILES
	// * @return object $response
	// */
	// public static function process_files($path, $data, $extensions=['jpg']) {
		
	// 	$response = new stdClass();
	// 		$response->result	= false;
	// 		$response->msg		= 'Error. Request failed';

	// 	$dir		= DEDALO_MEDIA_BASE_PATH . rtrim($path, '/');
	// 	$process	= function($file) use($data){
	// 		return self::edit_metadata($file, $data);
	// 	};

	// 	$result = self::iterate_dir($dir, $process, $extensions);

	// 	if (!empty(self::$processed_files)) {
	// 		$response->result	= self::$processed_files;
	// 		$response->msg		= 'Ok. Request done';
	// 	}

	// 	return $response;
	// }//end process_files



	/**
	* PROCESS_FILES_FROM_SECTION
	* @return object $response
	*/
	public static function process_files_from_section($section_tipo, $button_tipo, $data, $quality_selected) {
		
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// info from button trigger (received in request)
			$RecordObj_dd						= new RecordObj_dd($button_tipo);
			$button_properties					= $RecordObj_dd->get_propiedades(true);
			$source_list						= $button_properties->source_list;
			$source_list->image[0]->ar_quality	= $quality_selected;

		// records data (from search options)
			$tool_metadata	= new tool_metadata($section_tipo);
			$records_data	= $tool_metadata->get_records_data($source_list);
		
		// files
			$files	= [];
			foreach ($records_data as $item) {
				foreach ($item->files as $file) {
					$files[] = $file;
				}
			}

		// process
			foreach ($files as $file) {
				self::edit_metadata($file, $data);
			}


		if (!empty(self::$processed_files)) {
			$response->result	= self::$processed_files;
			$response->msg		= 'Ok. Request done';
		}

		return $response;
	}//end process_files_from_section



	/**
	* ITERATE_DIR
	* Iterate recursively a dir and process files with desired extensions
	*/
	public static function iterate_dir($dir, $process, $extensions) {

		$skip_folders = ['deleted','acc'];
		
		if (is_dir($dir)) {
			$files = glob( $dir . '/*' );

			foreach($files as $file){ // iterate files

				if(is_file($file)) {
					$extension = pathinfo($file,PATHINFO_EXTENSION);
					if (in_array($extension, $extensions)) {
						$ar_process[] = $process($file);
					}
				}else{

					$dir_name = pathinfo($file,PATHINFO_BASENAME);
					if (!in_array($dir_name, $skip_folders)) {
						self::iterate_dir($file, $process, $extensions);
					}
				}
			}
		}

		return true;
	}//end iterate_dir



	/**
	* EDIT_METADATA
	* Add/modify image metadata (IPTC AND XMP are accepted)
	* exiftool groups priority: 1) EXIF,   2) IPTC,   3) XMP
	* @param string $file
	*	Absolute file path
	* @param array $data
	*	List of objects ( property name => property value )
	* @return object $result
	*/
	public static function edit_metadata($file, $data) {
		
		// sentences
			$sentences = array_map(function($item){
				return '-' . $item->key .'=\'' . $item->value . '\'';
			}, $data);

		// description (Dédalo locator)
			$file_name = pathinfo($file,PATHINFO_BASENAME);
			preg_match('/^\w{2,}_(\w{2,}_\d)\.*/', $file_name, $output_array);
			// $description = $output_array[1]; // like rsc170_2
			$ar = explode('_', $output_array[1]);
			$section_tipo	= $ar[0];
			$section_id		= $ar[1];
			$description	= '{"about":"Dédalo locator","section_tipo":"'.$section_tipo.'","section_id":"'.$section_id.'"}';
			$sentences[]	= '-description=\'' . $description . '\''; // add as sentence too

		// metadata edit
			$command			= EXIFTOOL_PATH . "exiftool " .implode(' ', $sentences). " $file;";
			$output_exiftool	= shell_exec($command);

			$result = (object)[
				'file'				=> $file,
				'command'			=> $command,
				'output_exiftool'	=> trim($output_exiftool)
			];

			// error cases
				if (trim($output_exiftool)!=='1 image files updated') {
					$command_error = str_replace('exiftool ', 'exiftool -v ', $command);
					$output_error_exiftool  = shell_exec($command_error);

					$result->error = $output_error_exiftool;
				}

		// add
			self::$processed_files[] = $result;


		return $result;
	}//end edit_metadata



	/**
	* GET_RECORDS_DATA
	* Exec a search with current section search_options (user filtered records)
	* and iterate it obtaining existing files path in '$source_list' quality defined
	* @return array $data
	*/
	public function get_records_data($source_list) {
		
		$search_query_object = $this->search_options->search_query_object ?? null;

		if (!$search_query_object) {
			return [];
		}

		// search_query_object : change some params
			$search_query_object->limit		= false;
			$search_query_object->offset	= 0;
			$search_query_object->select	= [];

		// Search
			$search_development2	= new search_development2($search_query_object);
			$rows_data				= $search_development2->search();
			$ar_records				= (array)$rows_data->ar_records;
	
		// data
			$data = array_map(function($row) use($source_list){

				// image
					$image_files = isset($source_list->image)
						? self::get_value($source_list->image, 0, $row->section_id)
						: null;

				$item = new stdClass();
					$item->section_tipo	= $row->section_tipo;
					$item->section_id	= $row->section_id;
					$item->files		= $image_files;


				return $item;
			}, $ar_records);
			

		return (array)$data;
	}//end get_records_data



	/**
	* GET_VALUE
	* @return string $valor;
	*/
	public static function get_value($path, $key=0, $section_id) {

		$component_tipo	= $path[$key]->component_tipo;
		$section_tipo	= $path[$key]->section_tipo;
		$ar_quality		= $path[$key]->ar_quality ?? [DEDALO_IMAGE_QUALITY_DEFAULT];
		
		$model		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$lang		= DEDALO_DATA_LANG;
		$component	= component_common::get_instance($model,
													 $component_tipo,
													 $section_id,
													 'list',
													 $lang,
													 $section_tipo);
		
		$value = [];
		foreach ($ar_quality as $quality) {

			$file = $component->get_image_path($quality);
			if (file_exists($file)) {
				$value[] = $file;
			}else{
				debug_log(__METHOD__." Ignored non-existent file  ".to_string($file), logger::DEBUG);
			}	
		}
		

		return $value;
	}//end get_value



}//end tool_metadata