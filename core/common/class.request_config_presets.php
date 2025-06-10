<?php declare(strict_types=1);
/**
* CLASS REQUEST_CONFIG_PRESETS
*
*/
class request_config_presets {



	// static $cache_user_preset_layout_map = [];
	// cache file name
	static $cache_file_name = 'all_request_config.json'; // file base name. Final e.g. 'development_1_all_request_config.json'



	/**
	* GET_ALL_REQUEST_CONFIG
	* Search all request config records from database (matrix_list)
	* and save/get the result to a cache file when $use_cache is true
	* @return array
	* 	Assoc array of request_config_object objects
	*/
	public static function get_all_request_config() : array {

		// cache
		static $all_request_config_cache;
		if(isset($all_request_config_cache)) {
			return $all_request_config_cache;
		}

		$all_request_config = [];

		// Search all records of request config section dd1244
		$search_query_object = (object)[
			'id'			=> 'search_all_request_config',
			'mode'			=> 'list',
			'section_tipo'	=> DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO, //'dd1244'
			'limit'			=> 0,
			'full_count'	=> false
		];

		$search		= search::get_instance($search_query_object);
		$rows_data	= $search->search();
		$ar_records = $rows_data->ar_records ?? [];

		// Helper function to extract a component value
		$get_component_value = function($tipo, $section_id) {
			$model = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
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

		foreach ($ar_records as $record) {

			$section_id = $record->section_id;

			// Generate cache key parts
			$tipo			= $get_component_value('dd1242', $section_id); // tipo
			$section_tipo	= $get_component_value('dd642', $section_id);  // section_tipo
			$mode			= $get_component_value('dd1246', $section_id);  // mode

			$key_cache = implode('_', [$tipo, $section_tipo, $mode]);

			// Get JSON config (dd625)
				$tipo		= 'dd625';
				$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model, // string model
					$tipo, // string tipo
					$record->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO // string section_tipo
				);
				$json_data		= $component->get_dato() ?? [];
				$request_config	= $json_data[0] ?? [];

				// Normalize input
				$request_items = is_array($request_config) ? $request_config : [$request_config];

			// normalize each request_config_object
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
				$all_request_config[$key_cache] = [
					'tipo'			=> $tipo,
					'section_tipo'	=> $section_tipo,
					'mode'			=> $mode,
					'data'			=> $safe_request_config
				];
			}
		}

		// $all_request_config_cache
		$all_request_config_cache = $all_request_config;


		return $all_request_config;
	}//end get_all_request_config



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

		// Get cached list of all_request_config
		$all_request_config = self::get_all_request_config();

		// key_cache
		$key_cache = implode('_', [$tipo, $section_tipo, $mode]);

		// base_data
		$base_data = $all_request_config[$key_cache] ?? null;

		// data (request config array)
		if ($base_data) {
			$data = $base_data['data'] ?? null;
			if ($data){
				return $data;
			}
		}

		// Fallback if not found or invalid format
		return [];
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
				// 	$component_json_model	= RecordObj_dd::get_modelo_name_by_tipo($component_json_tipo, true);
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

		// $all_request_config_cache
		// There's nothing to clear. The cache is static and is updated on every thread.

		return true;
	}//end clean_cache



}//end class request_config_presets
