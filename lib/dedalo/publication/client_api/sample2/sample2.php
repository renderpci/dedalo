<?php
/*
	CONTROLLER
	Controller set specific page vars and create document content. 
*/
require_once(dirname(dirname(__FILE__)) .'/config_api/client_config_api.php');
	
	
	# SAMPLE GET ONE RECORD FILTERED

		# set request vars (id, lang, etc..) if need
		$id 	= isset($_GET['id']) ? $_GET['id'] : 1;
		$table  = isset($_GET['t'])  ? $_GET['t']  : WEB_DEFAULT_TABLE;

		# Esto es opcional. Si pasamos como opción 'resolve_portal' = true , se resolverán TODAS las
		# referencias (portales). Si no, podemos especificarlas una a una, de esta manera:
		// Desactivo (los resolvemos todos automáticamente)
		# $portals = new stdClass(); 
		#	$portals->imagen_identificativa = 'imagenes';
		#	$portals->imagenes 				= 'imagenes';

		$options = new stdClass();
			$options->dedalo_get 	= 'records';
			$options->table 		= $table;
			$options->lang  		= WEB_CURRENT_LANG_CODE;
			$options->sql_filter 	= "section_id = $id";
			$options->resolve_portal = true;
			#$options->resolve_portals_custom = $portals; // Desactivo (los resolvemos todos automáticamente) ver arriba			
	
		#
		# DATA RETRIEVING
		# Get data with current options
		$search_data_records = json_web_data::get_data($options);

		#
		# SHOW DATA
		# If you need see the data structure, uncomment this dump line
		#dump($search_data_records, ' search_data_records ++ '.to_string()); #die();


		# Thesaurus term info
		$terminoID  = 'ts1_1'; // For example
		$terminoID2 = 'ts1_2';
		$options = new stdClass();
			$options->dedalo_get 	 = 'records';
			$options->table 	 	 = 'themes';
			$options->lang  	 	 = WEB_CURRENT_LANG_CODE;
			$options->sql_filter 	 = " `terminoID` = '$terminoID' OR `terminoID` = '$terminoID2'";		
			$options->resolve_portal = false; //  Note that this param set as true forces resolve all portals inside
			
		#
		# DATA RETRIEVING
		# Get data with current options
		$thesaurus_data_records = json_web_data::get_data($options);
			#dump($thesaurus_data_records, ' thesaurus_data_records ++ '.to_string($options)); die();


	

# HTML CONTENT
	# Current directory path like '/home/site/sample2'
	$cwd = basename(__DIR__);
# Get specifig body content of current page
	ob_start();
	include ( __WEB_ROOT__ .'/'. $cwd . '/html/' . $cwd . '.phtml');
	$html = ob_get_clean();
	echo wrap_html($html,$cwd);
?>