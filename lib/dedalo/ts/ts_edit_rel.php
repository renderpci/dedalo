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
require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');
require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php'); 


# set vars
$vars = array('terminoID','terminoID_to_link','terminoID_to_unlink','ts_lang','type','accion');
foreach($vars as $name)	$$name = setVar($name);

# Inicializamos la clase Tesauro
#$modo 		= 'tesauro_rel';
#$ts 		= new Tesauro($modo,$type,$ts_lang);

# LINK TS (ADD TERMINO RELACIONADO)
if($accion=='linkTS') {
		
	#$ts->insertTR($terminoID,$terminoID_to_link);
	if(!$terminoID || !$terminoID_to_link) exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_link: $terminoID_to_link");
		dump($terminoID_to_link, ' termin ++ '.to_string($terminoID));
	$RecordObj_ts = new RecordObj_ts($terminoID);	
	$RecordObj_ts->add_element_to_ar_terminos_relacionados($terminoID_to_link);	
	$RecordObj_ts->Save();
}


# DELETE
if($accion=='unlinkTS') {
		
	#$relID	= $_REQUEST["relID"];
	#$ts->deleteTR($relID);	
	
	if(!$terminoID || !$terminoID_to_unlink) exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_unlink: $terminoID_to_unlink");
	
	/*
	$RecordObj_ts	= new RecordObj_ts($terminoID);	
	$ar_relaciones	= $RecordObj_ts->get_relaciones();								#var_dump($ar_relaciones); die();
	
	# eliminamos del array el valor recibido
	$ar_final = NULL;
	if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {
		
		foreach($ar_values as $modeloID => $terminoID) {
			
			if($terminoID != $terminoID_to_unlink) $ar_final[] =  array($modeloID => $terminoID);	
		}			
	}
	
	# guardamos el resultado
	$RecordObj_ts->set_relaciones($ar_final);									#var_dump($ar_relaciones); die();
	$RecordObj_ts->Save();
	*/
	
	$RecordObj_ts	= new RecordObj_ts($terminoID);	
	$RecordObj_ts->remove_element_from_ar_terminos_relacionados($terminoID_to_unlink);
	$RecordObj_ts->Save();

}//end unlinkTS
	

# LIST
# Búsqueda de descriptores relacionados con el actual
$ar_terminos_relacionados 	= (array)RecordObj_ts::get_ar_terminos_relacionados($terminoID,$cache=false);
$n_terminos_relacionados	= count($ar_terminos_relacionados); 
$html = '';

$arTR = array();	
foreach($ar_terminos_relacionados as $terminoID) {	
	$arTR[$terminoID] = RecordObj_ts::get_termino_by_tipo($terminoID);
}

# ordenamos alfabéticamente el array obtenido
#asort($arTR['termino']);	


	
	
$page_html	= 'html/ts_edit_rel.phtml';	
include($page_html);
#return $page_html;

# Write session to unlock session file
session_write_close();

#exit();
?>