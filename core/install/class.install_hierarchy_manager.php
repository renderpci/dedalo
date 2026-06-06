<?php declare(strict_types=1);

/**
 * CLASS INSTALL_HIERARCHY_MANAGER
 * Encapsulates hierarchy file discovery, import, activation,
 * and installation operations.
 *
 * @package Dedalo
 * @subpackage Install
 */
class install_hierarchy_manager {

	/**
	* GET_AVAILABLE_HIERARCHY_FILES
	* List of all available hierarchy files found in install directory
	* @see class area_development get_ar_widgets use
	* @return object $response
	*/
	public static function get_available_hierarchy_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config		= install_config_manager::get_config();
			$dir_path	= $config->hierarchy_files_dir_path;

		// labels
			$hierarchies_json	= file_get_contents(__DIR__.'/hierarchies.json');
			$hierarchies		= json_decode($hierarchies_json);

		// read the dir
			$hierarchy_files = (array)glob($dir_path . '/*.copy.gz');

		// hierarchy_files conform items
			$hierarchy_files = array_map(function($file) use($hierarchies){

				$file_name		= pathinfo($file)['basename'];
				$section_tipo	= explode('.', $file_name)[0];
				$tld			= preg_replace('/\d/', '', $section_tipo);

				$current_hierarchy = array_find($hierarchies ?? [], function($el) use($tld){
					return strtolower($el->tld)===strtolower($tld);
				}) ?? new stdClass();

				$label					= $current_hierarchy->label ?? 'undefined ['.$tld.']';
				$type					= strpos($section_tipo, '2')!==false ? 'model' : 'term';
				$typology				= $current_hierarchy->typology ?? 'undefined typology ['.$tld.']';
				$active_in_thesaurus	= $current_hierarchy->active_in_thesaurus ?? 'undefined typology ['.$tld.']';

				$item = (object)[
					'file'					=> $file,
					'file_name'				=> $file_name,
					'section_tipo'			=> $section_tipo,
					'tld'					=> $tld,
					'label'					=> $label,
					'type'					=> $type,
					'typology'				=> $typology,
					'active_in_thesaurus'	=> $active_in_thesaurus
				];

				return $item;
			}, $hierarchy_files);

			$response->result	= $hierarchy_files;
			$response->msg		= 'OK. Request done '.__METHOD__;

		// empty case
			if (empty($hierarchy_files)) {
				debug_log(__METHOD__
					. "Dédalo Error: directory '$dir_path' is not accessible or empty!  " . PHP_EOL
					. ' dir_path: ' . to_string($dir_path) . PHP_EOL
					. ' hierarchy_files: ' . to_string($hierarchy_files)
					, logger::ERROR
				);
			}

		return $response;
	}//end get_available_hierarchy_files

	/**
	* GET_HIERARCHY_TYPLOLOGIES
	* Read JSON file 'hierarchies_typologies.json'
	* @return array $typlologies
	* Sample:
	* [
	*  {
	*	"typology": 6,
	*	"label": "Web sites"
	*  },
	*  ...
	* ]
	*/
	public static function get_hierarchy_typlologies() : array {

		$json_file_path = __DIR__ . '/hierarchies_typologies.json';

		if (!file_exists($json_file_path)) {
			debug_log(__METHOD__
				. " Error: file do not exists: " . $json_file_path
				, logger::ERROR
			);
			return [];
		}

		$json_data = file_get_contents($json_file_path);
		$typologies = json_decode($json_data);

		return $typologies;
	}//end get_hierarchy_typlologies

	/**
	* IMPORT_HIERARCHY_MAIN_RECORDS
	* Import basic matrix_hierarchy_main records
	* Countries and main hierarchies (thematic, special, semantic, languages)
	* Get already exported SQL file placed in ./dedalo/install/import/matrix_hierarchy_main.sql
	* and execute the SQL insert code inside
	* (!) Note that all sections are inactive by default. Use 'activate_hierarchy' to load terms and models and activate hierarchy
	* @return object $response
	*/
	public static function import_hierarchy_main_records() : object {

		// set timeout in seconds
		set_time_limit(600); // 10 minutes (10*60)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$config			= install_config_manager::get_config();
			$exec			= true;
			$sql_file_path	= DEDALO_ROOT_PATH . '/install/import/matrix_hierarchy_main.sql';
			$matrix_table	= 'matrix_hierarchy_main';

		// check if file exists
			if (!file_exists($sql_file_path)) {
				$response->msg = 'Error. The required file do not exists: '.$sql_file_path;
				return $response;
			}

		// terminal command psql delete previous records
			// SEC-041: shell-quote DB / user / matrix_table constants.
			// `$matrix_table` originates from a server-iterated list (not user
			// input); quoted defence-in-depth. The `\"<table>\"` SQL identifier
			// quoting inside the -c argument is preserved.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors -c "DELETE FROM \"'.$matrix_table.'\"; ALTER SEQUENCE IF EXISTS '.$matrix_table.'_id_seq RESTART WITH 1 ;";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 1 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// terminal command psql execute sql query from .sql file
			// SEC-041 defence-in-depth.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors --file '.escapeshellarg($sql_file_path);
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 2 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		// update sequence value
			$query = 'SELECT setval(\'matrix_hierarchy_main_id_seq\', (SELECT MAX(id) FROM "matrix_hierarchy_main")+1)';
			// SEC-041 defence-in-depth: $query is a hard-coded SQL string.
			$command = DB_BIN_PATH.'psql -d '.escapeshellarg($config->db_install_name).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
				.'-c "'.$query.';";';
			debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
			if ($exec) {
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response 3 (shell_exec): ".json_encode($command_res), logger::DEBUG);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end import_hierarchy_main_records

	/**
	* ACTIVATE_HIERARCHY
	* Activate thesaurus hierarchy by tld2
	* @param object $options
	*  Sample
	* {
	*	"file": "/localdir/dedalo/install/import/hierarchy/fauna1.copy.gz",
	*	"file_name": "fauna1.copy.gz",
	*	"section_tipo": "fauna1",
	*	"tld": "fauna",
	*	"label": "Fauna",
	*	"type": "term", // or model
	*	"typology": 11
	* }
	* @return object $response
	*/
	public static function activate_hierarchy(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// options
			$tld					= $options->tld;
			$typology				= $options->typology;
			$label					= $options->label;
			$active_in_thesaurus	= $options->active_in_thesaurus ?? true;

		// short vars
			$config	= install_config_manager::get_config();

		// hierarchy search
			$hierarchy_row	= hierarchy::get_hierarchy_by_tld( $tld );
			$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;
			$section_id		= $hierarchy_row->section_id;
			$section_exists	= !empty($section_id);

		// hierarchy not already exists case. Create a new one
			if ($section_exists===false) {

				// update sequence value
				$matrix_table = 'matrix_hierarchy_main';
				$query = 'SELECT setval(\''.$matrix_table.'_id_seq\', (SELECT MAX(id) FROM "'.$matrix_table.'")+1)';
				// SEC-041 defence-in-depth.
				$command = DB_BIN_PATH.'psql -d '.escapeshellarg(DEDALO_DATABASE_CONN).' -U '.escapeshellarg(DEDALO_USERNAME_CONN).' '.$config->host_line.' '.$config->port_line.' --echo-errors '
					.'-c "'.$query.';";';
				debug_log(__METHOD__." Executing terminal DB command ".PHP_EOL. to_string($command), logger::WARNING);
				$command_res = shell_exec($command);
				debug_log(__METHOD__." Exec response (shell_exec): ".json_encode($command_res), logger::DEBUG);

				// create a new section
				$section = section::get_instance(
					$section_tipo, // string section_tipo
					'edit' // string mode
				);
				$section_id = $section->create_record();
			}

		// check valid $section_id
			if (empty($section_id)) {
				$msg = " ERROR creating a new section in '$section_tipo' - tld: '$tld'";
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;

				return $response; // return error here !
			}

		// new hierarchy case
			if ($section_exists===false) {

				// tld
					$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
					$model_name	= ontology_node::get_model_by_tipo($tld_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$tld_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$tld];
					$component->set_dato($dato);
					$component->Save();

				// typology
					$hierarchy_type_tipo	= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // hierarchy9
					$model_name				= ontology_node::get_model_by_tipo($hierarchy_type_tipo, true);
					$component				= component_common::get_instance(
						$model_name,
						$hierarchy_type_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$typology];
					$component->set_dato($dato);
					$component->Save();

				// label
					$label_tipo	= DEDALO_HIERARCHY_LABEL_TIPO; // hierarchy7
					$model_name	= ontology_node::get_model_by_tipo($label_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$label_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = [$label];
					$component->set_dato($dato);
					$component->Save();

				// name
					$name_tipo	= DEDALO_HIERARCHY_LANG_TIPO;	// hierarchy8
					$model_name	= ontology_node::get_model_by_tipo($name_tipo, true);
					$component	= component_common::get_instance(
						$model_name,
						$name_tipo,
						$section_id,
						'edit',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$lang_locator = lang::get_lang_locator_from_code(DEDALO_DATA_LANG_DEFAULT);
					$dato = [$lang_locator];
					$component->set_dato($dato);
					$component->Save();
			}

		// active hierarchy
			$active_tipo	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// hierarchy4
			$model_name		= ontology_node::get_model_by_tipo($active_tipo, true);
			$component		= component_common::get_instance(
				$model_name,
				$active_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato = json_decode('[
			  {
				"type": "'.DEDALO_RELATION_TYPE_LINK.'",
				"section_id": "'.NUMERICAL_MATRIX_VALUE_YES.'",
				"section_tipo": "'.DEDALO_SECTION_SI_NO_TIPO.'",
				"from_component_tipo": "'.DEDALO_HIERARCHY_ACTIVE_TIPO.'"
			  }
			]');
			$component->set_dato($dato);
			$component->Save();

		// active in thesaurus
			$active_view_ts_tipo	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;	// hierarchy4
			$model_name				= ontology_node::get_model_by_tipo($active_view_ts_tipo, true);
			$component				= component_common::get_instance(
				$model_name,
				$active_view_ts_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$target_active_ts_section_id = ($active_in_thesaurus===true) ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO;

			$active_data = new locator();
				$active_data->set_type(DEDALO_RELATION_TYPE_LINK);
				$active_data->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$active_data->set_section_id($target_active_ts_section_id);
				$active_data->set_from_component_tipo(DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO);

			$component->set_dato($active_data);
			$component->Save();

		// set real section tipo (!) needed to create virtual section
			// source_real_section_tipo
			$model_name	= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO, true);
			$component	= component_common::get_instance(
				$model_name,
				DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO,
				$section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$component->set_dato([DEDALO_THESAURUS_SECTION_TIPO]);
			$component->Save();

		// create ontology tld (generate_virtual_section)
			$options = (object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			];
			$call_response = hierarchy::generate_virtual_section($options);
			if ($call_response->result===false) {
				$msg = " ERROR " . PHP_EOL . to_string($call_response->msg);
				debug_log(__METHOD__
					. $msg
					, logger::ERROR
				);
				$response->errors[] = $msg;
			}

		// set target section data
			// target thesaurus
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;	// 'hierarchy53';
				$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$dato = [$tld.'1'];
				$component->set_dato($dato);
				$component->Save();

			// target model
				$component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;	// 'hierarchy58';
				$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
				$component		= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$dato = [$tld.'2'];
				$component->set_dato($dato);
				$component->Save();

		// set children data
			if ($typology==2) {
				// general term
					$component_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO;	// 'hierarchy45';
					$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
					$component		= component_common::get_instance(
						$model_name,
						$component_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato = json_decode('[
						{
							"type": "dd48",
							"section_id": "1",
							"section_tipo": "'.$tld.'1",
							"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_TIPO.'"
						}
					]');
					$component->set_dato($dato);
					$component->Save();

				// general model
					$dir_path		= $config->hierarchy_files_dir_path;
					$models_file	= $dir_path . '/' . strtolower($tld) . '.copy.gz';
					if (file_exists($models_file)) {

						$component_tipo	= DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;	// 'hierarchy59';
						$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
						$component		= component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						$dato = json_decode('[
							{
								"type": "dd48",
								"section_id": "2",
								"section_tipo": "'. $tld.'2",
								"from_component_tipo": "'.DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO.'"
							}
						]');
						$component->set_dato($dato);
						$component->Save();

					}else{
						debug_log(__METHOD__
							." Ignored not existing model data for tld: ".to_string($tld)
							, logger::WARNING
						);
					}
			}

		// response OK
		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;

		return $response;
	}//end activate_hierarchy

	/**
	* INSTALL_HIERARCHIES
	* Install selected hierarchies from options
	* @param object $options
	* @return object $response
	*/
	public static function install_hierarchies(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// selected_hierarchies
			$selected_hierarchies = $options->selected_hierarchies ?? [];

		// get available hierarchy files
			$hierarchies = self::get_available_hierarchy_files();

		// process each selected hierarchy
			$ar_responses = [];
			foreach ($selected_hierarchies as $item) {

				// find the hierarchy item in available files
				$found = array_find($hierarchies->result, function($el) use($item){
					return $el->tld === $item->tld;
				});

				if ($found===false) {
					$msg = " Error: hierarchy item not found: " . to_string($item);
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->errors[] = $msg;
					continue;
				}

				// import hierarchy file using backup::import_from_copy_file
				$import_options = (object)[
					'file'		=> $found->file,
					'section_tipo'	=> $found->section_tipo
				];
				$ar_responses[] = backup::import_from_copy_file( $import_options );

				// creates/activate the new hierarchy and ontology
				$ar_responses[] = self::activate_hierarchy($item);
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;
		$response->responses	= $ar_responses;

		return $response;
	}//end install_hierarchies

}//end class install_hierarchy_manager
