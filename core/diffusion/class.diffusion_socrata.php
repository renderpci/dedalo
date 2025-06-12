<?php declare(strict_types=1);
// include composer lib soda-php
require DEDALO_LIB_PATH . '/vendor/soda-php/public/socrata.php';

/**
* CLASS DIFFUSION_SOCRATA
* Manages publication on Socrata Open Data system
*/
class diffusion_socrata extends diffusion  {



	public static $database_name;
	public static $database_tipo;
	public static $ar_table;
	public static $ar_table_data;



	/**
	* CONSTRUCT
	* @param object|null $options = null
	*/
	function __construct( ?object $options=null ) {

		parent::__construct($options);
	}//end __construct



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object|null $options = null
	* {
	* 	section_tipo: string
	* 	section_id: string|int
	* 	diffusion_element_tipo: string
	* 	recursion_level: int
	* 	component_publication_tipo: string|null
	* 	skip_tipos: array|null
	* 	resolve_references: bool
	* }
	* @return object $response
	*/
	public function update_record( ?object $options ) : object {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg		= [];
				$response->errors	= [];
				$response->class	= get_called_class();

		// options
			$section_tipo			= $options->section_tipo;
			$section_id				= $options->section_id;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;

		// check config
			if (!defined('SOCRATA_CONFIG')) {
				$response->msg[] = 'Error. SOCRATA_CONFIG is not set. Add to Dédalo config file to allow export Socrata';
				$response->errors[] = 'constant SOCRATA_CONFIG is not defined';
				return $response;
			}

		// Mandatory vars
			if(empty($options->section_tipo) || empty($options->section_id) || empty($options->diffusion_element_tipo)) {
				debug_log(__METHOD__
					." ERROR ON UPDATE RECORD $options->section_id - $options->section_tipo - $options->diffusion_element_tipo. Undefined mandatory options var" . PHP_EOL
					.' options: ' . to_string($options)
					, logger::ERROR
				);
				$response->msg[] = 'Error. Undefined mandatory options var';
				$response->errors[] = 'Undefined one or more mandatory vars';
				return $response;
			}

		// table
			$table_tipo			= diffusion::get_table_tipo($diffusion_element_tipo, $section_tipo);
			$RecorObj_dd		= new RecordObj_dd($table_tipo);
			$table_properties	= $RecorObj_dd->get_propiedades(true) ?? new stdClass();

		// ar_rows. Build data (array of json_row objects) for each lang
			$ar_rows = [];
			$ar_all_project_langs = defined('DEDALO_DIFFUSION_LANGS')
				? DEDALO_DIFFUSION_LANGS
				: DEDALO_PROJECTS_DEFAULT_LANGS;
			// overwrite langs from properties
			if (isset($table_properties->langs)) {
				$ar_all_project_langs = $table_properties->langs;
			}
			foreach ($ar_all_project_langs as $current_lang) {
				$json_row_options = new stdClass();
					$json_row_options->section_tipo 		  = $section_tipo;
					$json_row_options->section_id 			  = $section_id;
					$json_row_options->diffusion_element_tipo = $diffusion_element_tipo;
					$json_row_options->lang 				  = $current_lang;
				$json_row = $this->build_json_row($json_row_options);
				// Add
				$ar_rows[] = $json_row;

				// debug
				if(SHOW_DEBUG===true) {
					// dump($json_row, ' json_row ++ '.to_string()); die();
				}
			}


		// Configure final objects to build upsert bulk action
			$socrata_delete = ':deleted';
			$ar_socrata_rows = array_map(function($row) use($socrata_delete, $table_properties){

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

				// exclude_columns (defined in table properties)
				if (isset($table_properties->exclude_columns)) {
					foreach ($table_properties->exclude_columns as $column) {
						if (isset($row->{$column})) {
							unset($row->{$column});
						}
					}
				}

				return $row;
			}, $ar_rows);

			// debug
				if(SHOW_DEBUG===true) {
					// dump($ar_socrata_rows, ' ar_socrata_rows ++ '.to_string()); die();
				}

		// debug
			// dump($table_properties, ' table_properties ++ '.to_string());
			// dump($ar_rows, ' ar_rows ++ '.to_string());
			// die();
			debug_log(__METHOD__
				." ar_socrata_rows ".json_encode($ar_socrata_rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
				, logger::DEBUG
			);

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
			$tables_map	= diffusion_sql::get_diffusion_element_tables_map($diffusion_element_tipo);
			$table_obj	= $tables_map->{$section_tipo} ?? null;
			if (empty($table_obj)) {
				dump($tables_map, ' diffusion_element_tables_map ++ '.to_string());
				$response->msg[] = 'Error. this section ('.$section_tipo.') do not have Socrata diffusion';
				$response->errors[] = 'Section ('.$section_tipo.') is not in the diffusion_element_tables_map';
				return $response;
			}
			$socrata_config	= (object)SOCRATA_CONFIG;
			$path			= $socrata_config->mode==='pro'
				? $table_obj->properties->path_pro // production mode
				: $table_obj->properties->path_pre; // pre-production mode
			if (empty($path)) {
				dump($tables_map, ' diffusion_element_tables_map ++ '.to_string());
				$response->msg[] = 'Error. empty section ('.$section_tipo.') Socrata path';
				$response->errors[] = 'Section ('.$section_tipo.') do not has properties paths defined';
				return $response;
			}

		// Upsert data
			$result_obj = self::upsert_data(
				$ar_socrata_rows,
				$path
			);

			$result	= isset($result_obj->error) ? false : true;
			$msg	= isset($result_obj->message) ? $result_obj->message : to_string($result);

		// saves publication data
			diffusion::update_publication_data($section_tipo, $section_id);

		// response
			$response->result	= $result;
			$response->msg		= $msg;

		// debug
			if(SHOW_DEBUG===true) {
				$time_complete	= exec_time_unit($start_time,'ms');
				$response->time	= $time_complete;
			}


		return $response;
	}//end update_record



	/**
	* UPSERT_DATA
	* @see https://github.com/socrata/soda-php
	* @see https://ctti.azure-westeurope-prod.socrata.com/dataset/render_data_test/7w3e-npuc/revisions/0
	* @see https://ctti.azure-westeurope-prod.socrata.com/resource/w4hd-c82i.json
	* @param array $data
	* @param string $path
	* @return object $response
	*/
	public static function upsert_data( array $data, string $path ) : object {

		// socrata_config
			$socrata_config		= (object)SOCRATA_CONFIG;
			$app_token			= $socrata_config->app_token;
			$socrata_user		= $socrata_config->socrata_user;
			$socrata_password	= $socrata_config->socrata_password;
			$server				= $socrata_config->server;

		// Connect
			$client = new Socrata(
				$server,
				$app_token,
				$socrata_user,
				$socrata_password
			);

		// Test read data
			// $response = $socrata->get("7w3e-npuc");
			// dump($response, ' response ++ '.to_string());

		// Post our response
			$data_json	= json_encode($data, JSON_UNESCAPED_SLASHES | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_APOS);
			$response	= $client->post(
				$path,
				$data_json
			);

		// debug
			// errors
			$error = $response->error ?? $response->Errors ?? null;
			if ($error===true || (int)$error>0) {
				debug_log(__METHOD__
					." !!! ERROR ON UPSERT SOCRATA RECORD ".json_encode($response, JSON_PRETTY_PRINT) . PHP_EOL
					.' response: ' . to_string($response) . PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);

			}else{
				debug_log(__METHOD__
					." Socrata response" . PHP_EOL
					.' response: ' . json_encode($response, JSON_PRETTY_PRINT)
					, logger::DEBUG
				);
			}


		return $response;
	}//end upsert_data



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* Resolves Ontology all related sections (linked from socrata tables) ready to publish in Socrata.
	* It is used to determine whether the current section has a Diffusion button to publish the content.
	* @param string $diffusion_element_tipo
	* @param string|null $class_name = null
	* @return array $ar_diffusion_sections
	* sample:
	* [
	*	"dmm1023",
	*	"oh1",
	*	"rsc205",
	*	"mdcat757",
	*	"mdcat813"
	* ]
	*/
	public static function get_diffusion_sections_from_diffusion_element( string $diffusion_element_tipo, ?string $class_name=null ) : array {

		$ar_diffusion_sections = [];

		// tables
		$tables = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
			$diffusion_element_tipo,
			'table',
			'children_recursive',
			false // bool search_exact
		);
		foreach ($tables as $current_table_tipo) {

			$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
			switch ($model_name) {
				case 'table_alias':
					// First try section (thesaurus needed)
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					if (!isset($ar_related[0])) {
						// If not, We search 'table' now
						$ar_table = common::get_ar_related_by_model('table', $current_table_tipo);
						if (isset($ar_table[0])) {
							$ar_related = common::get_ar_related_by_model('section', $ar_table[0]);
						}
					}
					break;

				case 'table':
				default:
					// Pointer to section
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					break;
			}

			// add section
			if (isset($ar_related[0])) {
				$ar_diffusion_sections[] = $ar_related[0];
			}
		}//end foreach ($tables as $current_table_tipo)


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



}//end diffusion_socrata class
