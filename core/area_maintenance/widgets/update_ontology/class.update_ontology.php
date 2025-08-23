<?php declare(strict_types=1);
/**
* update_ontology
* Widget to manage Dédalo Ontology updates
*/
class update_ontology {



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
			}else if (defined('STRUCTURE_SERVER_URL')) {
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
				$server->code			= $server->code;
				if($server->code === 'localhost' && $server->result!==false){
					$server->result->result = true;
				}
				$ontology_servers[]		= $server;
			}

		// tld list
			$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
			// force to add 'ontology' to the list
			$DEDALO_PREFIX_TIPOS = array_values(array_unique(
				array_merge($DEDALO_PREFIX_TIPOS, ['ontology'])
			));

		// current_ontology: dd1 properties
			$ontology_node		= new ontology_node('dd1');
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
			$result	= $search->search();

			$ar_records = $result->ar_records ?? [];

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

		foreach ($langs as $lang) {

			$component->set_lang($lang);

			$dato = $component->get_dato();

			$value = is_array($dato)
				? implode(', ', $dato)
				: (empty($dato) ? '' : $dato);

			$item->{$lang} = $value;
		}


		return $item;
	}//end get_row_item_with_langs




}//end update_ontology
