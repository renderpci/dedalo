<?php

	# CONTROLLER
	

		$widget_name 				 = $this->widget_name;
		$modo 						 = $this->component_info->get_modo();
		$tipo 					 	= $this->component_info->get_tipo();	
		$parent 					 = $this->component_info->get_parent();		
		$section_tipo 				 = $this->component_info->get_section_tipo();

		$data_source 				 		= $this->data_source;
		$component_referenced_section_tipo 	= key($data_source);
		$component_referenced_tipo 		 	= reset($data_source);

		$filename 					 = $modo;

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
				
				$state = null;

				if (isset($this->component_referenced_dato)) {
					
					$component_referenced_dato = $this->component_referenced_dato;	// When we are in list, injected from portal data
				
				}else{

					#
					# COMPONENT PORTAL (calculate when in edit normally)	
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_referenced_tipo,true);
					$component 	 = component_common::get_instance($modelo_name,
																  $component_referenced_tipo,
																  $parent,
																  'list',
																  DEDALO_DATA_NOLAN,
																  $component_referenced_section_tipo);
					$component_referenced_dato = (array)$component->get_dato();			
				}
				#dump($component_referenced_dato, ' component_referenced_dato ++ '.to_string());

				# Default value
				$state = 'red';
				if (!empty($component_referenced_dato[0])) {

					$dato = new locator($component_referenced_dato[0]);
					
					#
					# GREEN VALUE {"section_id":"1","section_tipo":"muvaet165"}
					$locator = new locator();
						$locator->set_section_tipo('muvaet165');
						$locator->set_section_id('2');					

					$equal = locator::compare_locators( $locator, $dato, $ar_properties=array('section_tipo','section_id') );
					if ($equal===true) {
						$state = 'green';
					}
				}

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";
				js::$ar_url[]   = $widget_base_url ."/js/".$widget_name.".js";
				break;				

			default:
				return "Sorry. Mode: $modo is not supported";
		}


		
		
		$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
		if( !include($page_html) ) {
			echo "<div class=\"error\">Invalid widget mode $modo</div>";
		}

?>