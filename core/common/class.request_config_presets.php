<?php declare(strict_types=1);
/**
* CLASS REQUEST_CONFIG_PRESETS
*
*/
class request_config_presets {



	/**
	* GET_ACTIVE_REQUEST_CONFIG
	* Search all active request config records from database (matrix_list)
	* and save/get the result to a static cache '$active_request_config_cache'
	* @return array
	* 	Assoc array of request_config_object objects
	*/
	public static function get_active_request_config() : array {

		// cache
		static $active_request_config_cache;
		if(isset($active_request_config_cache)) {
			return $active_request_config_cache;
		}

		$active_request_config = [];

		// OLD way
			// // filter for active only
			// $filter = json_decode('
			// 	{
			// 		"$and": [
			// 			{
			// 				"q": {
			// 					"section_tipo": "dd64",
			// 					"section_id": "1",
			// 					"from_component_tipo": "dd1566"
			// 				}
			// 				,
			// 				"q_operator": null,
			// 				"path": [
			// 					{
			// 						"section_tipo": "dd1244",
			// 						"component_tipo": "dd1566",
			// 						"model": "component_radio_button",
			// 						"name": "Active"
			// 					}
			// 				],
			// 				"q_split": false,
			// 				"type": "jsonb"
			// 			}
			// 		]
			// 	}
			// ');

			// // Search all records of request config section dd1244
			// $search_query_object = (object)[
			// 	'id'			=> 'search_active_request_config',
			// 	'mode'			=> 'list',
			// 	'section_tipo'	=> DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO, //'dd1244'
			// 	'filter'		=> $filter,
			// 	'limit'			=> 0,
			// 	'full_count'	=> false
			// ];

			// $search		= search::get_instance($search_query_object);
			// $rows_data	= $search->search();
			// $ar_records = $rows_data->ar_records ?? [];
			// $ar_section_id = array_map(function($el){
			// 	return $el->section_id;
			// }, $ar_records);

		// matrix_data way
			$table = common::get_matrix_table_from_tipo(DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO);
			$component_tipo = 'dd1566';
			$ar_section_id = matrix_data::search_matrix_data(
				$table,
				[
					[
						'column'	=> 'section_tipo',
						'operator'	=> '=',
						'value'		=> DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO
					],
					[
						'column'	=> 'datos',
						'operator'	=> '@>',
						'value'		=> '{"relations":[{"from_component_tipo":"'.$component_tipo.'","section_tipo":"dd64","section_id":"1"}]}' // v6
					],
					// [
					// 	'column'	=> 'relation',
					// 	'operator'	=> '@>',
					// 	'value'		=> '{"'.$component_tipo.'": [{"section_tipo":"dd64","section_id":"1"}]}' // v7
					// ]
				],
				null, // order
				null // limit
			);
				dump($ar_section_id, ' ar_section_id ******************************************************************************++ '.to_string());

		// Helper function to extract a component value
		$get_component_value = function($tipo, $section_id) {
			$model = RecordObj_dd::get_model_name_by_tipo($tipo, true);
			$component = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO
			);
			return $component->get_value() ?? '';
		};

		// Helper function to extract a component data
		$get_component_data = function($tipo, $section_id) {
			$model = RecordObj_dd::get_model_name_by_tipo($tipo, true);
			$component = component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO
			);
			return $component->get_dato() ?? [];
		};

		foreach ($ar_section_id as $section_id) {

			// Generate values
			$tipo			= $get_component_value('dd1242', $section_id); // tipo
			$section_tipo	= $get_component_value('dd642', $section_id);  // section_tipo
			$mode			= $get_component_value('dd1246', $section_id);  // mode

			// Get user_id (dd654)
				$user_id_data	= $get_component_data('dd654', $section_id);
				$user_id		= $user_id_data[0]->section_id ?? null;

			// Get public value (dd640)
				$public_data	= $get_component_data('dd640', $section_id);
				$public			= isset($public_data[0]->section_id) && $public_data[0]->section_id=='1';

			// Get JSON config (dd625)
				$json_data		= $get_component_data('dd625', $section_id);
				$request_config	= $json_data[0] ?? [];

				// Normalize input
				$request_items = is_array($request_config) ? $request_config : [$request_config];

				// Normalize each request_config_object
				$safe_request_config = [];
				foreach ($request_items as $current_item) {
					try {
						if (!is_object($current_item)) {
							throw new Exception("Invalid non object request_config_object item", 1);
						}
						$request_config_object = new request_config_object($current_item);
						if (!empty($request_config_object)) {
							$safe_request_config[] = $request_config_object;
						}
					} catch (Exception $e) {
						debug_log(__METHOD__
							. " Ignored invalid request_config_object item " . PHP_EOL
							. ' current_item: ' . to_string($current_item) . PHP_EOL
							. ' section_tipo: ' . $section_tipo  . PHP_EOL
							. ' section_id: ' . $section_id
							, logger::ERROR
						);
					}
				}

			// Only store if we have valid configs
			if (!empty($safe_request_config)) {
				$active_request_config[] = (object)[
					'tipo'			=> $tipo,
					'section_tipo'	=> $section_tipo,
					'mode'			=> $mode,
					'user_id'		=> $user_id,
					'public'		=> $public,
					'data'			=> $safe_request_config
				];
			}
		}

		// $active_request_config_cache
		$active_request_config_cache = $active_request_config;


		return $active_request_config;
	}//end get_active_request_config



	/**
	* GET_REQUEST_CONFIG
	* Get user request config preset from DDBB section 'dd1244'
	* or file cache if already calculated
	* Layout map (request config) presets
	* @param string $tipo
	* @param string $section_tipo
	* @param string $mode
	* @return array $result
	*/
	public static function get_request_config( string $tipo, string $section_tipo, string $mode ) : array {

		if(SHOW_DEBUG===true) {
			$start_time=start_time();
			metrics::add_metric('presets_total_calls');
		}

		// Get cached list of active_request_config
		$active_request_config = self::get_active_request_config();

		// search way (slower)
		$found = array_find($active_request_config, function($el) use($tipo, $section_tipo, $mode) {
			return ($el->tipo === $tipo &&
					$el->section_tipo === $section_tipo &&
					$el->mode === $mode &&
					$el->user_id == logged_user_id()); // filter by owner user
		});
		// fallback to public presets
		if (empty($found)) {
			$found = array_find($active_request_config, function($el) use($tipo, $section_tipo, $mode) {
				return ($el->tipo === $tipo &&
						$el->section_tipo === $section_tipo &&
						$el->mode === $mode &&
						$el->public === true); // filter by public status
			});
		}

		if(SHOW_DEBUG===true) {
			metrics::add_metric('presets_total_time', $start_time);
		}

		// No presets found
		if (empty($found)) {
			return [];
		}

		// data (request config array)
		$data = $found->data ?? [];


		return $data;
	}//end get_request_config



	/**
	* SEARCH_REQUEST_CONFIG
	* Get user request config preset from DDBB section 'dd1244'
	* Layout map (request config) presets
	* @param string $tipo
	* @param string $section_tipo
	* @param int $user_id
	* @param string $mode
	* @param string|null $view = null
	* @return array $result
	*/
	public static function search_request_config( string $tipo, string $section_tipo, int $user_id, string $mode, ?string $view=null ) : array {

		// preset const
			// $user_locator = new locator();
			// 	$user_locator->set_section_tipo('dd128');
			// 	$user_locator->set_section_id($user_id);
			// 	$user_locator->set_from_component_tipo('dd654');

		// preset section vars
			$preset_section_tipo = DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO; // 'dd1244';
			$component_json_tipo = 'dd625';

		// filter
			$filter = [
				// check tipo is equal as request tipo
				(object)[
					'q'		=> '\''.$tipo.'\'',
					'path'	=> [(object)[
						'section_tipo'		=> $preset_section_tipo,
						'component_tipo'	=> 'dd1242',
						'model'				=> 'component_input_text',
						'name'				=> 'Tipo'
					]]
				],
				// check section_tipo is equal as request section_tipo
				(object)[
					'q'		=> '\''.$section_tipo.'\'',
					'path'	=> [(object)[
						'section_tipo'		=> $preset_section_tipo,
						'component_tipo'	=> 'dd642',
						'model'				=> 'component_input_text',
						'name'				=> 'Section tipo'
					]]
				],
				// check user is equal as request user
					// (object)[
					// 	'q'		=> $user_locator,
					// 	'path'	=> [(object)[
					// 		'section_tipo'		=> $preset_section_tipo,
					// 		'component_tipo'	=> 'dd654',
					// 		'model'				=> 'component_select',
					// 		'name'				=> 'User'
					// 	]]
					// ],
				// check mode is equal as request mode
				(object)[
					'q'		=> '\''.$mode.'\'',
					'path'	=> [(object)[
						'section_tipo'		=> $preset_section_tipo,
						'component_tipo'	=> 'dd1246',
						'model'				=> 'component_input_text',
						'name'				=> 'Mode'
					]]
				]
			];

			// add filter view if exists
			if (!empty($view)) {
				$filter[] = (object)[
					'q'		=> '\''.$view.'\'',
					'path'	=> [
						(object)[
							'section_tipo'		=> $preset_section_tipo,
							'component_tipo'	=> 'dd1247',
							'model'				=> 'component_input_text',
							'name'				=> 'view'
						]
					]
				];
			}

		// search query object
			$search_query_object = (object)[
				'id'			=> 'search_request_config',
				'mode'			=> 'list',
				'section_tipo'	=> DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO, //'dd1244'
				'limit'			=> 1,
				'full_count'	=> false,
				'filter'		=> (object)[
					'$and' => $filter
				]
			];

		$search		= search::get_instance($search_query_object);
		$rows_data	= $search->search();

		$ar_records = $rows_data->ar_records;
		if (empty($ar_records)) {

			$result = [];

		}else{

			// using component_json
				// $section_dato			= reset($ar_records);
				// $current_section_id		= $section_dato->section_id;
				// $current_section_tipo	= $section_dato->section_tipo;

				// // create a new component_json component
				// 	$component_json_tipo	= 'dd625';
				// 	$component_json_model	= RecordObj_dd::get_model_name_by_tipo($component_json_tipo, true);
				// 	$component_json			= component_common::get_instance(
				// 		$component_json_model, // string model
				// 		$component_json_tipo, // string tipo
				// 		$current_section_id, // string section_id
				// 		'list', // string mode
				// 		DEDALO_DATA_NOLAN, // string lang
				// 		$current_section_tipo // string section_tipo
				// 	);
				// 	$json_data = $component_json->get_dato();

				// 	$result = !empty($json_data)
				// 		? (is_array($json_data) ? reset($json_data) : [$json_data])
				// 		: [];

			// direct from section data
				$dato = $ar_records[0] ?? new stdClass();
				if (isset($dato->datos->components->{$component_json_tipo}->dato->{DEDALO_DATA_NOLAN})) {

					$json_data		= reset($dato->datos->components->{$component_json_tipo}->dato->{DEDALO_DATA_NOLAN});
					$preset_value	= is_array($json_data) ? $json_data : [$json_data];

					// check proper config of items
						// $valid_items = [];
						// foreach ($preset_value as $key => $item) {
						//
						// 	// typo
						// 		if (!isset($item->typo) || $item->typo!=='ddo') {
						// 			debug_log(__METHOD__." Ignored invalid user preset typo ! ".to_string($item), logger::DEBUG);
						// 			continue;
						// 		}
						//
						// 	// tipo
						// 		if (!isset($item->tipo)) {
						// 			debug_log(__METHOD__." Invalid user preset item ! ".to_string($item), logger::ERROR);
						// 			continue;
						// 		}
						//
						// 	// label
						// 		if (!property_exists($item, 'label')) {
						// 			$item->label = RecordObj_dd::get_termino_by_tipo($item->tipo, DEDALO_DATA_LANG, true, true);
						// 		}
						//
						// 	$valid_items[] = $item;
						// }
						//
						// $result = $valid_items;

					// normalize each request_config_object
						$safe_request_config = [];
						foreach ($preset_value as $current_item) {
							$request_config_object	= new request_config_object($current_item);
							// do double cast [(object)(array)] here to avoid cache incomplete class issues on session save
							$safe_request_config[]	= (object)(array)$request_config_object;
						}

					$result = $safe_request_config;
					// $result = $preset_value;

				}else{

					$result = [];
				}
		}


		return $result;
	}//end search_request_config



	/**
	* CLEAN_CACHE
	* @return bool
	*/
	public static function clean_cache() : bool {

		// $active_request_config_cache
		// There's nothing to clear. The cache is static and is updated on every thread.

		return true;
	}//end clean_cache



}//end class request_config_presets
