<?php declare(strict_types=1);
/**
* update_ontology
* Widget to manage Dédalo Ontology updates
*/
class update_ontology {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'export_to_translate',
		'update_ontology'
	];



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		// servers
			if (defined('ONTOLOGY_SERVERS')) {
				$servers = ONTOLOGY_SERVERS;
			}else if (defined('STRUCTURE_SERVER_URL') && defined('STRUCTURE_SERVER_CODE')) {
				$servers = [(object)[
					'name'	=> 'Old Ontology server config. Define ONTOLOGY_SERVERS ASAP',
					'url'	=> STRUCTURE_SERVER_URL,
					'code'	=> STRUCTURE_SERVER_CODE
				]];
			}else{
				$servers = [];
			}

		// local files
			if (IS_AN_ONTOLOGY_SERVER===true) {
				$servers[] = (object)[
					'name'	=> 'Local files',
					'url'	=> DEDALO_PROTOCOL.DEDALO_HOST.DEDALO_API_URL,
					'code'	=> 'localhost'
				];
			}

		// check ontology servers
			$ontology_servers = [];
			foreach ($servers as $current_server) {

				$server = (object)$current_server;

				$server_ready			= ontology_data_io::check_remote_server( $server );
				$server->msg			= $server_ready->msg;
				$server->errors			= $server_ready->errors;
				$server->response_code	= $server_ready->code;
				$server->result			= $server_ready->result;

				if($server->code === 'localhost' && is_object($server->result)){
					$server->result->result = true;
				}

				$ontology_servers[]	= $server;
			}

		// tld list
			$DEDALO_PREFIX_TIPOS = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			// force to add 'ontology' to the list
			$DEDALO_PREFIX_TIPOS = array_values(array_unique(
				[...$DEDALO_PREFIX_TIPOS, 'ontology', 'ontologytype']
			));

		// current_ontology: dd1 properties
			$ontology_node		= ontology_node::get_instance('dd1');
			$dd1_properties		= $ontology_node->get_properties();
			$current_ontology	= (object)[
				'date'			=> $dd1_properties->date,
				'host'			=> $dd1_properties->host,
				'entity'		=> $dd1_properties->entity,
				'entity_label'	=> $dd1_properties->entity_label,
				'version'		=> $dd1_properties->version
			];

		$result = (object)[
			'servers'				=> $ontology_servers,
			'current_ontology'		=> $current_ontology,
			'prefix_tipos'			=> $DEDALO_PREFIX_TIPOS,
			'structure_from_server'	=> (defined('STRUCTURE_FROM_SERVER') ? STRUCTURE_FROM_SERVER : null),
			'body'					=>  label::get_label('update_ontology')." is disabled for ".DEDALO_ENTITY,
			'confirm_text'			=> '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! WARNING !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'!!!!!!!!!!!!!! DELETING ACTUAL ONTOLOGY !!!!!!!!!!!!!!!!!!!!!!!!!!!' . PHP_EOL
				.'Are you sure you want to overwrite the current Ontology data?' .PHP_EOL
				.'You will lose all changes made to the local Ontology.'
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	* EXPORT_TO_TRANSLATE
	* Generates a CSV file with the given TLDs information
	* @param object $options
	* {
	* 	export_ontology_tld_list: array,
	* 	export_ontology_exclude_models: array
	* }
	* @return object $response
	*/
	public static function export_to_translate(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';
			$response->errors	= [];

		// options
			$export_ontology_langs			= $options->export_ontology_langs ?? [];
			$export_ontology_tld_list		= $options->export_ontology_tld_list ?? [];
			$export_ontology_exclude_models	= $options->export_ontology_exclude_models ?? [];

		try {

			// get all TLDs records

			// section tipo list from TLD list. E.g. dd => dd0
			$ar_section_tipo = array_map(function($tld){
				return $tld . '0';
			}, $export_ontology_tld_list);


			// filter compose
			$filter_items = [];

			// filter. Exclude models
			$filter_items[] = json_decode('
				{
					"q": [
						{
							"section_id": "2",
							"section_tipo": "dd64",
							"from_component_tipo": "ontology30"
						}
					],
					"q_operator": null,
					"path": [
						{
							"name": "Is model",
							"model": "component_radio_button",
							"section_tipo": "dd0",
							"component_tipo": "ontology30"
						}
					],
					"q_split": false,
					"type": "jsonb"
				}
			');

			// filter. From model deep term regex !=item
			foreach ($export_ontology_exclude_models as $el) {
				$q = '!=' . $el;
				$filter_items[] = (object)[
					'q'		=> [$q],
					'path'	=> json_decode('
						[
							{
								"name": "Model",
								"model": "component_portal",
								"section_tipo": "dd0",
								"component_tipo": "ontology6"
							},
							{
								"name": "Term",
								"model": "component_input_text",
								"section_tipo": "dd0",
								"component_tipo": "ontology5"
							}
						]
					'),
					'q_split'	=> false,
					'type'		=> 'jsonb'
				];
			}

			$filter = (object)[
				'$and' => $filter_items
			];

			// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $ar_section_tipo );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );
				$sqo->set_filter($filter);

			// search exec
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

			$ar_records = $db_result->fetch_all();

			// sort by section_tipo ASC for convenience
			usort($ar_records, function($a, $b) {
				return strcmp($a->section_tipo, $b->section_tipo);
			});

			$csv_data = [];

			$langs = $export_ontology_langs;

			// csv header
			$csv_data[] = ['id', 'section_tipo', 'model', ...$langs];

			// csv rows
			foreach ($ar_records as $row) {

				// get model and term in all langs
				$item = self::get_row_item_with_langs($row->section_tipo, $row->section_id, $langs);
				$csv_data[] = array_values( (array)$item );
			}

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
			$response->errors[]	= 'exception exporting Ontology';
			debug_log(__METHOD__
				. ' Exception exporting Ontology ' . PHP_EOL
				. 'exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		$response->result	= $csv_data ?? false;
		$response->msg		= !empty($response->errors)
			? 'Warning! exporting Ontology with errors'
			: 'OK. Exported Ontology successfully ('.count($ar_records).' records)';


		return $response;
	}//end export_to_translate



	/**
	* UPDATE_ONTOLOGY
	* Is called from area_maintenance widget 'update_ontology' across dd_area_maintenance::widget_request
	* Connect with master server, download ontology files and update local DB and lang files
	* @param object $options
	* {
	*	"server": {
	*		"name": "Official Dédalo Ontology server",
	* 		..
	* 	},
	* 	"files" : [{
	*		"section_tipo": "ontology56",
	*		"tld": "numisdata",
	*		"url": "http://localhost:8080/dedalo/install/import/ontology/6.4/ontology56_numisdata.copy.gz"
	*	}],
	* 	"info": {
	* 		"date": "2024-12-20T20:54:36+01:00",
	* 		"host": "localhost:8080",
	* 		"entity": "monedaiberica",
	* 		..
	* 	}
	* }
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function update_ontology(object $options): object
	{

		// response
		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files = $options->files;
		$info = $options->info;

		// ar_msg
		$ar_msg = [];

		// db_system_config_verify. Test pgpass file existence and permissions
		$pgpass_check = system::check_pgpass_file();
		if ($pgpass_check === false) {
			// error
			$response->result = false;
			$response->msg = 'Invalid .pgpass file, check your configuration';
			$response->errors[] = 'Bad .pgpass file';

			return $response;
		}

		// download files
		$files_to_import = [];
		foreach ($files as $current_file_item) {

			$download_file_response = ontology_data_io::download_remote_ontology_file($current_file_item->url);

			$ar_msg[] = $download_file_response->msg;
			if (!empty($download_file_response->errors)) {
				$response->errors = array_merge($response->errors, $download_file_response->errors);
			}

			if ($download_file_response->result === true) {
				$files_to_import[] = $current_file_item;
			}
		}

		// import ontology sections
		// import file
		foreach ($files_to_import as $current_file_item) {

			if ($current_file_item->tld === 'matrix_dd') {
				// private lists
				$import_response = ontology_data_io::import_private_lists_from_file($current_file_item);
			} else {
				// main section
				// create the main section if not exists
				ontology::add_main_section($current_file_item);
				// create dd_ontology node for the main section
				ontology::create_dd_ontology_ontology_section_node($current_file_item);
				// matrix data of regular ontology
				$import_response = ontology_data_io::import_from_file($current_file_item);
			}
			// add messages and errors
			if (!empty($import_response->msg)) {
				$ar_msg[] = $import_response->msg;
			}
			if (!empty($import_response->errors)) {
				$response->errors = array_merge($response->errors, $import_response->errors);
			}
		}

		// update dd_ontology with the imported records
		foreach ($files_to_import as $current_file_item) {

			if (!is_object($current_file_item) || !isset($current_file_item->tld, $current_file_item->section_tipo)) {
				debug_log(
					__METHOD__
					. " Ignored file item: Missing 'tld' or 'section_tipo' properties. " . PHP_EOL
					. ' current_file_item: ' . to_string($current_file_item)
					,
					logger::ERROR
				);
				continue;
			}

			// private list, matrix_dd, doesn't process it as dd_ontology nodes
			if ($current_file_item->tld === 'matrix_dd') {
				continue;
			}

			$section_tipo = $current_file_item->section_tipo;
			$sqo = new search_query_object();
			$sqo->set_section_tipo([$section_tipo]);
			$sqo->limit = 0;

			$set_dd_ontology_response = ontology::set_records_in_dd_ontology($sqo);
			// add messages and errors
			if (!empty($set_dd_ontology_response->msg)) {
				$ar_msg[] = $set_dd_ontology_response->msg;
			}
			if (!empty($set_dd_ontology_response->errors)) {
				$response->errors = array_merge($response->errors, $set_dd_ontology_response->errors);
			}
		}

		// simple_schema_of_sections. Get current simple schema of sections before update data
		// Will used to compare with the new schema (after update)
		$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// post processing tables
		$ar_tables = ['dd_ontology', 'matrix_ontology', 'matrix_ontology_main', 'matrix_dd'];
		// optimize tables
		db_tasks::optimize_tables($ar_tables);

		// delete all session data except auth
		if (isset($_SESSION['dedalo']) && is_array($_SESSION['dedalo'])) {
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key === 'auth')
					continue;
				unset($_SESSION['dedalo'][$key]);
			}
		}

		// update javascript labels
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {

			// direct
			$write_file = backup::write_lang_file($lang);
			if ($write_file === false) {
				$response->errors[] = 'Error writing write_lang_file of lang: ' . $lang;
				continue;
			}

			// debug
			debug_log(
				__METHOD__
				. " Writing lang file " . PHP_EOL
				. ' lang: ' . to_string($lang)
				,
				logger::WARNING
			);
		}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'SAVE',
			logger::INFO,
			DEDALO_ROOT_TIPO,
			NULL,
			[
				'msg' => 'Updated Ontology',
				'version' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, 'lg-spa')
			],
			logged_user_id() // int
		);

		// save_simple_schema_file. Get new simple_schema_of_sections
		// to compare with the previous scheme and save the changes
		$save_simple_schema_file_response = hierarchy::save_simple_schema_file((object) [
			'old_simple_schema_of_sections' => $old_simple_schema_of_sections
		]);
		if ($save_simple_schema_file_response->result === false) {
			$response->result = false;
			$response->msg = 'Error saving simple_schema_file: ' . $save_simple_schema_file_response->msg;
			$response->errors = array_merge($response->errors, $save_simple_schema_file_response->errors);
			return $response;
		} else {
			$ar_msg[] = 'OK. Saved a new simple schema changes file: ' . basename($save_simple_schema_file_response->filepath);
		}

		// force reset cache of hierarchy tree
		// delete previous cache files
		dd_cache::delete_cache_files();

		// get new Ontology info
		$ontology_node = ontology_node::get_instance(DEDALO_ROOT_TIPO);
		$root_info = (object) [
			'term' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, false, false),
			'properties' => $ontology_node->get_properties()
		];

		// response
		$response->result = true;
		$msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';
		$response->msg = $msg . ' ' . implode(PHP_EOL, $ar_msg);
		$response->root_info = $root_info;


		return $response;
	}//end update_ontology



	/**
	* GET_ROW_ITEM_WITH_LANGS
	* Resolve term ('ontology5') and model ('ontology6') from given section and langs
	* Ready to use in CSV generation
	* @param string $section_tipo
	* @param int|string $section_id
	* @param array $langs
	* @return object $item
	*/
	private static function get_row_item_with_langs(string $section_tipo, int|string $section_id, array $langs) : object {

		$item = (object)[
			'id' => $section_id,
			'section_tipo' => $section_tipo
		];

		// model
		$tipo = 'ontology6';
		$model = ontology_node::get_model_by_tipo($tipo ,true);
		$component = component_common::get_instance(
			$model, // string model
			$tipo , // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);
		$item->model = $component->get_value();

		// term
		$tipo = 'ontology5';
		$model = ontology_node::get_model_by_tipo($tipo ,true);
		$component = component_common::get_instance(
			$model, // string model
			$tipo , // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_LANG, // string lang
			$section_tipo // string section_tipo
		);

		$data = $component->get_data();

		foreach ($data as $element) {
			$lang = $element->lang;
			$value = $element->value;

			$item->{$lang} = $value;
		}


		return $item;
	}//end get_row_item_with_langs



}//end update_ontology
