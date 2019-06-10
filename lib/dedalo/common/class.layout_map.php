<?php


/**
* CLASS LAYOUT_MAP
*/
class layout_map {

	
	/**
	* GET_LAYOUT_MAP
	* Calculate display items to generate portal html
	* Cases:
	*	1. Modo 'list' : Uses childrens to build layout map
	* 	2. Modo 'edit' : Uses related terms to build layout map (default)	
	*/
	public static function get_layout_map($section_tipo, $tipo, $user_id) {


		// preset. look db presets for existing user layout_map preset
			$preset_data = self::search_preset($section_tipo, $tipo, $user_id);

die();


		
		if (isset($this->layout_map) && !empty($this->layout_map)) return $this->layout_map;

			#dump($view, ' $view ++ '.to_string());

		$ar_related=array();
		switch ($this->modo) {
			case 'list':
			case 'portal_list':
				# CASE SECTION LIST IS DEFINED				
				$ar_terms 		  = (array)RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'section_list', 'children', true);
				
				if(isset($ar_terms[0]) ) {
					
					# Use found related terms as new list
					$current_term = $ar_terms[0];
					$ar_related   = (array)RecordObj_dd::get_ar_terminos_relacionados($current_term, $cache=true, $simple=true);
					
				}else{

					# FALLBACK RELATED WHEN SECTION LIST IS NOT DEFINED
					# If not defined sectiopn list
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);						
				}
				break;
			
			case 'edit':
			default:
				if($view==='full') { // || $view==='view_mosaic'
					$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($this->tipo, $cache=true, $simple=true);
					break;
				}else{
					# CASE VIEW IS DEFINED
					$ar_terms = (array)RecordObj_dd::get_ar_childrens($this->tipo); 	#dump($ar_terms, " childrens $this->tipo".to_string());				
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
								$this->edit_view_options = $edit_view_propiedades->edit_view_options;									
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
				$this->component_state_tipo = $current_tipo; // Store to reuse in custom layout map later
			}
			elseif ($modelo_name==='section') {
				$this->ar_target_section_tipo[] = $current_tipo; // Set portal_section_tipo find it
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
						$related->section_tipo 	= $this->ar_target_section_tipo[0];
						$related->tipo 			= $current_related;
						$related->mode 			= $this->get_modo();
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
	}//end get_layout_map



	/**
	* SEARCH_PRESET
	* @return 
	*/
	public function search_preset($section_tipo, $tipo, $user_id) {

		// preset const
			$user_locator = new locator();
				$user_locator->set_section_tipo('dd128');
				$user_locator->set_section_id($user_id);			


		$search_query_object = [
			'id' 			=> 'search_preset_layout_map',
			'modo' 			=> 'list',
			'section_tipo' 	=> 'dd1244',
			'limit'			=> 1,
			'full_count' 	=> false,
			'filter' 		=> [
				'$and' => [
							[
								'q' 	=> $tipo,
								'path' 	=> [
									'section_tipo' 	 => 'dd1244',
									'component_tipo' => 'dd1242',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Tipo'
								]
							],
							[
								'q' 	=> $section_tipo,
								'path' 	=> [
									'section_tipo' 	 => 'dd1244',
									'component_tipo' => 'dd642',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Section tipo'
								]
							],
							[
								'q' 	=> $section_tipo,
								'path' 	=> [
									'section_tipo' 	 => 'dd1244',
									'component_tipo' => 'dd1246',
									'modelo' 		 => 'component_input_text',
									'name' 			 => 'Mode'
								]
							],
							[
								'q' 	=> $user_locator,
								'path' 	=> [
									'section_tipo' 	 => 'dd1244',
									'component_tipo' => 'dd654',
									'modelo' 		 => 'component_select',
									'name' 			 => 'User'
								]
							]
						]
				]
			],
			'select' 		=> [
				[
					"name"			=> "Tipo",
		          	"modelo" 		=> "component_json",
		          	"section_tipo" 	=> "dd1244",
		          	"component_tipo"=> "dd625"
				]
			]

		];
		dump($search_query_object, ' search_query_object ++ '.to_string());
		
		
		$search_development2 = new search_development2($search_query_object);
		$rows_data 			 = $search_development2->search();
			dump($rows_data, ' rows_data ++ '.to_string());

	}//end search_preset



}
?>