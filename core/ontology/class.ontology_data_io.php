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

