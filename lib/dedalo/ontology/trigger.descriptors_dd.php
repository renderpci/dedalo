<?php
// Turn off output buffering
	ini_set('output_buffering', 'off');

// ontology custon config file
require_once( dirname(__FILE__) .'/config/config_ontology.php' );
// Old lang vars
require_once( dirname(__FILE__) . '/lang/lang_code.php' );



// login check
	$is_logged			= login::is_logged();
	$is_global_admin	= security::is_global_admin(CURRENT_LOGGED_USED_ID);
	if($is_logged!==true || $is_global_admin!==true) {
		$url =  DEDALO_ROOT_WEB ."/main/";
		header("Location: $url");
		exit();
	}


// other files to include
	// require_once(DEDALO_ROOT .'/inc/funciones.php');
	// require_once(DEDALO_ROOT .'/lang_translate/class.LangTranslate.php');
	// require_once(DEDALO_CORE_PATH . '/common/class.navigator.php');
	// require_once(DEDALO_CORE_PATH . '/db/class.RecordObj_descriptors_dd.php');



// set vars
	$vars = [
		'mode',
		'id',
		'terminoID',
		'terminoID_lang',
		'termino',
		'parent',
		'lang',
		'tipo',
		'dato'
	];
	foreach($vars as $name)	$$name = common::setVar($name);



/**
* LOADDESCRIPTORSGRID
* Translations tr ajax trigger
*/
if($mode==='loadDescriptorsGrid') {

	# Write session to unlock session file
	session_write_close();

	if(!$id || empty($terminoID)) {
		exit(" Error: Need more vars id:$id, terminoID:$terminoID (ts_descriptors_grid) ");
	}

	$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, $id);
	$ar_transtations_of_current	= $RecordObj_descriptors_dd->get_ar_translations_of_current();

	if(empty($ar_transtations_of_current) || count($ar_transtations_of_current)<1) {
		exit(); # Nothing to do
	}

	# Iterate all traductions
	foreach($ar_transtations_of_current as $current_id => $current_lang) {

		# TERMINO : Data from current descriptor
		$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, $current_id);
		$termino					= $RecordObj_descriptors_dd->get_dato();
		$parent_desc				= $RecordObj_descriptors_dd->get_parent();
		$lang						= $RecordObj_descriptors_dd->get_lang();
		$mainLang					= $RecordObj_descriptors_dd->get_mainLang();
		$langFull					= lang::get_name_from_code( $lang );


		# DEF : Data from def
		$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $parent_desc, $lang, $tipo='def');
		$def			= $RecordObj->get_dato();
		$def_id			= $RecordObj->get_ID();

		include dirname(__FILE__) . '/html/dd_descriptors_grid.phtml';
	 }


	exit();
}//end if($mode==='loadDescriptorsGrid')



# REMOVEDESCRIPTOR
if($mode==='removeDescriptor') {

	if(!$id || !$terminoID) die("Need more data! id:$id - terminoID:$terminoID ");

	$html = '';

	$matrix_table 	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, $id);
	$parent			= $RecordObj->get_parent();
	$termino		= $RecordObj->get_dato();
	$lang			= $RecordObj->get_lang();

	$RecordObj->MarkForDeletion();

	# Borramos sus datos accesorios (def)
	$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $parent, $lang, $tipo='def');
	$RecordObj->MarkForDeletion();

	# Borramos sus datos accesorios (obs)
	$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $parent, $lang, $tipo='obs');
	$RecordObj->MarkForDeletion();

	exit($html);
}//end removeDescriptor



# NEWDESCRIPTOR
if($mode=='newDescriptor') {

	if(!$terminoID_lang || !$terminoID) die(" Error. Need more data! terminoID_lang:$terminoID_lang ,terminoID:$terminoID ");

	# Verificamos si ya existe un descriptor con este perfil
	$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $parent=$terminoID, $lang=$terminoID_lang, $tipo='termino');
	$id				= $RecordObj->get_ID();
		#dump($id,'id 1 exists');

	if(empty($id)) {

		$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL);
		$RecordObj->set_parent($terminoID);
		$RecordObj->set_tipo('termino');
		$RecordObj->set_lang($terminoID_lang);
		$RecordObj->Save();

		$id			= $RecordObj->get_ID();
			#dump($id,'id 2 created');
	}
	#$html = "lang:$lang - tld:$tld - terminoID:$terminoID - id:$id" ;#$html = var_dump($RecordObj);

	session_write_close();

	$html = $id;
	exit($html);
}//end newDescriptor



# SAVE DESCRIPTOR - (!) moved to trigger.dd
	// if($mode=='saveDescriptor') {

	// 	// session_write_close();

	// 	if(empty($terminoID)) die(" Error. Need more data! terminoID:$terminoID ");

	// 	// decode stringified dato
	// 		$dato = json_decode($dato);

	// 	if ($tipo==='obs') {

	// 		// (!) disabled. Now save descriptors data is indirect:
	// 		// First data is saved in regular section ontology, and then data is propagated to descriptors_dd from section->post_save_processes
	// 			$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	// 			$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $parent, $lang, $tipo);
	// 			$RecordObj->set_dato($dato);
	// 			$RecordObj->Save();

	// 		$response = null;

	// 	}else{

	// 		// sync Dédalo ontology records
	// 			$result = ontology::edit_term((object)[
	// 				'term_id'	=> $parent,
	// 				'dato'		=> $dato,
	// 				'dato_tipo'	=> $tipo,
	// 				'lang'		=> $lang
	// 			]);

	// 		$response = ($result===false)
	// 			? 'Error on save descriptor ' . json_encode($result)
	// 			: null;
	// 	}


	// 	echo $response;
	// 	exit();
	// }//end saveDescriptor



# EXPORT_ONTOLOGY
if($mode==='export_ontology') {

	// session_write_close();

	if(empty($terminoID)) die(" Error. Need more data! terminoID:$terminoID ");

	// include(dirname(__FILE__) . '/class.ontology.php');

	$response = ontology::export($terminoID);

	echo json_encode($response, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
	exit();
}//end export_ontology



# CODIGOKEYUP
if($mode=='codigoKeyUp') {

	if(!$termino || !$terminoID) die("Need more data! terminoID:$terminoID , termino:$termino ");

	# DESACTIVO (¿Recuperar?)
	exit();
	/*
	$n = Descriptors::descriptorExists($termino,'termino');
	exit("$n");
	*/
}//end codigoKeyUp



# NETWORKTEST
if($mode=='networkTest') {

	exit(' networkTest ok! ');
}//end networkTest


