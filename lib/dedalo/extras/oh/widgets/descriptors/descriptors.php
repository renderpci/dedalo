<?php

	# CONTROLLER
	

	$widget_name 				= $this->widget_name;
	$component_tipo 			= $this->component_info->get_tipo();
	$modo 						= $this->component_info->get_modo();
	$parent 					= $this->component_info->get_parent();
	$section_tipo 				= $this->component_info->get_section_tipo();
	$data_source 				= $this->data_source;
	$component_portal_tipo 		= key($data_source);
	$component_text_area_tipo 	= reset($data_source);
	$filename 					= $modo;

	
	switch ($modo) {

		case 'list':
			$filename = 'list';
			
			$widget_base_url = $this->get_widget_base_url();
			
			$css_url 	 	 = $widget_base_url ."/css/".$widget_name.".css";
			if ( !in_array($css_url, css::$ar_url) ) {
				css::$ar_url[] = $css_url;
			}

			$js_url = $widget_base_url ."/js/".$widget_name.".js";
			if ( !in_array($js_url, js::$ar_url) ) {
				js::$ar_url[] = $js_url;
			}
			#dump(js::$ar_url, ' var ++ '.to_string());			
			break;

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
			# dump($ar_locators, ' ar_locators ++ '.to_string());

			if (empty($ar_locators)) {
				return null;
			}

			#
			# INDEXATIONS BY SECTION_ID (cinta)
			$ar_indexations = array();
			foreach ($ar_locators as $key => $locator) {
				#dump(RecordObj_descriptors::get_indexations_for_locator( $locator ), 'RecordObj_descriptors::get_indexations_for_locator( $locator ) ++ '.to_string());
				#$indexations = RecordObj_descriptors::get_indexations_for_locator( $locator );
				$indexations = component_relation_index::get_indexations_for_locator( $locator );
					#dump($indexations, ' indexations ++ '.to_string());
					
				$ar_indexations[$locator->section_id] = $indexations;
			}
			#dump($ar_indexations, ' ar_indexations ++ '.to_string());
			if (empty($ar_indexations)) {
				return null;
			}

			#
			# TERMS STATS (number of every term uses)
			$ar_terms 	= array();
			$total_index= 0;
			foreach ($ar_indexations as $section_id => $ar_value) foreach ($ar_value as $pseudo_locator => $count) {
				#dump($pseudo_locator, ' pseudo_locator ++ '.to_string($count));
				if (isset($ar_terms[$pseudo_locator])) {
					$ar_terms[$pseudo_locator] += $count;
						#dump($pseudo_locator, ' pseudo_locator ++ '.to_string());
				}else{
					$ar_terms[$pseudo_locator]=$count;
				}
				$total_index += $count;
			}
			#dump($ar_terms, '$ar_terms ++ '.to_string());


			$ar_terms_resolved = array();
			foreach ($ar_terms as $pseudo_locator => $total) {
				#$termino = RecordObj_ts::get_termino_by_tipo($pseudo_locator, DEDALO_DATA_LANG, true, true);
				$locator = json_decode($pseudo_locator);
				$termino = ts_object::get_term_by_locator( $locator, $lang=DEDALO_DATA_LANG, $from_cache=false );
				$ar_terms_resolved[$termino] = $total;
			}
			ksort($ar_terms_resolved, SORT_NATURAL);
			

			$widget_base_url = $this->get_widget_base_url();
			
			$css_url 	 	 = $widget_base_url ."/css/".$widget_name.".css";
			if ( !in_array($css_url, css::$ar_url) ) {
				css::$ar_url[] = $css_url;
			}

			$js_url = $widget_base_url ."/js/".$widget_name.".js";
			if ( !in_array($js_url, js::$ar_url) ) {
				js::$ar_url[] = $js_url;
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