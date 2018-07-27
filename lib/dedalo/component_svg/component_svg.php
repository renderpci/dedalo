<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();
	$section_tipo 			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();	
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$html_title				= "Info about $tipo";
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;
	
	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return null;
	

	switch($modo) {		
	
		case 'edit'	:
		//case 'player' :
				#
				# JS includes additionals
					#js::$ar_url[] = PAPER_JS_URL;
					#js::$ar_url[] = DEDALO_LIB_BASE_URL . '/component_image/js/component_image_read.js' ;
				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info = $this->get_component_info('json');
				$svg_id 		= $this->get_svg_id(); // Equivalent of image SID
				$file_path 		= $this->get_file_path();

				# file exsists
				$file_exists 	= file_exists($file_path);
				if ($file_exists===true) {
					# URL
					$file_url	= $this->get_url();
					# Force refresh always 
					$file_url	.= '?' . start_time();
				}else{
					$file_url	= component_svg::get_default_svg_url();
				}

				# file_content				
				$file_content 	= null; // file_get_contents($file_path);				
						
				# Related components
				#$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				#$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);						
				break;

		case 'print' :
				#$dato = htmlentities($dato);
				break;

		case 'tool_time_machine'	:	
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;		
										
		case 'list'	:
				# file exsists
				$file_path 		= $this->get_file_path();
				$file_exists 	= file_exists($file_path);

				if ($file_exists===true) {
					# URL
					$file_url	= $this->get_url();
					# Force refresh always 
					$file_url	.= '?' . start_time();
				}else{
					$file_url	= '';
				}
				break;	
		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();
					#dump($render_vars, ' render_vars ++ '.to_string());
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;								
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>