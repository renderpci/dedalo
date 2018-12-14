<?php

	# CONTROLLER
	
	
		$widget_name 			= $this->widget_name;
		$modo 					= $this->component_info->get_modo();
		$parent 				= $this->component_info->get_parent();		
		$section_tipo 			= $this->component_info->get_section_tipo();
		$data_source 			= $this->data_source;
		$component_portal_tipo 	= key($data_source);
		$media_component_tipo 	= reset($data_source);
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

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";
				#js::$ar_url[]   = $widget_base_url ."/js/".$widget_name.".js";
				
				$media_component_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($media_component_tipo, true);

				$use_cache = true;			

				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}


		
		
		$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode $modo</div>";
		}

?>