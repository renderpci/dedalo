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
				//$row->$socrata_id = $row->id;
				// socrata_delete. Set to delete when publication is false
				

				// publish_date. Format as Socrata need (date_time float with miliseconds)				
				#$row->publish_date->value = date('Y-m-d\TH:i:s.u');

				// Simplify values to plain value instead object
				foreach ($row as $key => $value_obj) {

					// Specific socrata formats
					switch ($value_obj->model) {
						case 'field_date':
							// (!) Note that socrata not support zero values in date (like 1998-00-00)
							// because you need fill this values with number one like '01'
							// #$socrata_value = date("Y-m-d\TH:i:s.u", strtotime($value_obj->value));
							if (!empty($value_obj->value)) {
								$socrata_value = preg_replace('/(-00-00)/', '-01-01', $value_obj->value);
								$socrata_value = preg_replace('/( )/', 'T', $socrata_value) . '.000';
							}else{
								$socrata_value = null;
							}
							break;
						
						default:
							$socrata_value = $value_obj->value;
							break;
					}					

					$row->$key = $socrata_value;
				}

				// Publication set to delete record on true
				if (isset($row->publication)) {
					if ($row->publication===false) {
						$row->{$socrata_delete} = true;
					}
					unset($row->publication);
				}
				
				return $row;
			}, $ar_rows);			
			#dump($ar_socrata_rows, ' ar_socrata_rows ++ '.to_string());
			#dump(json_encode($ar_socrata_rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ' ar_socrata_rows ++ '.to_string());
			debug_log(__METHOD__." ar_socrata_rows ".json_encode($ar_socrata_rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), logger::DEBUG);

		// Update data
			// Test data
				/*
				$ar_socrata_rows = [];
				$socrata_row = new stdClass();
					#$socrata_row->{$socrata_id}		= 3;
					$socrata_row->id 				= 'oh1_1_lg-eng';				
					$socrata_row->{$socrata_delete} = true;
				$ar_socrata_rows[] = $socrata_row;
				
				$socrata_row = new stdClass();
					#$socrata_row->{$socrata_id}	= 10;
					$socrata_row->id 				= 6;
					$socrata_row->name 				= 'Jane';
					$socrata_row->surname 			= 'Flash '.$socrata_row->id;
					#$socrata_row->{$socrata_delete} = true;
				$ar_socrata_rows[] = $socrata_row; */

				#$ar_socrata_rows = [$ar_socrata_rows[1]];

		// Get socrata path from 'table' item 
			$socrata_config = (object)SOCRATA_CONFIG;
			$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map($options->diffusion_element_tipo);
			$table_obj = $diffusion_element_tables_map->{$options->section_tipo};
			if ($socrata_config->mode==='pro') {
				# production mode
				$path = $table_obj->propiedades->path_pro;
			}else{
				# pre-production mode
				$path = $table_obj->propiedades->path_pre;
			}

		// Upsert data
			$result_obj = self::upsert_data($ar_socrata_rows, $path);

			$result = isset($result_obj->error) ? false : true;
			$msg 	= isset($result_obj->message) ? $result_obj->message : to_string($result);

		// saves publication data 
			diffusion::update_publication_data($options->section_tipo, $options->section_id);

		$response->result 	= $result;
		$response->msg 		= $msg;

		return $response;
	}//end update_record



	/**
	* UPSERT_DATA
	* @see https://github.com/socrata/soda-php
	* @return 
	*/
	public static function upsert_data( $data, $path ) {
		$socrata_config = (object)SOCRATA_CONFIG;
	
		require DEDALO_ROOT . '/autoload.php';

		$app_token 			= $socrata_config->app_token;
		$socrata_user		= $socrata_config->socrata_user;
		$socrata_password 	= $socrata_config->socrata_password;
		$server 			= $socrata_config->server;
		
		// Test read data
			/*
			$socrata = new Socrata($server, $app_token, $socrata_user, $socrata_password);
			$response = $socrata->get("7w3e-npuc");
			dump($response, ' response ++ '.to_string());
			*/

		// https://ctti.azure-westeurope-prod.socrata.com/dataset/render_data_test/7w3e-npuc/revisions/0
		// https://ctti.azure-westeurope-prod.socrata.com/resource/w4hd-c82i.json
		
		// Connect
		$client = new Socrata($server, $app_token, $socrata_user, $socrata_password);
			
		// Post our response
			$data_json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_APOS );
			$response  = $client->post($path, $data_json);
			#dump($response, ' response ++ '.to_string());
			debug_log(__METHOD__." +++ response ".json_encode($response, JSON_PRETTY_PRINT), logger::DEBUG);
			
			if (isset($response->Errors) && (int)$response->Errors>0) {
				debug_log(__METHOD__." !!! ERROR ON UPSERT SOCRATA RECORD ".json_encode($response, JSON_PRETTY_PRINT), logger::ERROR);
				debug_log(__METHOD__." !!! ERROR +++++ data_json ". json_encode(json_decode($data_json), JSON_PRETTY_PRINT) , logger::ERROR);
			}

		return $response;
	}//end upsert_data



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element($diffusion_element_tipo) {
		
		$ar_diffusion_sections = array();

		# tables. RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, $modelo_name='table', $relation_type='children_recursive', $search_exact=false);
		$tables = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, 'table', 'children_recursive', false);
		foreach ($tables as $current_table_tipo) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
			switch ($modelo_name) {
				case 'table_alias':
					# First try section (thesaurus needed)
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					if (!isset($ar_related[0])) {
						# If not, We search 'table' now
						$ar_table = common::get_ar_related_by_model('table', $current_table_tipo);
						if (isset($ar_table[0])) {
							$ar_related = common::get_ar_related_by_model('section', $ar_table[0]);
						}
					}
					break;
				
				case 'table':
				default:
					# Pointer to section
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					break;
			}
		
			if (isset($ar_related[0])) {
				$ar_diffusion_sections[] = $ar_related[0];
			}
		}

		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



}
?>