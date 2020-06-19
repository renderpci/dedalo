<?php


/**
* CLASS LAYOUT_MAP
*/
class layout_map {


	static $groupers = array('section_group','section_tab','tab','section_group_relation','section_group_portal','section_group_div');



	/**
	* GET_LAYOUT_MAP
	* Calculate display items to generate portal html
	* Cases:
	*	1. Modo 'list' : Uses childrens to build layout map
	* 	2. Modo 'edit' : Uses related terms to build layout map (default)
	*/
	public static function get_layout_map($request_options) { // $section_tipo, $tipo, $modo, $user_id, $view='full'
		
		$options = new stdClass();
			$options->section_tipo			= null;
			$options->tipo					= null;
			$options->modo					= null;
			$options->user_id				= navigator::get_user_id();
			$options->view					= 'full';
			$options->request_config_type	= 'show';
			$options->lang					= null;
			$options->add_section			= false;
			$options->external				= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// cache
			// static $resolved_layout_map = [];
			// $resolved_key = $options->section_tipo .'_'. $options->tipo .'_'. $options->modo .'_'. $options->user_id .'_'. $options->request_config_type;
			// if (isset($resolved_layout_map[$resolved_key])) {
			// 	return $resolved_layout_map[$resolved_key];
			// }

		// madatory
			$ar_mandatory = ['section_tipo','tipo','modo'];
			foreach ($ar_mandatory as $current_property) {
				if (empty($options->{$current_property})) {
					debug_log(__METHOD__." Error. property $current_property is mandatory for $options->tipo ". RecordObj_dd::get_termino_by_tipo($options->tipo,null,true) ." !".to_string(), logger::ERROR);
					// dump($options, ' get_layout_map options ++ '.to_string());
					return [];
				}
			}

		// sort vars
			$section_tipo			= $options->section_tipo;
			$tipo					= $options->tipo;
			$model					= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$modo					= $options->modo;
			$user_id				= $options->user_id;
			$view					= $options->view;
			$lang					= $options->lang ?? DEDALO_DATA_LANG;
			$request_config_type	= $options->request_config_type;

		// properties
			$RecordObj_dd	= new RecordObj_dd($tipo);
			$properties		= $RecordObj_dd->get_propiedades(true);

		#dump(dd_core_api::$ar_dd_objects, '+++++++++++++++++++ dd_core_api::$ar_dd_objects ++ '."[$section_tipo-$tipo]".to_string());

		// 1. dd_core_api::$ar_dd_objects
			if (isset(dd_core_api::$ar_dd_objects)) {
				# dump(dd_core_api::$ar_dd_objects, '+++++++++++++++++++ dd_core_api::$ar_dd_objects ++ '.to_string($tipo));
				// check found dd_objects of current portal
				$self_ar_dd_objects = array_filter(dd_core_api::$ar_dd_objects, function($item) use($tipo, $section_tipo, $model){
					if($item->tipo===$tipo) return false;

					if ($model==='section') {
						if($item->section_tipo===$section_tipo) return $item;
					}else{
						// dump($item->ar_sections_tipo, '  ++ $item->ar_sections_tipo - '.to_string($section_tipo));
						// dump($item, ' $item ++ '.to_string($tipo));
						if($item->parent===$tipo) {
							return $item;
						}
						// else if(isset($item->ar_sections_tipo) && in_array($item->parent, $item->ar_sections_tipo)) {
						// 	// $item->section_tipo = $item->parent;
						// 	return $item;
						// }
					}
				});
				#if($tipo==='test175') dump($self_ar_dd_objects, ' self_ar_dd_objects ++ '.to_string($tipo));
				if (!empty($self_ar_dd_objects)) {

					// groupers with childrens already defined case
						if (in_array($model, layout_map::$groupers)) {
							return []; // stop here (!)
						}

					// layout_map
						$layout_map = array_values($self_ar_dd_objects);
						#$a = debug_backtrace(); error_log( print_r($a,true) );
						debug_log(__METHOD__." layout map selected from 'dd_core_api::ar_dd_objects' [$section_tipo-$tipo]".to_string(), logger::DEBUG);
						#dump($layout_map, ' layout_map 1 ++ '.to_string($tipo));
						if(SHOW_DEBUG===true) {
							foreach ($layout_map as $current_item) {
								$current_item->debug_from = 'calculated from dd_core_api::$ar_dd_objects ['.$tipo.'] (1)';
							}
						}
				}
			}

		// 2. search in user presets
			if (!isset($layout_map)) {
				$user_preset = layout_map::search_user_preset($tipo, $section_tipo, $user_id, $modo, $view);
				if (!empty($user_preset)) {
					// layout_map
						// $layout_map = $user_preset;
						$layout_map = [];
						foreach ($user_preset as $preset_item) {
							if ($preset_item->typo==='ddo') {
								$layout_map[] = $preset_item;
							}
						}
						debug_log(__METHOD__." layout map calculated from user preset [$section_tipo-$tipo]".to_string(), logger::DEBUG);
						//dump($layout_map, ' layout_map 2 ++ '.to_string($tipo));
						if(SHOW_DEBUG===true) {
							foreach ($layout_map as $current_item) {
								$current_item->debug_from = 'calculated from user_preset ['.$tipo.'] (2)';
							}
						}
				}
			}

		// 3. calculate from section list or related terms
			if (!isset($layout_map)) {

				// v5 definition and v6 definition in properties
				$request_config = common::get_request_properties_parsed($tipo, $options->external, $options->section_tipo, $modo, null);
				
				// layout_map
				$layout_map = [];
				foreach ($request_config as $item_request_config) {

					foreach ($item_request_config->section_tipo as $current_section_tipo) {
						if ($options->add_section===true) {
							$layout_map[] = layout_map::get_section_ddo($current_section_tipo, $modo, $lang);
						}
						
						// ddo_map
							$current_ddo_map = $item_request_config->{$request_config_type}->ddo_map ?? false;
							if ($current_ddo_map!==false) {
								foreach ((array)$current_ddo_map as $item) {
									// $db = debug_backtrace();	dump($db, ' $db ++ '.to_string());
									$ar_ddo = is_string($item)
										? [layout_map::get_component_ddo($request_config_type, $current_section_tipo, $item, $modo, $lang)]
										: layout_map::get_f_path_ddo($item, $request_config_type, $current_section_tipo, $modo, $lang);

									$layout_map = array_merge($layout_map, $ar_ddo);
								}
							}else{
								debug_log(__METHOD__." Ignored not existing ddo_map for config_type: '$request_config_type' ".to_string(), logger::WARNING);
								if ($request_config_type!=='select') {
									dump($item_request_config, ' ERROR !!!!!!!!!!!!!!!!!! item_request_config ++ '.to_string($request_config_type));
								}
							}
					}// end iterate sections
				}//end foreach ($request_config as $item_request_config)

				// dump($layout_map, ' $layout_map ++ '.to_string()); die();

				if(SHOW_DEBUG===true) {
					// dump($layout_map, ' layout_map ++ '.to_string());
					foreach ($layout_map as $current_item) {
						if (!isset($current_item->tipo)) {
							dump($current_item, ' current_item ++ '.to_string());
							continue;
						}							
						$current_item->debug_label = RecordObj_dd::get_termino_by_tipo($current_item->tipo, $lang, true, true);
						$current_item->debug_from = 'calculated from section list or related terms ['.$tipo.'] (3)';
					}
				}
			}//end if (!isset($layout_map))


		// Remove_exclude_terms : config excludes. If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove elements from layout_map
			if (defined('DEDALO_AR_EXCLUDE_COMPONENTS') && !empty($layout_map)) {
				$DEDALO_AR_EXCLUDE_COMPONENTS = unserialize(DEDALO_AR_EXCLUDE_COMPONENTS);
				foreach ($layout_map as $key => $item) {
					$current_tipo = $item->tipo;
					if (in_array($current_tipo, $DEDALO_AR_EXCLUDE_COMPONENTS)) {
						unset( $layout_map[$key]);
						debug_log(__METHOD__." DEDALO_AR_EXCLUDE_COMPONENTS: Removed portal layout_map term $current_tipo ".to_string(), logger::DEBUG);
					}
				}
				$layout_map = array_values($layout_map);
			}
			// dump($layout_map, ' layout_map ++++++++++++ $resolved_key: '.to_string($resolved_key));

		// cache
			// $resolved_layout_map[$resolved_key] = $layout_map;

		return (array)$layout_map;
	}//end get_layout_map




	/**
	* get_section_ddo
	* @return
	*/
	public static function get_section_ddo($section_tipo, $mode, $lang) {

		// section add
		$dd_object = new dd_object((object)[
			'tipo'			=> $section_tipo,
			'section_tipo'	=> $section_tipo,
			'model'			=> 'section',
			'mode'			=> $mode,
			'lang'			=> DEDALO_DATA_NOLAN,
			'label'			=> RecordObj_dd::get_termino_by_tipo($section_tipo, $lang, true, true),
			'parent'		=> 'root'
		]);

		return $dd_object;
	}//end get_section_ddo



	/**
	* GET_COMPONENT_DDO
	* @return object $dd_object
	*/
	public static function get_component_ddo($request_config_type, $current_section_tipo, $current_tipo, $mode, $lang) {

		// parent
			$current_parent = ($request_config_type==='select')
				? $current_section_tipo
				: (function($current_tipo){
					$RecordObj_dd 	= new RecordObj_dd($current_tipo);
					return $RecordObj_dd->get_parent();
				})($current_tipo);

		// model
			$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);


		// common temporal excluded/mapped models *******-
			$match_key = array_search($current_model, common::$ar_temp_map_models);
			if (false!==$match_key) {
				debug_log(__METHOD__." +++ Mapped model $current_model to $match_key from layout map ".to_string(), logger::WARNING);
				$current_model = $match_key;
			}else if (in_array($current_model, common::$ar_temp_exclude_models)) {
				debug_log(__METHOD__." +++ Excluded model $current_model from layout map ".to_string(), logger::WARNING);
				return false;
			}

		// component add
			$dd_object = new dd_object((object)[
				'tipo'			=> $current_tipo,
				'section_tipo'	=> $current_section_tipo,
				'model'			=> $current_model,
				'mode'			=> $mode,
				'lang'			=> $lang,
				'label'			=> RecordObj_dd::get_termino_by_tipo($current_tipo, $lang, true, true),
				'parent'		=> $current_parent
			]);

			return $dd_object;
	}//end get_component_ddo


	/**
	* GET_FPATH_DDO
	* @return
	*/
	public static function get_f_path_ddo($f_path_object, $request_config_type, $current_section_tipo, $mode, $lang) {

		$f_path = $f_path_object->f_path;

		$ar_dd_object = [];
		foreach ($f_path as $key => $value) {
			if($key % 2 === 0){
				if($value === 'self') continue;
				$ar_dd_object[] = layout_map::get_section_ddo($value, $mode, $lang);
			}else{
				$section_tipo = ($f_path[$key-1] === 'self')
					? $section_tipo = $current_section_tipo
					: $f_path[$key-1];
				$component_ddo = layout_map::get_component_ddo($request_config_type, $section_tipo, $value, $mode, $lang);
				if (!empty($component_ddo)) {
					$ar_dd_object[] = $component_ddo;
				}
			}
		}

		return $ar_dd_object;
	}//end get_fpath_ddo


	/**
	* SEARCH_USER_PRESET
	* @return array | bool
	*/
	public static function search_user_preset($tipo, $section_tipo, $user_id, $modo, $view=null) {

		// preset const
			$user_locator = new locator();
				$user_locator->set_section_tipo('dd128');
				$user_locator->set_section_id($user_id);
				$user_locator->set_from_component_tipo('dd654');

		// preset section vars
			$preset_section_tipo = 'dd1244';
			$component_json_tipo = 'dd625';

		// filter
			$filter = 	[
							(object)[
								'q' 	=> '\''.$tipo.'\'',
								'path' 	=> [(object)[
									'section_tipo'	 => $preset_section_tipo,
									'component_tipo' => 'dd1242',
									'modelo'		 => 'component_input_text',
									'name'			 => 'Tipo'
								]]
							],
							(object)[
								'q' 	=> '\''.$section_tipo.'\'',
								'path' 	=> [(object)[
									'section_tipo' 	 => $preset_section_tipo,
									'component_tipo' => 'dd642',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Section tipo'
								]]
							],
							(object)[
								'q' 	=> $user_locator,
								'path' 	=> [(object)[
									'section_tipo' 	 => $preset_section_tipo,
									'component_tipo' => 'dd654',
									'modelo' 		 => 'component_select',
									'name' 			 => 'User'
								]]
							],
							(object)[
								'q' 	=> '\''.$modo.'\'',
								'path' 	=> [(object)[
									'section_tipo' 	 => $preset_section_tipo,
									'component_tipo' => 'dd1246',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Modo'
								]]
							]
						];
			// add filter view if exists
			if (!empty($view)) {
				$filter[] = (object)[
								'q' 	=> '\''.$view.'\'',
								'path' 	=> [
									(object)[
										'section_tipo' 	 => $preset_section_tipo,
										'component_tipo' => 'dd1247',
										'modelo' 		 => 'component_input_text',
										'name' 			 => 'view'
									]
								]
							];
			}

		// search query object
			$search_query_object = [
				'id'			=> 'search_user_preset_layout_map',
				'modo'			=> 'list',
				'section_tipo'	=> 'dd1244',
				'limit'			=> 1,
				'full_count'	=> false,
				'filter' 		=> (object)[
					'$and' => $filter
				]//,
				// 'select' 		=> [
				// 	(object)[
				// 		'path' 	=> [
				// 			(object)[
				// 				'section_tipo' 	=> $preset_section_tipo,
				// 				'component_tipo'=> $component_json_tipo,
				// 				'modelo' 		=> 'component_json',
				// 				'name'			=> 'JSON Data'
				// 			]
				// 		],
				// 		'component_path' => [
				// 	        'components',
				// 	        $component_json_tipo,
				// 	        'dato',
				// 	        'lg-nolan'
				// 	    ]
				// 	]
				// ]

			];
			#dump($search_query_object, ' search_query_object ++ '.to_string());
			#error_log('Preset layout_map search: '.PHP_EOL.json_encode($search_query_object));

		$search 	= search::get_instance($search_query_object);
		$rows_data 	= $search->search();
			#dump($rows_data, ' rows_data ++ '.to_string());

		$ar_records = $rows_data->ar_records;
		if (empty($ar_records)) {
			$result 		= false;
		}else{
			$dato = reset($ar_records);
			if (isset($dato->datos->components->{$component_json_tipo}->dato->{DEDALO_DATA_NOLAN})) {
				$json_data		= reset($dato->datos->components->{$component_json_tipo}->dato->{DEDALO_DATA_NOLAN});
				$preset_value	= is_array($json_data) ? $json_data : [$json_data];
				$result			= $preset_value;
			}else{
				$result 		= false;
			}
		}

		return $result;
	}//end search_user_preset



}//end class layout_map
