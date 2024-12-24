<?php declare(strict_types=1);
/**
* ONTOLOGY_DATA_IO
* Manages the ontology in/out, the class export and import files to sync nodes between installations
* Only shared Ontologies will be processed
*
* Note: Local Ontologies are managed by every installation and they are not used here.
*/
class ontology_data_io {



	public static $dd_tables = ['matrix_dd',"matrix_counter_dd","matrix_layout_dd"];



	/**
	* EXPORT_ONTOLOGY_INFO
	*
	* @return object $response
	*/
	public static function export_ontology_info() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// properties component (dd1)
			$section_tipo	= 'dd0';
			$section_id		= '1';
			$tipo			= 'ontology18';
			$model			= RecordObj_dd::get_modelo_name_by_tipo( $tipo );
			$properties_component = component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

			$properties_data	= $properties_component->get_dato();
			$data				= $properties_data[0] ?? null;
			$data_string		= json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);

		// path to save the file
			$ontology_io_path = ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$path_file = "{$ontology_io_path}/ontology.json";

		// set data into ontology file
			$saved = file_put_contents( $path_file, $data_string );
			if($saved === false){
				$response->msg		= 'Error. Impossible to save data in ontology.json file';
				$response->errors[]	= 'Impossible to save data in ontology.json file';
				return $response;
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done';


		return $response;
	}//end export_ontology_info



	/**
	* SET_ONTOLOGY_IO_PATH
	* Set the current version path for ontology io
	* Check if exist, else create it.
	* if the directory doesn't exist it will be created.
	* @return string|false $io_path
	*/
	public static function set_ontology_io_path() : string|false {

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_path		= create_directory( $base_path )===false
			? false
			: $base_path;

		return $io_path;
	}//end set_ontology_io_path



	/**
	* GET_ONTOLOGY_IO_PATH
	* Get the current version path for ontology io
	* Check if exists, and return the path or false
	* @param array|null $version = null
	* @return string|false $io_path
	*/
	public static function get_ontology_io_path( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_path		= is_dir( $base_path )===true
			? $base_path
			: false;

		return $io_path;
	}//end get_ontology_io_path




	/**
	* GET_ONTOLOGY_IO_URL
	* Get the current version path for ontology io
	* Check if exists, and return the path or false
	* @param array|null $version = null
	* @return string|false $io_url
	*/
	public static function get_ontology_io_url( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_url		= is_dir( $base_path )===true
			? ONTOLOGY_DATA_IO_URL."/{$version_path}"
			: false;

		return $io_url;
	}//end get_ontology_io_URl




	/**
	* UPDATE_ONTOLOGY_INFO
	* get the current Dédalo version and the ontology information
	* to be saved into the info properties of the component.
	* This information will be provided to control the ontology changes.
	* @return bool
	*/
	public static function update_ontology_info() : bool {

		$section_tipo	= 'dd0';
		$section_id		= '1';
		$tipo 			= 'ontology18';

		$model = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
		$properties_component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$data = $properties_component->get_dato() ?? [ new stdClass() ];

		$date			= dd_date::get_now_as_iso_timestamp();
		$dedalo_version	= get_dedalo_version();
		$version		= implode( '.', $dedalo_version );

		//hierarchy typology
		$active_ontologies = array_map(function( $el ){
			$active_ontology = new stdClass();
				$active_ontology->tld				= strtolower($el->tld);
				$active_ontology->name				= $el->name;
				$active_ontology->typology_id		= $el->typology_id;
				$active_ontology->typology_value	= $el->typology_value;

			return $active_ontology;
		},  ontology::get_active_elements() );

		foreach ($data as $current_value) {
			$current_value->version				= $version;
			$current_value->date				= $date;
			$current_value->entity_id			= DEDALO_ENTITY_ID;
			$current_value->entity				= DEDALO_ENTITY;
			$current_value->entity_label		= DEDALO_ENTITY_LABEL;
			$current_value->host				= DEDALO_HOST;
			$current_value->active_ontologies	= $active_ontologies;
		}

		$properties_component->set_dato( $data );
		$properties_component->Save();


		return true;
	}//end update_ontology_info



	/**
	* EXPORT_TO_FILE
	* Copy rows from DB to file filtered by tld
	* Copy is made using psql daemon
	* @param string $section_tipo
	* @return object $response
	*/
	public static function export_to_file( string $section_tipo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check section tipo is a valid tipo
			$check_section_tipo = safe_tipo( $section_tipo );

			if ( $check_section_tipo === false ) {
				$response->msg		= 'Error. Invalid section_tipo: '.$section_tipo;
				$response->errors[]	= 'Invalid section_tipo: '.$section_tipo;
				return $response;
			}

		// get tld of the target section_tipo
			$tld = ontology::map_target_section_tipo_to_tld( $section_tipo );

		// path to save the file
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$path_file  = "{$ontology_io_path}/{$section_tipo}_{$tld}.copy.gz";

		// command
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			$command = $command_base
				. " -c \"\copy (SELECT section_id, section_tipo, datos FROM \"matrix_ontology\" WHERE section_tipo = '{$section_tipo}') TO PROGRAM 'gzip > {$path_file}';\" ";


		// exec command in terminal
			$command_result = shell_exec($command);

		// check created file
			if (!file_exists($path_file)) {
				throw new Exception("Error Processing Request. File $path_file not created!", 1);
				$response->msg		= 'Error Processing Request. File '.$path_file.' not created!';
				$response->errors[]	= 'Target file was not created. Not found: '.$section_tipo;
				return $response;
			}

		// all was done
			$response->result			= true;
			$response->msg				= 'OK. Request done: ' . $section_tipo;
			$response->command_result	= $command_result;


		return $response;
	}//end export_to_file



	/**
	* EXPORT_PRIVATE_LISTS_TO_FILE
	* Copy rows from matrix_dd table and save it into a copy file
	* Copy is made using psql daemon
	* @return object $response
	*/
	public static function export_private_lists_to_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// path to save the file
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$path_file  = "{$ontology_io_path}/matrix_dd.copy.gz";

		// command
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			$command = $command_base
				. " -c \"\copy (SELECT section_id, section_tipo, datos FROM \"matrix_dd\") TO PROGRAM 'gzip > {$path_file}';\" ";

		// exec command in terminal
			$command_result = shell_exec($command);

		// check created file
			if (!file_exists($path_file)) {
				throw new Exception("Error Processing Request. File $path_file not created!", 1);
				$response->msg		= 'Error Processing Request. File '.$path_file.' not created!';
				$response->errors[]	= 'Target file was not created. Not found: matrix_dd.copy.gz';
				return $response;
			}

		// all was done
			$response->result			= true;
			$response->msg				= 'OK. Request done';
			$response->command_result	= $command_result;


		return $response;
	}//end export_private_lists_to_file



	/**
	* IMPORT_FROM_FILE
	* Get ontology file in copy format from ontology server
	* And import into the matrix_ontology table.
	* @param object $file_item
	* {
	*  "section_tipo" 	: "dd0",
	*  "tld" 			: "dd"
	*  "url" 			: "https://master.dedalo.dev/import/ontology/6.4/dd0_dd.copy.gz"
	* }
	* @return object $import_response
	*/
	public static function import_from_file( object $file_item ) : object {

		// options
			$section_tipo	= $file_item->section_tipo;
			$tld			= $file_item->tld;
			$url			= $file_item->url;

		// file_name
			$file_name = basename( $url );

		// import ontology path
			$ontology_io_path = ontology_data_io::get_ontology_io_path();

			$file_path = $ontology_io_path.'/'.$file_name;

			$options = new stdClass();
				$options->section_tipo	= $section_tipo;
				$options->file_path		= $file_path;
				$options->matrix_table	= 'matrix_ontology';

		// import records from file *.copy.gz
		// this delete existing data of current section_tipo and copy all file pg data
			$import_response = backup::import_from_copy_file( $options );

		return $import_response;
	}//end import_from_file



	/**
	* IMPORT_PRIVATE_LISTS_FROM_FILE
	* Get ontology file in copy format from ontology server
	* And import into the matrix_ontology table.
	* @param object $file_item
	* {
	*  "section_tipo" 	: "dd0",
	*  "tld" 			: "dd"
	*  "url" 			: "https://master.dedalo.dev/import/ontology/6.4/dd0_dd.copy.gz"
	* }
	* @return object $import_response
	*/
	public static function import_private_lists_from_file( object $file_item ) : object {

		// options
			$url = $file_item->url;

		// file_name
			$file_name = basename( $url );

		// import ontology path
			$ontology_io_path = ontology_data_io::get_ontology_io_path();

			$file_path = $ontology_io_path.'/'.$file_name;

			$options = new stdClass();
				$options->file_path		= $file_path;
				$options->matrix_table	= 'matrix_dd';
				$options->delete_table	= true;

		// import records from file *.copy.gz
		// this delete existing data of current section_tipo and copy all file pg data
			$import_response = backup::import_from_copy_file( $options );

		return $import_response;
	}//end import_private_lists_from_file



	/**
	* DOWNLOAD_REMOTE_ONTOLOGY_FILE
	* Call master server to get the desired file using a CURL request
	* If received code is not 200, return false as response result
	* @param string $url
	* @return object $response
	* {
	* 	result: bool
	* 	msg: string
	* 	errors: array
	* }
	*/
	public static function download_remote_ontology_file( string $url ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// file_name
			$file_name = basename( $url );

		// curl request
			$curl_response = curl_request((object)[
				'url'				=> $url,
				// 'post'				=> true,
				'header'			=> false, // bool add header to result
				'ssl_verifypeer'	=> false,
				'timeout'			=> (60*10), // int seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);
			$data = $curl_response->result;

		// errors
			// sample of failed download
			// {
			// 	"result": "",
			// 	"msg": "Error. Bad Request. Server has problems connecting to file (status code: 400)",
			// 	"error": false,
			// 	"code": 400
			// }
			if ($curl_response->code!=200) {
				// error connecting to master server
				// Do not add debug error here because it is already handled by curl_request
				$response->errors[] = 'bad server response code: ' . $curl_response->code . ' (' .$curl_response->msg.')' ;
				$response->msg .= ' Code is not as expected (200). Response code: ' . to_string($curl_response->code);
				return $response;
			}
			if (empty($data)) {
				// received data is empty (possibly a master server problem dealing with the request)
				debug_log(__METHOD__
					. " Empty result from download ontology file request " . PHP_EOL
					. ' response: ' .to_string($curl_response) . PHP_EOL
					. ' url param: ' . to_string($url)
					, logger::ERROR
				);
				$response->errors[] = 'empty data';
				$response->msg .= ' Empty result from download ontology file request';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " >>> Downloaded remote data from $file_name - "
				. 'result type: ' . gettype($data) . ' - '
				. exec_time_unit($start_time,'ms').' ms'
				, logger::DEBUG
			);

		// Create downloads folder if not exists
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}

		// Write downloaded file to local directory
		$write = file_put_contents($ontology_io_path .'/'. $file_name, $data);
		if ($write===false) {
			debug_log(__METHOD__
				. " Error writing downloaded ontology file " . PHP_EOL
				. ' path: ' .to_string($ontology_io_path .'/'. $file_name) . PHP_EOL
				. ' url param: ' . to_string($url)
				, logger::ERROR
			);
			$response->errors[] = 'file writing fails';
			$response->msg .= ' Error writing downloaded ontology file '.$file_name;
			return $response;
		}

		// response
		$response->result = true;
		$response->msg .= ' OK. Request done successfully for file ' . $file_name;


		return $response;
	}//end download_remote_ontology_file



	/**
	* GET_ONTOLOGY_UPDATE_INFO
	* Collect local ontology files and ontology info json file
	* Called by API.
	* Merge all information in a object with the available ontology files
	* @param object $options
	* @return object $response
	* {
	*	result : {
	*		info : {},
	* 		files : [{
	* 			section_tipo : oh0,
	* 			tld : oh,
	* 			url : https://master.dedalo.dev/dedalo/install/import/ontology/6.4/oh0.copy.gz
	* 		}]
	* 	}
	* }
	*/
	public static function get_ontology_update_info( array $version ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// version
		$ontology_io_path = ontology_data_io::get_ontology_io_path( $version );

		if (!$ontology_io_path) {
			$response->msg		= 'Error. Invalid version number. This version does not contain ontology files. ' . implode('.', $version);
			$response->errors[]	= 'Unsupported version number. '. implode('.', $version);
			return $response;
		}

		// result
		$result = new stdClass();
			$result->info	= null;
			$result->files	= [];

		$ontology_io_url = ontology_data_io::get_ontology_io_url( $version );

		// files
		$files = get_dir_files( $ontology_io_path, ['json', 'gz'] );
		foreach ( $files as $file_path ) {

			$file_name = basename( $file_path );

			if( $file_name === 'ontology.json'){
				$ontology_info_txt	= file_get_contents( $ontology_io_path.'/'.$file_name );
				$ontology_info		= json_decode( $ontology_info_txt );

				$result->info = $ontology_info;
			}else{
				preg_match('/^([a-z_]{2,}).copy.gz$/', $file_name, $matches);

				$file_item = new stdClass();
					$file_item->tld				= $matches[1];
					$file_item->section_tipo	= $matches[1]==='matrix' ? 'matrix' : $matches[1].'0';
					$file_item->url				= DEDALO_PROTOCOL.DEDALO_HOST.$ontology_io_url.'/'. basename( $file_name );

				$result->files[] = $file_item;
			}
		}

		$response->result = $result;
		$response->msg = 'OK. request done';

		return $response;
	}//end get_ontology_update_info



	/**
	* CHECK_REMOTE_SERVER
	* Exec a curl request with given data to check current server status
	* @param object $server
	* {
	* 	url: https://master.dedalo.dev/dedalo/core/api/v1/json/
	* }
	* @return object $response
	*/
	public static function check_remote_server( object $server ) : object {

		// rqo
			$rqo = new stdClass();
				$rqo->dd_api	= "dd_utils_api";
				$rqo->action	= "get_ontology_server_ready";

			$rqo_string = 'rqo=' . json_encode($rqo);

		// curl_request
			$response = curl_request((object)[
				'url'				=> $server->url,
				'post'				=> true,
				'postfields'		=> $rqo_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> true,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);


		return $response;
	}//end check_remote_server



}//end ontology_data_io
