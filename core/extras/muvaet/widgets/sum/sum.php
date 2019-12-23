<?php

	# CONTROLLER
	

		$widget_name 				 	= $this->widget_name;
		$modo 						 	= $this->component_info->get_modo();
		$parent 					 	= $this->component_info->get_parent();		
		$section_tipo 				 	= $this->component_info->get_section_tipo();
		$data_source 				 	= $this->data_source;
		$component_target_section_tipo  = key($data_source);
		$component_target_tipo 		 	= reset($data_source);
		$filename 					 	= $modo;


		switch ($modo) {

			case 'list':
				$filename = 'edit';
			case 'edit':				

				#
				# DATA_SOURCE
				# Format : 
				# stdClass Object
				# (
				#    [muvaet2] => muvaet10
				# )
				# dump($data_source, ' data_source ++ '.to_string());

				$search_options_session_key = 'section_'.$section_tipo;
					#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], ' _SESSION[] ++ '.to_string());
				$current_options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];


				if (isset($_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key])) {
					
					# Precalculated value
					$total = $_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key];
				
				}else{
					/*
					[section_tipo] => muvaet2
					[section_real_tipo] => muvaet2
					[json_field] => datos
					[modo] => edit
					[context] => default
					[matrix_table] => matrix
					[layout_map] => Array
						(
						)

					[sql_columns] => 
					[projects] => 
					[filter_by_id] => 
					[filter_by_locator] => 
					[filter_by_search] => 
					[filter_by_propiedades] => 
					[filter_by_section_creator_portal_tipo] => 
					[filter_by_inverse_locators] => 
					[filter_custom] => 
					[operators] => 
					[full_count] => 3
					[tipo_de_dato] => valor_list
					[tipo_de_dato_search] => dato
					[tipo_de_dato_order] => valor
					[limit] => 1
					[offset] => 0
					[group_by] => 
					[order_by] => section_id ASC
					[order_by_locator] => 
					[search_options_session_key] => section_muvaet2
					[offset_list] => 0
					[limit_list] => 10
					[layout_map_list] => 
					*/
					$options = new stdClass();
						$options->section_tipo 		= $current_options->section_tipo;
						$options->section_real_tipo = $current_options->section_real_tipo;
						$options->json_field 		= $current_options->json_field;
						$options->modo 				= 'list';
						$options->matrix_table 		= $current_options->matrix_table;
						$options->limit 			= 0;	//$current_options->limit_list;
						$options->full_count 		= false; //$current_options->full_count;
						$options->offset 			= 0;	//$current_options->offset_list;
						$options->sql_columns 		= "a.id";
						$options->query_wrap 		 = "\n SELECT SUM( CAST( a.datos#>>'{components, $component_target_tipo, dato, lg-nolan}' AS REAL )) AS total";
						$options->query_wrap 		.= "\n FROM \"$options->matrix_table\" a";
						$options->query_wrap 		.= " WHERE a.id IN (%s);";
					
					$rows_data = search::get_records_data($options);
						#dump($rows_data, ' $rows_data ++ '.to_string());

					/*
					SELECT 
					 SUM( CAST( a.datos#>>'{components, muvaet14, dato, lg-nolan}' AS INTEGER )) AS total
					 FROM "matrix" a   
					 WHERE a.id IN (

					 SELECT a.id
					 FROM "matrix" a   
					 WHERE a.id IN (SELECT a.id FROM "matrix" a WHERE  a.section_id IS NOT NULL 
					-- filter_by_section_tipo -- 
					 AND (a.section_tipo = 'muvaet2')  
					 ORDER BY section_id ASC, a.section_id ASC 
					 LIMIT 3)  
					 ORDER BY section_id ASC, a.section_id ASC
					) 
					*/
					$total = isset($rows_data->result[0][0]['total']) ? $rows_data->result[0][0]['total'] : 0;
						#dump($total, ' total ++ '.to_string());

					# Store for speed
					$_SESSION['dedalo4']['config']['sum_total'][$search_options_session_key] = $total;	
				}				
				

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";

				if($modo==='edit') {
					js::$ar_url[]    = $widget_base_url ."/js/".$widget_name.".js";	
				}
				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}


		
		
		$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode $modo</div>";
		}

?>