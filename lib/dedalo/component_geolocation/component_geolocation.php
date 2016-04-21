<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();		#dump($this);	
	$permissions			= common::get_permissions($tipo);
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name = $modo;
		#dump($file_name,'$file_name');

	#dump($dato,'$dato');
	
	switch($modo) {		
		
		case 'player':
		case 'edit':
				$leaflet_dist = 'stable_versions';	// stable_versions | dev_versions
				# CSS
					css::$ar_url[] = DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.css";
					css::$ar_url[] = DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.draw/leaflet.draw.css";

				# JS
					js::$ar_url[] = defined('LEAFLET_JS_URL') ? LEAFLET_JS_URL : DEDALO_ROOT_WEB . "/lib/leaflet/$leaflet_dist/leaflet.js";									
					js::$ar_url[] = DEDALO_ROOT_WEB . "/lib/leaflet/$leaflet_dist/leaflet.draw/leaflet.draw.js";
					switch (DEDALO_GEO_PROVIDER) {
						case 'GOOGLE':
							js::$ar_url[] = DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet-google.js";
							break;						
						default:			
							break;
					}

				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$component_info 	= $this->get_component_info('json');
				$dato_json			= json_encode($dato);		
				break;

		case 'search' :	
				$id_wrapper = 'wrapper_'.$identificador_unico;								
				break;
		case 'list' :
				echo $valor;	
				return;							
				break;
	}

	

	$page_html = DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>