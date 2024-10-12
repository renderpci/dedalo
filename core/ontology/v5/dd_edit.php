<?php
// ontology custom config file
require_once dirname(__FILE__) .'/config/config_ontology.php';



// login
	$is_logged	= login::is_logged();
	if($is_logged!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}
	$is_global_admin = security::is_global_admin(CURRENT_LOGGED_USED_ID);
	if($is_global_admin!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}



// classes and functions
	require_once(dirname(__FILE__) . '/lang/lang_code.php' );
	require_once(dirname(dirname(__FILE__)) . '/db/class.RecordObj_dd.php');
	require_once(dirname(dirname(__FILE__)) . '/db/class.RecordObj_descriptors_dd.php');
	require_once(dirname(__FILE__) . '/class.dd.php');
	require_once(dirname(__FILE__) . '/d3_functions.php');



// test. Propagate jer_dd and descriptors_dd to matrix Ontology records
	/*
	$range = range(1, 1343);
	// $range = range(1344, 1344);
	foreach ((array)$range as $n) {

		$current_tipo = 'dmm'.$n;
			dump($current_tipo, ' current_tipo ++ '.to_string());

		// edit
			// JSON Ontology Item save
			$json_item	= (object)ontology_v5::tipo_to_json_item($current_tipo);
				// dump($json_item, ' json_item ++ '.to_string());
			$save_item	= ontology_v5::save_json_ontology_item($current_tipo, $json_item);	// return object response

			if (!empty($json_item->descriptors)) {
				foreach ($json_item->descriptors as $descriptor_value) {

					$result = ontology_v5::edit_term((object)[
						'term_id'	=> $current_tipo,
						'dato'		=> $descriptor_value->value,
						'dato_tipo'	=> 'termino',
						'lang'		=> $descriptor_value->lang
					]);
				}
			}

			// if ($n>5) {
			// 	break;
			// }
	}
	die();
	*/



// short vars
	$localizacion	= $tesaurus_title ;
	$localizacion2	= $editar_title  ;
	$area			= 'tesauro';



// set request vars
	$vars = array('terminoID','frg','from');
	foreach($vars as $name)	$$name = common::setVar($name);
	$head = common::setVar('head','no');



// terminoID check
	if(empty($terminoID)) {
		exit(" <b> terminoID $no_definido_title </b>");
	}
	$terminoID = trim($terminoID);



// Data from current jer_dd (structure)
	$RecordObj_dd = new RecordObj_dd($terminoID);
	$tld			= $RecordObj_dd->get_tld();
	$parent			= $RecordObj_dd->get_parent();
	$modelo			= $RecordObj_dd->get_modelo();
	$userID			= $RecordObj_dd->get_userID();
	$esmodelo		= $RecordObj_dd->get_esmodelo();
	$esdescriptor	= $RecordObj_dd->get_esdescriptor();
	$visible		= $RecordObj_dd->get_visible();
	$norden			= $RecordObj_dd->get_norden();
	$traducible		= $RecordObj_dd->get_traducible();
	$propiedades	= $RecordObj_dd->get_propiedades();
	$properties		= $RecordObj_dd->get_properties();
	$term			= $RecordObj_dd->get_term();
	// Hijos del término actual
	$hijosArray		= $RecordObj_dd->get_ar_childrens_of_this();
	$nHijos			= count($hijosArray);
	$ar_siblings	= $RecordObj_dd->get_ar_siblings_of_this();
	// Array de padres
	$ar_parents_of_this	= $RecordObj_dd->get_ar_parents_of_this();



// Consultamos si está relacionado
	$verificarTR	= count(RecordObj_dd::get_ar_terminos_relacionados($terminoID));
	$hasRelation	= ($verificarTR >0)
		? 'si'
		: 'no';



	// DESCRIPTORS (matrix_tesauro) Data from current descriptor
		// $matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
		// $RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, NULL, $tipo='termino');	#$matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false
		// $termino					= $RecordObj_descriptors_dd->get_dato();
		// $id							= $RecordObj_descriptors_dd->get_ID();
		// $parent_desc				= $terminoID;
		// $lang						= $RecordObj_descriptors_dd->get_lang();
		// $mainLang					= $RecordObj_descriptors_dd->get_mainLang();

		// $term = $RecordObj_dd->get_term() ?? new stdClass();
		$mainLang		= DEDALO_STRUCTURE_LANG;
		$termino		= RecordObj_dd::get_termino_by_tipo($terminoID, $mainLang);
		$lang			= $mainLang;
		$langFull		= lang::get_name_from_code( $lang );
		$ar_all_langs	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

	# TR DESCRIPTOR MAIN LANG AND DEF
		// $matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		// $RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='def');
		// $def				= $RecordObj->get_dato();
		// $def_id			= $RecordObj->get_ID();

	// dd_descriptors_grid html
		ob_start();
		include dirname(__FILE__) . '/html/dd_descriptors_grid.phtml';
		$descriptors_tr_html = ob_get_clean();

	// tr obs main lang
		// $matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		// $RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='obs');
		// $obs			= $RecordObj->get_dato();
		// $obs_id			= $RecordObj->get_ID();

	// dd_descriptors_grid_obs html
		// $file_include	= dirname(__FILE__) . '/html/dd_descriptors_grid_obs.phtml';
		// ob_start();		include ( $file_include );
		// $descriptors_tr_obs_html = ob_get_clean();



// load vista template code
require_once dirname(__FILE__) . '/html/dd_edit.phtml';

// Write session to unlock session file
session_write_close();

exit();
