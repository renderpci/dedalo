<?php
/**
* CLASS REQUEST_CONFIG_PRESETS
*
*/
class request_config_presets {



	// static $cache_user_preset_layout_map = [];



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

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				$key_cache = implode('_', [$tipo, $section_tipo, $user_id, $mode, $view]);
				// if (isset(self::$cache_user_preset_layout_map[$key_cache])) {
				// 	return self::$cache_user_preset_layout_map[$key_cache];
				// }
				if (isset($_SESSION['dedalo']['config']['user_preset_layout_map'][$key_cache])) {
					return $_SESSION['dedalo']['config']['user_preset_layout_map'][$key_cache];
				}
			}

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
			#dump($search_query_object, ' search_query_object ++ '.to_string());
			#error_log('Preset layout_map search: '.PHP_EOL.json_encode($search_query_object));

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
				$dato = reset($ar_records);
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

		// cache
			if ($use_cache===true) {
				// self::$cache_user_preset_layout_map[$key_cache] = $result;
				$_SESSION['dedalo']['config']['user_preset_layout_map'][$key_cache] = $result;
			}


		return $result;
	}//end search_request_config



	/**
	* CLEAN_CACHE
	* @return bool
	*/
	public static function clean_cache() {

		if (isset($_SESSION['dedalo']['config']['user_preset_layout_map'])) {
			unset($_SESSION['dedalo']['config']['user_preset_layout_map']);
			return true;
		}

		return false;
	}//end clean_cache



}//end class request_config_presets
