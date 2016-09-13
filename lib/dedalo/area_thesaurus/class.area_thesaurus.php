<?php
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*
*/
class area_thesaurus extends area {
	


	/**
	* GET_ACTIVE_HIERARCHIES
	* @return array $active_hierarchies
	*/
	public function get_active_hierarchies() {

		return false;

		$options = new stdClass();
			$options->section_tipo 		= $this->tipo;
			$options->section_real_tipo = $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la estática;
			$options->layout_map 		= component_layout::get_layout_map_from_section( $this );
			$options->layout_map_list 	= $options->layout_map;
			$options->offset_list 		= (int)0;
			#$options->modo 			= $modo;
			#$options->context 			= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
			$options->search_options_session_key = $search_options_session_key;
				#dump($options, ' options ++ '.to_string());




		
		$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
		$table   		= common::get_matrix_table_from_tipo($section_tipo);
		$component_tipo = DEDALO_HIERARCHY_ACTIVE_TIPO;
		$typology_tipo  = DEDALO_HIERARCHY_TIPOLOGY_TIPO;
		
		$locator = new locator();
			$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
		$locator_json = json_encode($locator);

		/*
		SELECT id, section_id, section_tipo,
		 datos#>>'{components, rsc20, valor_list, lg-nolan}' AS rsc20,
		 datos#>>'{components, rsc21, valor_list, lg-nolan}' AS rsc21,
		 datos#>>'{components, rsc23, valor_list, lg-spa}' AS rsc23,
		 datos#>>'{components, rsc19, valor_list, lg-nolan}' AS rsc19,
		 datos#>>'{components, rsc26, valor_list, lg-nolan}' AS rsc26,
		 datos#>>'{components, rsc28, valor_list, lg-nolan}' AS rsc28,
		 datos#>>'{components, rsc36, valor_list, lg-spa}' AS rsc36,
		 datos#>>'{components, rsc244, valor_list, lg-nolan}' AS rsc244,
		 datos#>>'{components, rsc35, valor_list, lg-nolan}' AS rsc35 
		*/
		$strQuery 	= "
		SELECT id, section_id, section_tipo, datos
		datos#>>'{components, rsc20, valor_list, lg-nolan}' AS rsc20,
		FROM \"$table\"	
		WHERE section_tipo = '$section_tipo' AND datos#>'{components,$component_tipo,dato,lg-nolan}' @> '[$locator_json]'::jsonb		
		ORDER BY datos#>'{components,$typology_tipo,dato,lg-nolan}' ASC
		";
			dump($strQuery, ' $strQuery ++ '.to_string());
		if(!$result = JSON_RecordDataBoundObject::search_free($strQuery)) {
			
			$msg = "Failed Search. Data is not found. Please contact with your admin (1)" ;	
			if(SHOW_DEBUG) {
				throw new Exception($msg, 1);
			}
			trigger_error($msg);
			die($msg);
		}

		$active_hierarchies= array();
		while($rows = pg_fetch_assoc($result)) {
			$section_id = $rows['section_id'];	
			$active_hierarchies[$section_id] = $rows['datos'];
		}
		dump($active_hierarchies, ' $active_hierarchies ++ '.to_string());


		

		return $active_hierarchies;
	}//end get_active_hierarchies



}//end area_thesaurus
?>