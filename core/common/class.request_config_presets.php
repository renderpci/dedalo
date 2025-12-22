<?php declare(strict_types=1);
/**
* CLASS REQUEST_CONFIG_PRESETS
*
*/
class request_config_presets {



	/**
	* GET_ACTIVE_REQUEST_CONFIG
	* Search all active request config records from database (matrix_list)
	* and save/get the result to a static cache '$active_request_config_cache'.
	* We don't use components here to avoid calculating permissions, etc.
	* @return array
	* 	Assoc array of request_config_object objects
	*/
	public static function get_active_request_config() : array {

		// cache
		static $active_request_config_cache;		
		if(isset($active_request_config_cache)) {
			return $active_request_config_cache;
		}

		// cache
		$cache_file_name = 'cache_active_request_config.json';
		$cache_data_string	= dd_cache::cache_from_file((object)[
			'file_name' => $cache_file_name
		]);
		if (!empty($cache_data_string)) {
			$result = json_decode($cache_data_string);
			return $result;
		}

		$active_request_config = [];

		// Search active request config records from database (matrix_list)
		$sql = '';
		$sql .= PHP_EOL . 'SELECT *';
		$sql .= PHP_EOL . 'FROM matrix_list';
		$sql .= PHP_EOL . "WHERE section_tipo = $1";
		$sql .= PHP_EOL . "AND matrix_list.relation::jsonb @> $2";
		$sql .= PHP_EOL . "ORDER BY section_id ASC";
		
		$result = matrix_db_manager::exec_search($sql, [
			DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO,
			'{"dd1566":[{"section_tipo": "dd64", "section_id": "1"}]}'
		]);

		// Prepare component info for fast access
		$ar_components_info = [
			'tipo'           => ['tipo' => 'dd1242', 'model' => null, 'column' => null],
			'section_tipo'   => ['tipo' => 'dd642',  'model' => null, 'column' => null],
			'mode'           => ['tipo' => 'dd1246', 'model' => null, 'column' => null],
			'user_id'        => ['tipo' => 'dd654',  'model' => null, 'column' => null],
			'public'         => ['tipo' => 'dd640',  'model' => null, 'column' => null],
			'request_config' => ['tipo' => 'dd625',  'model' => null, 'column' => null],
		];

		// Pre-calculate models and columns
		foreach ($ar_components_info as $key => &$info) {
			$info['model']  = ontology_node::get_model_by_tipo($info['tipo'], true);
			$info['column'] = section_record_data::get_column_name($info['model']);
		}
		unset($info); // break reference

		while ($row = pg_fetch_object($result)) {
			
			$section_tipo = $row->section_tipo;
			$section_id   = $row->section_id;

			// Get cached section record (hydrated with parsed row data)
			$section_record = section_record::get_instance($section_tipo, $section_id);
			$section_record->set_data($row);

			// Extract raw data directly
			$get_raw_value = function($key) use ($section_record, $ar_components_info) {
				$info = $ar_components_info[$key];
				$data = $section_record->get_component_data($info['tipo'], ($info['column'] ?? ''));
				return $data[0] ?? null;
			};

			// 1. Simple values (string components)
			$tipo_obj         = $get_raw_value('tipo');
			$tipo             = $tipo_obj->value ?? '';
			
			$section_tipo_obj = $get_raw_value('section_tipo');
			$current_section_tipo = $section_tipo_obj->value ?? ''; // Renamed to avoid collision

			$mode_obj         = $get_raw_value('mode');
			$mode             = $mode_obj->value ?? '';

			// 2. Relations (user_id, public)
			$user_id_obj      = $get_raw_value('user_id');
			$user_id          = $user_id_obj->section_id ?? null;

			$public_obj       = $get_raw_value('public');
			$public           = isset($public_obj->section_id) && $public_obj->section_id == '1';

			// 3. JSON content
			$config_obj       = $get_raw_value('request_config');
			$request_config   = $config_obj->value ?? [];

			// Validate essential data
			if (empty($tipo) || empty($current_section_tipo)) {
				continue;
			}

			// Normalize input
			$request_items = is_array($request_config) ? $request_config : [$request_config];

			// Normalize each request_config_object
			$safe_request_config = [];
			foreach ($request_items as $current_item) {
				try {
					if (!is_object($current_item)) {
						// Skip empty/invalid items silently or throw if strict
						if(empty($current_item)) continue;
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

				$item = new stdClass();
					$item->tipo           = $tipo;
					$item->section_tipo   = $current_section_tipo;
					$item->mode           = $mode;
					$item->user_id        = $user_id;
					$item->public         = $public;
					$item->data           = $safe_request_config;

				$active_request_config[] = $item;
			}
		}

		// active_request_config_cache
		$active_request_config_cache = $active_request_config;

		// cache
		dd_cache::cache_to_file((object)[
			'file_name' => $cache_file_name,
			'data' => $active_request_config
		]);


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
		$db_result	= $search->search();

		// total_records count
		$total_records = $db_result->row_count();

		if ($total_records === 0) {

			$result = [];

		}else{

			// using component_json
				// $section_dato			= reset($ar_records);
				// $current_section_id		= $section_dato->section_id;
				// $current_section_tipo	= $section_dato->section_tipo;

				// // create a new component_json component
				// 	$component_json_tipo	= 'dd625';
				// 	$component_json_model	= ontology_node::get_model_by_tipo($component_json_tipo, true);
				// 	$component_json			= component_common::get_instance(
				// 		$component_json_model, // string model
				// 		$component_json_tipo, // string tipo
				// 		$current_section_id, // string section_id
				// 		'list', // string mode
				// 		DEDALO_DATA_NOLAN, // string lang
				// 		$current_section_tipo // string section_tipo
				// 	);
				// 	$json_data = $component_json->get_data();

				// 	$result = !empty($json_data)
				// 		? (is_array($json_data) ? reset($json_data) : [$json_data])
				// 		: [];

			// direct from section data
				$dato = $db_result->fetch_one ?? new stdClass();
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
						// 			$item->label = ontology_node::get_term_by_tipo($item->tipo, DEDALO_DATA_LANG, true, true);
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
