<?php

	# CONTROLLER
	$tool_name 		= get_class($this);
	$section_tipo 	= $this->section_tipo;
	$section_id 	= $this->section_id;
	$modo 			= $this->modo;	

	# Prevent show button in page tool mode
	if(isset($_GET['m']) && strpos($_GET['m'],'tool')!==false ) {
		return null;
	}

	# TOOL CSS / JS MAIN FILES
	#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

		
	switch ($modo) {

		case 'button':			
			# Show tool button
			$ar_diffusion_map = diffusion::get_ar_diffusion_map(DEDALO_DIFFUSION_DOMAIN);
				
			break;

		case 'button_inspector';
			# Show tool buttons
			$ar_diffusion_map = diffusion::get_ar_diffusion_map(DEDALO_DIFFUSION_DOMAIN);

			#
			# SECTION DIFFUSION_INFO		
			$section 		= section::get_instance($section_id, $section_tipo, 'edit');
			$diffusion_info = $section->get_diffusion_info();
				#dump($diffusion_info, ' $diffusion_info ++ '.to_string());				
			break;

		case 'button_thesaurus';
			#
			# TEST
			#$have_section_diffusion = $this->have_section_diffusion();
			#if (!$have_section_diffusion) {
			#	return null;
			#}

			# Show tool button			

			#
			# DIFFUSION_ELEMENT_TIPO
			# De momento y hasta que se cambie el funcionamiento del tesauro, presuponemos que se encuentra SIEMPRE EN EL PRIMER diffusion_element
			$ar_diffusion_map_elements 	= diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);				
			$diffusion_element    		= reset($ar_diffusion_map_elements);
			$diffusion_element_tipo    	= $diffusion_element->element_tipo;
				#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($diffusion_element_tipo)); die();

			$options = new stdClass();
				$options->section_tipo 			= $this->section_tipo;
				$options->mode 					='export_thesaurus';
				$options->diffusion_element_tipo= $diffusion_element_tipo;

			$options_json = json_encode($options);
			# ar_thesaurus_tables
			$ar_thesaurus_tables = (array)$this->get_ar_thesaurus_tables();			
			break;

		case 'list':
			# All list records selected
			break;

		case 'edit':
			# Current section only
			break;

		default:
			return null;
			break;
	}

	$page_html = DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this) . '/html/' . get_class($this) . '_' . $this->modo . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>