<?php

	# CONTROLLER
	

		$widget_name 			= $this->widget_name;
		$modo 					= $this->component_info->get_modo();
		$parent 				= $this->component_info->get_parent();		
		$section_tipo 			= $this->component_info->get_section_tipo();
		$data_source 			= $this->data_source;
		$component_portal_tipo 	= key($data_source);
		$component_text_area_tipo = reset($data_source);
		$filename 				= $modo;
		switch ($modo) {

			case 'list':
				$filename = 'edit';
			case 'edit':				

				#
				# DATA_SOURCE
				# Format : 
				# stdClass Object
				# (
				#    [oh25] => rsc35
				# )
				#dump($data_source, ' data_source ++ '.to_string());
				
				if (isset($this->ar_locators)) {
					
					$ar_locators = $this->ar_locators;	// When we are in list, injected from portal data
				
				}else{

					#
					# COMPONENT PORTAL (calculate when in edit normally)				
					$component 	 = component_common::get_instance('component_portal',
																  $component_portal_tipo,
																  $parent,
																  'list',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
					$ar_locators = $component->get_dato();						
				}
				#dump($ar_locators, ' ar_locators ++ '.to_string());

				if (empty($ar_locators)) {
					return null;
				}

				#
				# INDEXATIONS BY SECTION_ID (cinta)
				$ar_indexations = array();
				foreach ($ar_locators as $key => $locator) {
					#dump(RecordObj_descriptors::get_indexations_for_locator( $locator ), 'RecordObj_descriptors::get_indexations_for_locator( $locator ) ++ '.to_string());			
					$ar_indexations[$locator->section_id] = RecordObj_descriptors::get_indexations_for_locator( $locator );
				}
				#dump($ar_indexations, ' ar_indexations ++ '.to_string());
				if (empty($ar_indexations)) {
					return null;
				}

				#
				# TERMS STATS (number of every term uses)
				$ar_terms 	= array();
				$total_index= 0;
				foreach ($ar_indexations as $section_id => $ar_value) foreach ($ar_value as $terminoID => $count) {
					#dump($terminoID, ' terminoID ++ '.to_string());
					if (isset($ar_terms[$terminoID])) {
						$ar_terms[$terminoID] += $count;
							#dump($terminoID, ' terminoID ++ '.to_string());
					}else{
						$ar_terms[$terminoID]=$count;
					}
					$total_index += $count;
				}
				#dump($ar_terms, '$ar_terms ++ '.to_string());

				$ar_terms_resolved = array();
				foreach ($ar_terms as $terminoID => $total) {
					$termino = RecordObj_ts::get_termino_by_tipo($terminoID, DEDALO_DATA_LANG, true, true);
					$ar_terms_resolved[$termino] = $total;
				}
				ksort($ar_terms_resolved, SORT_NATURAL);
				


				css::$ar_url[] = DEDALO_LIB_BASE_URL.'/component_info/widgets/'. $widget_name ."/css/".$widget_name.".css";
				#js::$ar_url[]  = DEDALO_LIB_BASE_URL.'/component_info/widgets/'. $widget_name ."/js/".$widget_name.".js";						

				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}


		
		
		$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode $modo</div>";
		}

?>