<?php
require_once( dirname(dirname(__FILE__)) .'/config/config.php');
# Old lang vars
require_once(DEDALO_LIB_BASE_PATH . '/dd/lang/lang_code.php');

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}
$is_global_admin = component_security_administrator::is_global_admin( $_SESSION['dedalo4']['auth']['user_id'] );
if($is_global_admin!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors_dd.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require_once(DEDALO_LIB_BASE_PATH . '/dd/class.dd.php');
require_once(DEDALO_LIB_BASE_PATH . '/dd/d3_functions.php');



$localizacion 	= $tesaurus_title ;
$localizacion2	= $editar_title  ;
$area			= 'tesauro';

# set vars
$vars = array('terminoID','frg','from');
foreach($vars as $name)	$$name = common::setVar($name);
$head	= common::setVar('head','no');

if(empty($terminoID))	exit(" <b> terminoID $no_definido_title </b>");

$terminoID = trim($terminoID);	


#
#
# ACTUALIZAR LA FICHA  #############################################
if( !empty($_POST["accion"]) ) {	
	$html 		= '';
	$accion		= 'editTS';
	$edicion 	= require_once(DEDALO_LIB_BASE_PATH . '/dd/trigger.dd.php');  
}#fin update
# ACTUALIZAR LA FICHA  #############################################


# Data from current jer (structure)
$RecordObj_dd	= new RecordObj_dd($terminoID);
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
#$usableIndex	= $RecordObj_dd->get_usableIndex();	
#$codNomenclator= $RecordObj_dd->get_codNomenclator();
#$type			= $RecordObj_dd->get_jerarquia_type();



	
# Consultamos si está relacionado
$verificarTR = count(RecordObj_dd::get_ar_terminos_relacionados($terminoID)); #$ts->verificarTR($terminoID);	
if($verificarTR >0){
	$hasRelation = 'si';
}else{
	$hasRelation = 'no';
}	

# Hijos del término actual
$hijosArray 	= $RecordObj_dd->get_ar_childrens_of_this();
$nHijos			= $RecordObj_dd->get_n_hijos();
$ar_siblings	= $RecordObj_dd->get_ar_siblings_of_this();


	


# Array de padres
$ar_parents_of_this	= $RecordObj_dd->get_ar_parents_of_this();			#dump($ar_parents_of_this); die();


	# DESCRIPTORS (matrix_tesauro)
	# Data from current descriptor
	$matrix_table				= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, NULL, $tipo='termino');	#$matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false
	$termino 	= $RecordObj_descriptors_dd->get_dato();	
	$id			= $RecordObj_descriptors_dd->get_ID();
	$parent_desc= $terminoID;
	$lang 		= $RecordObj_descriptors_dd->get_lang();
	$mainLang 	= $RecordObj_descriptors_dd->get_mainLang();
	$langFull	= lang::get_name_from_code( $lang ); 

	#var_dump($RecordObj_descriptors_dd,'$RecordObj_descriptors_dd');

	if(empty($id)) die( "Sorry: descriptors id ($id) not found for terminoID:<b>$terminoID</b>, lang:<b>$lang</b> <br> ");

	# TR DESCRIPTOR MAIN LANG AND DEF
	$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='def');	
	$def 			= $RecordObj->get_dato();
	$def_id 		= $RecordObj->get_ID();

	#$ar_all_langs 	= unserialize(DEDALO_APPLICATION_LANGS);
	$ar_all_langs 	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);

	$file_include		= DEDALO_LIB_BASE_PATH . '/dd/html/dd_descriptors_grid.phtml';
	ob_start();			include ( $file_include );
	$descriptors_tr_html= ob_get_clean();

	# TR OBS MAIN LANG
	$matrix_table	= RecordObj_descriptors_dd::$descriptors_matrix_table;
	$RecordObj		= new RecordObj_descriptors_dd($matrix_table, NULL, $terminoID, $lang, $tipo='obs');		
	$obs 			= $RecordObj->get_dato();
	$obs_id 		= $RecordObj->get_ID();

	$file_include		= 'html/dd_descriptors_grid_obs.phtml';
	ob_start();			include ( $file_include );
	$descriptors_tr_obs_html= ob_get_clean();


$page_html = DEDALO_LIB_BASE_PATH . '/dd/html/dd_edit.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);

# Write session to unlock session file
session_write_close();




exit();