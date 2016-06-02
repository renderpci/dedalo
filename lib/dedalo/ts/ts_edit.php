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
$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO,DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_ts.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_descriptors.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.navigator.php');
require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');
require_once(DEDALO_ROOT . '/lang_translate/class.LangTranslate.php');


$localizacion 	= $tesaurus_title ;
$localizacion2	= $editar_title  ;
$area			= 'tesauro'; verify_access_area($area);

# set vars
$vars = array('terminoID','frg','from');
foreach($vars as $name)	$$name = setVar($name);
$head	= setVar('head','no');

if(empty($terminoID))	exit(" <b> terminoID $no_definido_title </b>");

$terminoID = trim($terminoID);	


# ACTUALIZAR LA FICHA  #############################################
if( !empty($_POST["accion"]) ) {
	
	$html 		= false;	
	
	#$edicion 	= $ts->edit($terminoID);
	$accion		= 'editTS';
	$edicion 	= require_once(DEDALO_LIB_BASE_PATH . '/ts/trigger.Tesauro.php');
  
}#fin update


# Data from current jer (structure)
$RecordObj_ts	= new RecordObj_ts($terminoID);
$tld			= $RecordObj_ts->get_tld();
$parent			= $RecordObj_ts->get_parent();
$modelo			= $RecordObj_ts->get_modelo();	
$userID			= $RecordObj_ts->get_userID();
$esmodelo		= $RecordObj_ts->get_esmodelo();
$esdescriptor	= $RecordObj_ts->get_esdescriptor();
$visible		= $RecordObj_ts->get_visible();
$norden			= $RecordObj_ts->get_norden();
$usableIndex	= $RecordObj_ts->get_usableIndex();	
$codNomenclator	= $RecordObj_ts->get_codNomenclator();
$type			= $RecordObj_ts->get_jerarquia_type();
$traducible		= $RecordObj_ts->get_traducible();
$propiedades	= $RecordObj_ts->get_propiedades();
$tiempo			= $RecordObj_ts->get_tiempo();
$geolocalizacion			= $RecordObj_ts->get_geolocalizacion();


	
# Consultamos si está relacionado
$arTR = RecordObj_ts::get_ar_terminos_relacionados($terminoID);
	#dump($arTR, '$arTR ++ '.to_string());
$verificarTR = count($arTR); #$ts->verificarTR($terminoID);	
if($verificarTR >0){
	$hasRelation = 'si';
}else{
	$hasRelation = 'no';
}	

# Hijos del término actual
$hijosArray 	= $RecordObj_ts->get_ar_childrens_of_this();
$nHijos			= $RecordObj_ts->get_n_hijos();
$ar_siblings	= $RecordObj_ts->get_ar_siblings_of_this();


	


# Array de padres
$ar_parents_of_this	= $RecordObj_ts->get_ar_parents_of_this();			#dump($ar_parents_of_this); die();


	# DESCRIPTORS (matrix_tesauro)
	# Data from current descriptor
	$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, NULL, $tipo='termino');	#$matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false
	$termino 	= $RecordObj_descriptors->get_dato();	
	$id			= $RecordObj_descriptors->get_ID();
	$parent_desc= $terminoID;
	$lang 		= $RecordObj_descriptors->get_lang();
	$mainLang 	= $RecordObj_descriptors->get_mainLang();
	$langFull 	= RecordObj_ts::get_termino_by_tipo($lang);	 

	#var_dump($RecordObj_descriptors,'$RecordObj_descriptors');

	if(empty($id)) die( "Sorry: descriptors id ($id) not found for terminoID:<b>$terminoID</b>, lang:<b>$lang</b> <br> ");

	# TR DESCRIPTOR MAIN LANG AND DEF
	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='def');
	$def 			= $RecordObj->get_dato();
	$def_id 		= $RecordObj->get_ID();
	
	# Notes
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='notes');
	$notes 			= $RecordObj->get_dato();
	$notes_id 		= $RecordObj->get_ID();

	$ar_all_langs 	= common::get_ar_all_langs(true);

	$file_include		= DEDALO_LIB_BASE_PATH . '/ts/html/ts_descriptors_grid.phtml';
	ob_start();			include ( $file_include );
	$descriptors_tr_html= ob_get_clean();

	# TR OBS MAIN LANG
	$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($terminoID);
	$RecordObj		= new RecordObj_descriptors($matrix_table, NULL, $terminoID, $lang, $tipo='obs');		
	$obs 			= $RecordObj->get_dato();
	$obs_id 		= $RecordObj->get_ID();

	$file_include		= 'html/ts_descriptors_grid_obs.phtml';
	ob_start();			include ( $file_include );
	$descriptors_tr_obs_html= ob_get_clean();


$page_html = DEDALO_LIB_BASE_PATH . '/ts/html/ts_edit.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);


# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'LOAD EDIT',
		logger::INFO,
		DEDALO_TESAURO_TIPO,
		null,
		array(	"msg"			=> "Loaded ts edit",
				"terminoID"		=> $terminoID
				)
	);

exit();
?>