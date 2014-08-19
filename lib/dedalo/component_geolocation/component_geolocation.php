<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();		#dump($this);	
	$permissions			= common::get_permissions($tipo);
	$html_title				= "Info about $id";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name = $modo;
		#dump($file_name,'$file_name');
	
	switch($modo) {		
		
		case 'player':
		case 'edit':	
				# CSS
					css::$ar_url[] = DEDALO_ROOT_WEB .'/lib/leaflet/leaflet.css';
					css::$ar_url[] = DEDALO_ROOT_WEB .'/lib/leaflet/Leaflet.draw-master/dist/leaflet.draw.css';

				# JS	
					js::$ar_url[] = DEDALO_ROOT_WEB . '/lib/leaflet/leaflet.js';
					js::$ar_url[] = DEDALO_ROOT_WEB . '/lib/leaflet/Leaflet.draw-master/dist/leaflet.draw.js';
					switch (DEDALO_GEO_PROVIDER) {
						case 'GOOGLE':
							js::$ar_url[] = DEDALO_ROOT_WEB .'/lib/leaflet/leaflet-google.js';
							break;						
						default:			
							break;
					}

				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico;								
				break;

		case 'search' :	
				$id_wrapper = 'wrapper_'.$identificador_unico;								
				break;
		
	}

	/*
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	*/
	if( !include(DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml')) {
		echo "<div class=\"error\">Invalid mode</div>";
	}


?>