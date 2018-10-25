<?php
// Loads parent class diffusion
include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion.php');
include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_sql.php');
/*
* CLASS DIFFUSION_SOCRATA
*/
class diffusion_socrata extends diffusion  {
		
	public static $database_name;
	public static $database_tipo;
	public static $ar_table;
	public static $ar_table_data;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {
		
		parent::__construct($options=null);
	}//end __construct



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $request_options
	* @param bool $resolve_references
	* @return obj $response
	*/
	public function update_record( $request_options, $resolve_references=false ) {
		
		$start_time = start_time();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
	
		// options
			$options = new stdClass();
				$options->section_tipo 			= null;
				$options->section_id   			= null;
				$options->diffusion_element_tipo= null;
				$options->recursion_level 		= 0;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// Mandatory vars
			if(empty($options->section_tipo) || empty($options->section_id) || empty($options->diffusion_element_tipo)) {
				debug_log(__METHOD__." ERROR ON UPDATE RECORD $options->section_id - $options->section_tipo - $options->diffusion_element_tipo. Undefined mandatory options var".to_string(), logger::ERROR);
				return false;
			}	

		// Build data (array of json_row objects)
			$ar_rows = [];
			$ar_all_project_langs = defined('DEDALO_DIFFUSION_LANGS') ? unserialize(DEDALO_DIFFUSION_LANGS) : unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
			foreach ($ar_all_project_langs as $current_lang) {
				$json_row_options = new stdClass();
					$json_row_options->section_tipo 		  = $options->section_tipo;
					$json_row_options->section_id 			  = $options->section_id;
					$json_row_options->diffusion_element_tipo = $options->diffusion_element_tipo;
					$json_row_options->lang 				  = $current_lang;				
				$json_row = $this->build_json_row($json_row_options);
				// Add
				$ar_rows[] = $json_row;
			}
			#dump(json_encode($ar_rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ' ar_rows ++ '.to_string());
			
		// Configure final objects to build upsert bulk action
			$socrata_id 	= ':id';
			$socrata_delete = ':deleted';
			$ar_socrata_rows = array_map(function($row) use($socrata_id, $socrata_delete){
				// socrata_id. Add normalized socrata id
				$row->$socrata_id = $row->id;
				// socrata_delete. Set to delete when publication is false
				if (isset($row->publication) && $row->publication===false) {
					$row->$socrata_delete = true;
				}

				return $row;
			}, $ar_rows);
			dump(json_encode($ar_socrata_rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ' ar_socrata_rows ++ '.to_string());

		// Update data
			//self::upsert_data($ar_socrata_rows);

		return false;
	}//end update_record



	/**
	* UPSERT_DATA
	* @return 
	*/
	public static function upsert_data( $data ) {

		require DEDALO_ROOT . '/autoload.php';

		$app_token 			= null;
		$socrata_user		= null;
		$socrata_password 	= null;
		
		// Connect
		$client = new Socrata("soda.demo.socrata.com", $app_token, $socrata_user, $socrata_password);
	    
	    // Post our response
	    $response = $client->post("wezw-qxis", json_encode($data));


	    return $response;
	}//end upsert_data



}
?>