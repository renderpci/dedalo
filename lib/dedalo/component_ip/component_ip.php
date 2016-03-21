<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();		#dump($this);	
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	$ip						= $dato;


	$geoip_mm_mode = 'country';
	
	# GEO-IP FLAGS
	if($geoip_mm_mode == 'city') {
		require_once(DEDALO_ROOT."/lib/geoip/geoipcity.inc");
		require_once(DEDALO_ROOT."/lib/geoip/geoipregionvars.php");
		$geoip_mm = geoip_open(DEDALO_ROOT."/lib/geoip/data/GeoLiteCity.dat",GEOIP_STANDARD);
	}else{
		require_once(DEDALO_ROOT."/lib/geoip/geoip.inc");	
		$geoip_mm = geoip_open(DEDALO_ROOT."/lib/geoip/data/GeoIP.dat",GEOIP_STANDARD);
	}

	# geo-ip tool
	$geoiptoolURL 			= 'http://whatismyipaddress.com/ip/'; #'http://geotool.flagfox.net/?lang=es-ES&ip=',"http://www.geoiptool.com/es/?IP="
	#$geoip_mm_mode			= 'city';


	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name = $modo;

	
	
	switch($modo) {		
		case 'edit':
				$id_wrapper         = $this->get_id_wrapper();
				$component_info 	= $this->get_component_info('json');
				break;
		case 'search' :
				$file_name = 'list';
				return NULL;
				break;

		case 'list_tm' :
				$file_name = 'list';						
		case 'list'	:
				$ar_css		= false;
				break;
						
						
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>