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
			$section_tipo	= 'ontology40';
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

		$section_tipo	= 'ontology40';
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

		foreach ($data as $current_value) {
			$current_value->version			= $version;
			$current_value->date			= $date;
			$current_value->entity_id		= DEDALO_ENTITY_ID;
			$current_value->entity			= DEDALO_ENTITY;
			$current_value->entity_label	= DEDALO_ENTITY_LABEL;
			$current_value->host			= DEDALO_HOST;
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
	* IMPORT_FROM_FILE
	* Get ontology file in copy format from ontology server
	* And import into the matrix_ontology table.
	* @param object $file_item
	* {
	*  "section_tipo" 	: "ontology40",
	*  "tld" 			: "dd"
	*  "url" 			: "https://master.dedalo.dev/import/ontology/6.4/ontology40_dd.copy.gz"
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
			$ontology_io_path	= ontology_data_io::get_ontology_io_path();

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

