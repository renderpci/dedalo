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
			$options->section_tipo 	= null;
			$options->tipo 			= null;
			$options->modo 			= null;
			$options->user_id 		= navigator::get_user_id();
			$options->view 			= 'full';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// madatory
			$ar_mandatory = ['section_tipo','tipo','modo'];
			foreach ($ar_mandatory as $current_property) {
				if (empty($options->{$current_property})) {
					debug_log(__METHOD__." Error. property $current_property is mandatory !".to_string(), logger::ERROR);
					return false;
				}
			}

		// sort vars
			$section_tipo 	= $options->section_tipo;
			$tipo 			= $options->tipo;
			$modo 			= $options->modo;
			$user_id 		= $options->user_id;
			$view 			= $options->view;

		
		#dump(dd_api::$ar_dd_objects, '+++++++++++++++++++ dd_api::$ar_dd_objects ++ '."[$section_tipo-$tipo]".to_string());

		// 1. dd_api::$ar_dd_objects
			if (isset(dd_api::$ar_dd_objects)) {
				// dump(dd_api::$ar_dd_objects, '+++++++++++++++++++ dd_api::$ar_dd_objects ++ '.to_string());
				// check found dd_objects of current portal
				$self_ar_dd_objects = array_filter(dd_api::$ar_dd_objects, function($item) use($tipo, $section_tipo){
					if($item->tipo===$tipo) return false;

					$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					if ($model==='section') {
						if($item->section_tipo===$section_tipo) return $item;
					}else{
						if($item->parent===$tipo) return $item;
					}					
				});
				if (!empty($self_ar_dd_objects)) {
					// layout_map
						$layout_map = array_values($self_ar_dd_objects);
						#$a = debug_backtrace(); error_log( print_r($a,true) );
						debug_log(__METHOD__." layout map selected from 'dd_api::ar_dd_objects' [$section_tipo-$tipo]".to_string(), logger::DEBUG);
						#dump($layout_map, ' layout_map 1 ++ '.to_string($tipo));
				}				 
			}		
		
		// 2. search in user presets
			if (!isset($layout_map)) {
				$user_preset = layout_map::search_user_preset($tipo, $section_tipo, $user_id, $modo, $view);			
				if (!empty($user_preset)) {
					// layout_map
						$layout_map = $user_preset;
						debug_log(__METHOD__." layout map calculated from user preset [$section_tipo-$tipo]".to_string(), logger::DEBUG);
						#dump($layout_map, ' layout_map 2 ++ '.to_string($tipo));					
				}
			}
	
		// 3. calculate from section list or related terms
			if (!isset($layout_map)) {
				$ar_related=array();
				switch ($modo) {
					case 'list':
					case 'portal_list':
						# case section list is defined				
						$ar_terms = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section_list', 'children', true);				
						if(isset($ar_terms[0]) ) {
							
							# Use found related terms as new list
							$current_term = $ar_terms[0];
							$ar_related   = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
							
						}else{

							# Fallback related when section list is not defined					
							$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);						
						}
						break;
					
					case 'edit':
					default:

						$model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						if ($model==='section') {
							// section
							$ar_modelo_name_required = ['component_','section_group','section_tab','tab','section_group_relation','section_group_portal','section_group_div'];
							$ar_related = section::get_ar_children_tipo_by_modelo_name_in_section($tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false);

						}elseif (in_array($model, self::$groupers)) {
							// groupers
							$ar_related = (array)RecordObj_dd::get_ar_childrens($tipo);
						
						}else{
							// portal
							$edit_view_options ='';
							if($view==='full') { // || $view==='view_mosaic'
								$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);
								break;
							}else{
								# CASE VIEW IS DEFINED
								$ar_terms = (array)RecordObj_dd::get_ar_childrens($tipo);
								foreach ($ar_terms as $current_term) {
									# Locate 'edit_views' in childrens
									$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_term,true);				
									if ($modelo_name!=='edit_view') continue;

									$view_name = RecordObj_dd::get_termino_by_tipo($current_term);	
									if($view===$view_name){
										# Use related terms as new list
										$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);										
										break;
									}						
								}
							}
						}
						break;
				}//end switch $modo	

				// target_section_tipo, exclude_elements
					$target_section_tipo = $section_tipo;
					foreach ((array)$ar_related as $key => $current_tipo) {
						
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						
						if ($modelo_name==='section') {
							$target_section_tipo = $current_tipo; // Set portal_section_tipo find it
							unset($ar_related[$key]); // Remove self section_tipo from array of components
							//break;
						}
						elseif ($modelo_name==='exclude_elements') {
							unset($ar_related[$key]); // Remove self section_tipo from array of components
						}
					}		
			
				// layout map
					$layout_map = [];
					foreach ($ar_related as $current_element_tipo) {
						// parent info
							$RecordObj_dd 	= new RecordObj_dd($current_element_tipo);
							$parent 		= $RecordObj_dd->get_parent();

						$dd_object = new dd_object((object)[
							'tipo' 			=> $current_element_tipo,
							'section_tipo' 	=> $target_section_tipo, // (?)
							'model' 		=> RecordObj_dd::get_modelo_name_by_tipo($current_element_tipo,true),
							'mode' 			=> $modo,
							'parent' 		=> $parent
						]);
						
						$layout_map[] = $dd_object;
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

		return $layout_map;
	}//end get_layout_map



	/**
	* GET_LAYOUT_MAP_OLD
	* Calculate display items to generate portal html
	* Cases:
	*	1. Modo 'list' : Uses childrens to build layout map
	* 	2. Modo 'edit' : Uses related terms to build layout map (default)	
	*//*
	public static function get_layout_map_OLD($section_tipo, $tipo, $modo, $user_id) {
		
		// preset. look db presets for existing user layout_map preset
			#$preset_data = self::search_preset($section_tipo, $tipo, $user_id);


		$ar_related=array();
		switch ($modo) {
			case 'list':
			case 'portal_list':
				# CASE SECTION LIST IS DEFINED				
				$ar_terms 		  = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($tipo, 'section_list', 'children', true);
				
				if(isset($ar_terms[0]) ) {
					
					# Use found related terms as new list
					$current_term = $ar_terms[0];
					$ar_related   = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
					
				}else{

					# FALLBACK RELATED WHEN SECTION LIST IS NOT DEFINED
					# If not defined sectiopn list
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);						
				}
				break;
			
			case 'edit':
			default:
				$edit_view_options ='';
				if($view==='full') { // || $view==='view_mosaic'
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true);
					break;
				}else{
					# CASE VIEW IS DEFINED
					$ar_terms = (array)RecordObj_dd::get_ar_childrens($tipo); 	#dump($ar_terms, " childrens $this->tipo".to_string());				
					foreach ($ar_terms as $current_term) {
						# Locate 'edit_views' in childrens
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_term,true);						
						if ($modelo_name!=='edit_view') continue;

						$view_name = RecordObj_dd::get_termino_by_tipo($current_term);	
						if($view===$view_name){
							# Use related terms as new list
							$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
							# Fix / set current edit_view propiedades to portal propiedades
							$RecordObj_dd 			= new RecordObj_dd($current_term);
							$edit_view_propiedades 	= json_decode($RecordObj_dd->get_propiedades());
							# dump($edit_view_propiedades, ' edit_view_propiedades->edit_view_options ++ '.to_string());		
							if ( isset($edit_view_propiedades->edit_view_options) ) {
								$edit_view_options = $edit_view_propiedades->edit_view_options;									
							}
							break;
						}						
					}
				}
				break;
		}//end switch ($this->modo)	

		# PORTAL_SECTION_TIPO : Find portal_section_tipo in related terms and store for use later
		foreach ((array)$ar_related as $key => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				#dump($modelo_name,"modelo_name $modelo");

			if ($modelo_name==='component_state') {
				$component_state_tipo = $current_tipo; // Store to reuse in custom layout map later
			}
			elseif ($modelo_name==='section') {
				$ar_target_section_tipo[] = $current_tipo; // Set portal_section_tipo find it
				unset($ar_related[$key]); // Remove self section_tipo from array of components
				//break;
			}
			elseif ($modelo_name==='exclude_elements') {
				unset($ar_related[$key]); // Remove self section_tipo from array of components
			}
		}
		#$layout_map = array($this->tipo => $ar_related);

		$layout_map = [];
		foreach ($ar_related as $current_related) {
			$related = new stdClass();
						$related->section_tipo 	= $ar_target_section_tipo[0];
						$related->tipo 			= $current_related;
						$related->mode 			= $modo;
			$layout_map[] = $related;
		}


		#
		# REMOVE_EXCLUDE_TERMS : CONFIG EXCLUDES
		# If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove elements from layout_map
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

		return $layout_map;
	}//end get_layout_map_OLD */
	


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
									'section_tipo' 	 => $preset_section_tipo,
									'component_tipo' => 'dd1242',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Tipo'
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
				'id' 			=> 'search_user_preset_layout_map',
				'modo' 			=> 'list',
				'section_tipo' 	=> 'dd1244',
				'limit'			=> 1,
				'full_count' 	=> false,
				'filter' 		=> (object)[
					'$and' => $filter
				],
				'select' 		=> [
					(object)[
						'path' 	=> [
							(object)[
								'section_tipo' 	=> $preset_section_tipo,
								'component_tipo'=> $component_json_tipo,
								'modelo' 		=> 'component_json',
								'name'			=> 'JSON Data'
							]
						],
						'component_path' => [
					        'components',
					        $component_json_tipo,
					        'dato',
					        'lg-nolan'
					    ]						
					]					
				]

			];
			#dump($search_query_object, ' search_query_object ++ '.to_string());
			#error_log('Preset layout_map search: '.PHP_EOL.json_encode($search_query_object));
		
		
		$search_development2 = new search_development2($search_query_object);
		$rows_data 			 = $search_development2->search();
			#dump($rows_data, ' rows_data ++ '.to_string());

		$ar_records = $rows_data->ar_records;
		if (empty($ar_records)) {
			$result 		= false;
		}else{
			$preset_value  	= reset($ar_records)->{$component_json_tipo};
			$result 		= json_decode($preset_value);
		}

		return $result;
	}//end search_user_preset



}
?>