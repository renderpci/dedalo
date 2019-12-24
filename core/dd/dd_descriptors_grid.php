<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# Old lang vars
require_once(DEDALO_CORE_PATH . '/dd/lang/lang_code.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();

if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}


#require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_CORE_PATH . '/db/class.RecordObj_descriptors_dd.php');


# set vars
$vars = array('mode','id','terminoID');
foreach($vars as $name)	$$name = common::setVar($name);


# TRANSLATIONS TR AJAX TRIGGER
if($mode==='loadDescriptorsGrid') {

	if(!$id || empty($terminoID)) exit(" Error: Need more vars id:$id, terminoID:$terminoID (ts_descriptors_grid) ");

	$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, $id);				#dump($id);die();
	$ar_transtations_of_current = $RecordObj_descriptors_dd->get_ar_translations_of_current();	#dump($ar_transtations_of_current,'ar_transtations_of_current '.$id); #die();

	if(empty($ar_transtations_of_current)) die();



	if(count($ar_transtations_of_current)<1) {
		# Nothing to do
		die();

	}else{

		# Iterate all traductions
		foreach($ar_transtations_of_current as $id => $current_lang) {

			# TERMINO : Data from current descriptor
			$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
			$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, $id);
			$termino 				= $RecordObj_descriptors_dd->get_dato();		#dump($termino,'termino');
			$parent_desc			= $RecordObj_descriptors_dd->get_parent();
			$lang 					= $RecordObj_descriptors_dd->get_lang();
			$mainLang 				= $RecordObj_descriptors_dd->get_mainLang();	#dump($id,"mainLang");
			$langFull 				= lang::get_name_from_code( $lang );


			# DEF : Data from def
			$matrix_table			= RecordObj_descriptors_dd::$descriptors_matrix_table;
			$RecordObj				= new RecordObj_descriptors_dd($matrix_table, NULL, $parent_desc, $lang, $tipo='def');
			$def 					= $RecordObj->get_dato();
			$def_id 				= $RecordObj->get_ID();		#dump($RecordObj);

			require(DEDALO_CORE_PATH . '/dd/html/dd_descriptors_grid.phtml');
		 }
	}

	# Write session to unlock session file
	session_write_close();

	exit();
}



?>
