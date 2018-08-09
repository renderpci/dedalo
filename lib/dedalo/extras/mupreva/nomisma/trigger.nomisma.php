<?php
#
# TRIGGER NOMISMA MUPREVA
# DEDALO4 NOMISMA ACTIONS TRIGGER AREA
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

# set vars
	$vars = array('mode','options','section_tipo','section_id');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");



/**
* DUMP_COLLECTION
*
*/
if ($mode=='dump_collection') {

	$start_time = start_time();

	require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_rdf.php');
	require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php');

	/* Reference
	[filter_by_search] => stdClass Object
        (
            [mupreva1518] => {"section_id":"4","section_tipo":"mupreva494"}
        )
    [operators] => stdClass Object
        (
            [comparison_operator] => stdClass Object
                (
                    [mupreva1224] => =
                    [mupreva776] => ILIKE
                    [mupreva1510] => =
                    [mupreva1518] => =
                )

            [logical_operator] => stdClass Object
                (
                    [mupreva1224] => AND
                    [mupreva776] => AND
                    [mupreva1510] => AND
                    [mupreva1518] => AND
                )

        )
        */

	# COLECCION
	if (!$section_id) {
		exit("Error. section_id is mandatory");
	}
	if (!$section_tipo) {
		exit("Error. section_tipo is mandatory");
	}

	# STATIC : Overwrite anything erquested
	//$section_tipo = 'mupreva494';
	//$section_id   = 4;
	$section_tipo = 'dd64';
	$section_id   = 1;

	#
	# FILTER_BY_SEARCH
	$catalogo_section_tipo 	= 'mupreva1'; 	 // Catálogo
	//$catalogo_tipo_conjunto = 'mupreva1518'; // Autocomplete conjunto	
	$catalogo_tipo_conjunto = 'mupreva2232'; //pubicación nomisma Si-NO

	$locator_conjunto = '{"section_id":"'.$section_id.'","section_tipo":"'.$section_tipo.'"}'; // Locator 'Tresor de Llíria' as json encode 4 - mupreva494
	$filter_by_search = new stdClass();
		$filter_by_search->$catalogo_tipo_conjunto = $locator_conjunto;
			#dump($filter_by_search, ' $filter_by_search ++ '.to_string()); #die();
	#
	# OPERATORS
	$operators = new stdClass();
		
		$comparison_operator = new stdClass();
			$comparison_operator->$catalogo_tipo_conjunto = '=';

		$operators->comparison_operator = $comparison_operator;

		$logical_operator = new stdClass();
			$logical_operator->$catalogo_tipo_conjunto = 'AND';

		$operators->logical_operator = $logical_operator;

	# OPTIONS
		$options = new stdClass();
			$options->section_tipo  			 = $catalogo_section_tipo;
			$options->filter_by_search 			 = $filter_by_search;
			$options->operators 			 	 = $operators;
			$options->layout_map  				 = array();
			$options->modo  					 = 'edit';
			$options->limit 					 = false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
			$options->search_options_session_key = 'dump_collection';

	$rows_data = search::get_records_data($options);
		#dump($rows_data, ' rows_data ++ '.to_string());
	
	$ar_section_id=array();
	foreach ($rows_data->result as $key => $ar_value) {
		
		$section_id 	 = reset($ar_value)['section_id'];
		$ar_section_id[] = $section_id;

	}//end foreach ($rows_data->result as $key => $ar_value) {
	#dump($ar_section_id, ' ar_section_id ++ '.to_string()); die();


	#
	# PUBLICAR EN MYSQL
	$publicate_in_mysql=true;
	if ($publicate_in_mysql) {

		set_time_limit(60*60*2);	// A full dumb can cost minimun 50 min (3500 sec).

		$diffusion = new diffusion_mysql();
		
		foreach ($rows_data->result as $ar_value) {
		
			$current_section_id = reset($ar_value)['section_id'];

			$options = new stdClass();
				$options->section_tipo 			 = $catalogo_section_tipo;
				$options->section_id   			 = $current_section_id;
				$options->diffusion_element_tipo = (string)'mupreva800'; // Web MUPREVA (MySQL)

			$result = $diffusion->update_record( $options, $resolve_references=true );
			debug_log(__METHOD__." MUPREVA: Updated MySQL web data for record $current_section_id of section $catalogo_section_tipo - result: ".to_string($result), logger::DEBUG);

		}//end foreach ($rows_data->result as $key => $ar_value) {		
		exit("Stop. Publicacón MySQL terminada. La generación del rdf está detenida para evitar sobreescribir el fichero actual");
	}
			
		
	exit("Ops.. La generación del rdf está detenida para evitar sobreescribir el fichero actual.");

	#
	# DIFFUSION RDF
	$diffusion_rdf = new diffusion_rdf();

	$rdf_file_name = 'nomisma.rdf';

	$options = new stdClass();
		$options->xml_tipo 			= 'mupreva2190';	// Numisma RDF : molelo_name : xml
		$options->section_tipo  	= $catalogo_section_tipo;	// Catálogo
		$options->ar_section_id 	= $ar_section_id;	// range(1,1000);	// array(45001,45002,45003);
		$options->save_to_file_path = DEDALO_EXTRAS_PATH .'/mupreva/nomisma/data/' . $rdf_file_name; // Target file

	$response = $diffusion_rdf->build_xml_file( $options );
		#dump($response, ' response ++ '.to_string($options));	


	#
	#echo $rdf_file;	//"<pre>".htmlspecialchars($rdf_file)."</pre>";

	#if(SHOW_DEBUG) {
		$rdf_file = file_get_contents($options->save_to_file_path);
		$msg = "<span>Ok. Created RDF file '$rdf_file_name' with " .count($ar_section_id). " elements</span>";
		if(SHOW_DEBUG) {
		 	$msg .= " <br>[Exec time: ".exec_time_unit($start_time,'secs')." secs - Memory usage: ".dd_memory_usage()."] ";
		 	$msg .= " <br>File saved to: ".$options->save_to_file_path ."<br>";
		} 
		$msg .= "<br> ";
		$msg .= " <a href=\"". DEDALO_LIB_BASE_URL . '/extras/mupreva/nomisma/data/' . $rdf_file_name."\" target=\"_blank\" style=\"color:white\">Download File</a>"; // style=\"position:absolute;right:12px;top:8px\"
		$msg .= "<br><br> ";
		echo $msg;
	#}

	exit();

}//end dump_collection



exit("Bad request");
?>