<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();	
	$permissions			= $this->get_component_permissions();
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	
	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return null;

	$file_name = $modo;	
	switch($modo) {		
		
		case 'player':
		case 'edit':
				$file_name = 'edit';
				$leaflet_dist = 'stable_versions';	// stable_versions | dev_versions
				# CSS
					#css::$ar_url[] = DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.css";
					#css::$ar_url[] = DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.draw/leaflet.draw.css";
					array_unshift(css::$ar_url_basic, DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.css");
					array_unshift(css::$ar_url_basic, DEDALO_ROOT_WEB ."/lib/leaflet/$leaflet_dist/leaflet.draw/leaflet.draw.css");

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

				$dato = $this->get_dato();
					// empty dato case, use default to set initial map position
					if (empty($dato) || empty($dato->lat) || empty($dato->lon)) {
						$dato_default = new stdClass();
							$dato_default->lat	= 39.462571;
							$dato_default->lon	= -0.376295;	# Calle Denia
							$dato_default->zoom	= 12;
							$dato_default->alt	= 16;
						$dato = $dato_default;
					}

				$dato_json		= json_encode($dato);				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info = $this->get_component_info('json');

				$value_lat = (strpos($dato->lat, ',')!==false) ? str_replace(',', '.', $dato->lat) : $dato->lat;
				$value_lon = (strpos($dato->lon, ',')!==false) ? str_replace(',', '.', $dato->lon) : $dato->lon;
				$value_zoom= (int)$dato->zoom;

				# Related components
				$ar_related_component_tipo 		= $this->get_ar_related_component_tipo();
				$ar_related_component_tipo_json = json_encode($ar_related_component_tipo);	
				break;

		case 'search' :
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : null;
				
				$id_wrapper = 'wrapper_'.$identificador_unico;
				
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
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


