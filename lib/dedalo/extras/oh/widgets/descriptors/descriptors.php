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
	
	// overwrite modo if widget_mode exists (export case)
		if (!empty($widget_mode)) {
		 	$modo  = $widget_mode;
		 } 

	$filename = $modo;

	switch ($modo) {

		case 'export' :
			return null;
			
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

			if (empty($ar_locators)) {
				return null;
			}

			#
			# INDEXATIONS BY SECTION_ID (cinta)
			$ar_indexations = array();
			foreach ($ar_locators as $key => $locator) {
								
				$current_component_tipo = $locator->from_component_tipo;
				$current_section_tipo 	= $locator->section_tipo;
				$current_section_id 	= $locator->section_id;
				
				$current_options = new stdClass();
					$current_options->fields = new stdClass();
						$current_options->fields->section_tipo 	= $current_section_tipo;
						$current_options->fields->section_id 	= $current_section_id;
						$current_options->fields->component_tipo= false;
						$current_options->fields->type 			= DEDALO_RELATION_TYPE_INDEX_TIPO;
						$current_options->fields->tag_id 		= false;
				$indexations = component_relation_index::get_indexations_search($current_options);
				
				$ar_indexations[$locator->section_id] = $indexations;
			}
			if (empty($ar_indexations)) {
				return null;
			}

			#
			# TERMS STATS (number of every term uses)
			$ar_terms 	= array();
			$total_index= 0;
			foreach ($ar_indexations as $section_id => $ar_locators) foreach ($ar_locators as $current_locator) {

				$pseudo_locator = new locator();
					$pseudo_locator->set_section_tipo($current_locator->from_section_tipo);
					$pseudo_locator->set_section_id($current_locator->from_section_id);
				$pseudo_locator = json_encode($pseudo_locator);

				if (isset($ar_terms[$pseudo_locator])) {
					$ar_terms[$pseudo_locator] += 1;
				}else{
					$ar_terms[$pseudo_locator] = 1;
				}
				$total_index += 1;
			}


			$ar_terms_resolved = array();
			foreach ($ar_terms as $pseudo_locator => $total) {
				#$termino = RecordObj_ts::get_termino_by_tipo($pseudo_locator, DEDALO_DATA_LANG, true, true);
				$locator = json_decode($pseudo_locator);
				$termino = ts_object::get_term_by_locator( $locator, $lang=DEDALO_DATA_LANG, $from_cache=false );
				$ar_terms_resolved[$termino] = $total;
			}
			ksort($ar_terms_resolved, SORT_NATURAL);
			#dump($ar_terms_resolved, ' ar_terms_resolved ++ '.to_string());

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