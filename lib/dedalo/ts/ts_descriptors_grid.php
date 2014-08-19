<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/lang_translate/class.LangTranslate.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');


# set vars
$vars = array('mode','id','terminoID');
foreach($vars as $name)	$$name = setVar($name);


# TRANSLATIONS TR AJAX TRIGGER
if($mode=='loadDescriptorsGrid') {

	if(!$id || empty($terminoID)) exit(" Error: Need more vars id:$id, terminoID:$terminoID (ts_descriptors_grid) ");

	$matrix_table				= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj_descriptors		= new RecordObj_descriptors($matrix_table, $id);				#dump($id);die();
	$ar_transtations_of_current = $RecordObj_descriptors->get_ar_translations_of_current();		#dump($ar_transtations_of_current,'ar_transtations_of_current '.$id); #die();

	if(empty($ar_transtations_of_current)) die();



	if(count($ar_transtations_of_current)<1) {
		# Nothing to do
		die();

	}else{

		#$ar_all_langs 	= common::get_ar_all_langs(false);
			#dump($ar_all_langs,'ar_all_langs');

		# Iterate all traductions
		foreach($ar_transtations_of_current as $id => $current_lang) {

				#dump($id,'id terminoID:'.$terminoID);					

			# TERMINO : Data from current descriptor
			$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
			$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $id);
			$termino 				= $RecordObj_descriptors->get_dato();		#dump($termino,'termino');
			$parent_desc			= $RecordObj_descriptors->get_parent();		
			$lang 					= $RecordObj_descriptors->get_lang();
			$mainLang 				= $RecordObj_descriptors->get_mainLang();	#dump($id,"mainLang");		
			$langFull 				= RecordObj_ts::get_termino_by_tipo($lang);


			# DEF : Data from def	
			$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
			$RecordObj				= new RecordObj_descriptors($matrix_table, NULL, $parent_desc, $lang, $tipo='def');	
			$def 					= $RecordObj->get_dato();
			$def_id 				= $RecordObj->get_ID();		#dump($RecordObj);			
			
			require(DEDALO_LIB_BASE_PATH . '/ts/html/ts_descriptors_grid.phtml');	
		 }
	}
	exit();
}



?>