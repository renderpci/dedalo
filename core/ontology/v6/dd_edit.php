<?php
// ontology custon config file
require_once( dirname(__FILE__) .'/config/config_ontology.php' );

# Old lang vars
require_once( dirname(__FILE__) . '/lang/lang_code.php' );

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
	require_once(dirname(__FILE__) . '/class.RecordObj_dd_edit.php');
	$dedalo_version = explode(".", DEDALO_VERSION);
	if( (int)$dedalo_version[0]<=6 && (int)$dedalo_version[1]<3 ){
		require_once(dirname(dirname(__FILE__)) . '/db/class.RecordObj_descriptors_dd.php');
	}
	// require_once(dirname(__FILE__) . '/common/class.navigator.php');
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
			$json_item	= (object)ontology::tipo_to_json_item($current_tipo);
				// dump($json_item, ' json_item ++ '.to_string());
			$save_item	= ontology::save_json_ontology_item($current_tipo, $json_item);	// return object response

			if (!empty($json_item->descriptors)) {
				foreach ($json_item->descriptors as $descriptor_value) {

					$result = ontology::edit_term((object)[
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


$localizacion	= $tesaurus_title ;
$localizacion2	= $editar_title  ;
$area			= 'tesauro';

# set vars
$vars = array('terminoID','frg','from');
foreach($vars as $name)	$$name = common::setVar($name);
$head = common::setVar('head','no');

if(empty($terminoID)) exit(" <b> terminoID $no_definido_title </b>");
$terminoID = trim($terminoID);


// ACTUALIZAR LA FICHA  #############################################
	// if( !empty($_POST["accion"]) ) {
	// 	$html		= '';
	// 	$accion		= 'editTS';
	// 	$edicion	= require_once( dirname(__FILE__). '/trigger.dd.php' );
	// }


# Data from current jer (structure)
	$RecordObj_dd		= new RecordObj_dd_edit($terminoID);
	$tld				= $RecordObj_dd->get_tld();
	$parent				= $RecordObj_dd->get_parent();
	$modelo				= $RecordObj_dd->get_modelo();
	$userID				= $RecordObj_dd->get_userID();
	$esmodelo			= $RecordObj_dd->get_esmodelo();
	$esdescriptor		= $RecordObj_dd->get_esdescriptor();
	$visible			= $RecordObj_dd->get_visible();
	$norden				= $RecordObj_dd->get_norden();
	$traducible			= $RecordObj_dd->get_traducible();
	$propiedades		= $RecordObj_dd->get_propiedades();
	$properties			= $RecordObj_dd->get_properties();
	#$usableIndex		= $RecordObj_dd->get_usableIndex();
	#$codNomenclator	= $RecordObj_dd->get_codNomenclator();
	#$type				= $RecordObj_dd->get_jerarquia_type();



# Consultamos si está relacionado
	$verificarTR	= count(RecordObj_dd_edit::get_ar_terminos_relacionados($terminoID));
	$hasRelation	= ($verificarTR >0)
		? 'si'
		: 'no';

# Hijos del término actual
	$hijosArray		= $RecordObj_dd->get_ar_childrens_of_this();
	$nHijos			= $RecordObj_dd->get_n_hijos();
	$ar_siblings	= $RecordObj_dd->get_ar_siblings_of_this();



# Array de padres
$ar_parents_of_this	= $RecordObj_dd->get_ar_parents_of_this();


	# DESCRIPTORS (matrix_tesauro) Data from current descriptor
		// $matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;

	$dedalo_version = explode(".", DEDALO_VERSION);
	if( (int)$dedalo_version[0]<=6 && (int)$dedalo_version[1]<3 ){
		$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, NULL, $tipo='termino');	#$matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false
		$id							= $RecordObj_descriptors_dd->get_ID();
	}else{
		$id							= null;
	}

		// $parent_desc				= $terminoID;
		// $lang						= $RecordObj_descriptors_dd->get_lang();
		// $mainLang					= $RecordObj_descriptors_dd->get_mainLang();
		// $langFull					= lang::get_name_from_code( $lang );

		// if(empty($id)) {
		// 	die( "Sorry: descriptors id ($id) not found for terminoID:<b>$terminoID</b>, lang:<b>$lang</b> <br> ");
		// }

	# TR DESCRIPTOR MAIN LANG AND DEF
		// $matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		// $RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='def');
		// $def			= $RecordObj->get_dato();
		// $def_id			= $RecordObj->get_ID();

		$mainLang		= DEDALO_STRUCTURE_LANG;
		$termino		= RecordObj_dd_edit::get_termino_by_tipo($terminoID, $mainLang);
		$lang			= $mainLang;
		$langFull		= lang::get_name_from_code( $lang );
		$ar_all_langs	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

	// dd_descriptors_grid html
		$file_include	= dirname(__FILE__) . '/html/dd_descriptors_grid.phtml';
		ob_start();		include ( $file_include );
		$descriptors_tr_html = ob_get_clean();

	# TR OBS MAIN LANG
		// $matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		// $RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='obs');
		// $obs			= $RecordObj->get_dato();
		// $obs_id			= $RecordObj->get_ID();

	// dd_descriptors_grid_obs html
		// $file_include	= dirname(__FILE__) . '/html/dd_descriptors_grid_obs.phtml';
		// ob_start();		include ( $file_include );
		// $descriptors_tr_obs_html = ob_get_clean();


$page_html = dirname(__FILE__) . '/html/dd_edit.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);

# Write session to unlock session file
session_write_close();








exit();
