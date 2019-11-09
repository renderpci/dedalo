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
$permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO, DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_dd.php');
require_once(DEDALO_LIB_BASE_PATH . '/dd/class.dd.php');
#require_once(DEDALO_ROOT . '/inc/funciones.php'); 



# set vars
$vars = array('terminoID','terminoID_to_link','terminoID_to_unlink','ts_lang','type','accion');
foreach($vars as $name)	$$name = common::setVar($name);





# LINK TS (ADD TERMINO RELACIONADO)
if($accion=='linkTS') {
		
	#$ts->insertTR($terminoID,$terminoID_to_link);
	if(!$terminoID || !$terminoID_to_link) exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_link: $terminoID_to_link");
	
	$RecordObj_dd	= new RecordObj_dd($terminoID); 
	
	$ar_relaciones	= $RecordObj_dd->get_relaciones();								#var_dump($ar_relaciones); die();
	
	function in_array_r($needle, $haystack, $strict = true) {
		if(is_array($haystack)) foreach ($haystack as $item) {
			if (($strict ? $item === $needle : $item == $needle) || (is_array($item) && in_array_r($needle, $item, $strict))) {
				return true;
			}
		}	
		return false;
	}
	
	# añadimos al array el nuevo valor
	if( !in_array_r($terminoID_to_link, $ar_relaciones) && $terminoID_to_link!=$terminoID ) {
		$RecordObj_dd2 		= new RecordObj_dd($terminoID_to_link);
		$modeloID 			= $RecordObj_dd2->get_modelo();
		$ar_relaciones[]	= array($modeloID => $terminoID_to_link);
		
		# guardamos el resultado
		$RecordObj_dd->set_relaciones($ar_relaciones);									#var_dump($ar_relaciones); die();
		$RecordObj_dd->Save();
	}
	
}


# DELETE
if($accion=='unlinkTS') {
		
	#$relID	= safe_xss($_REQUEST["relID"]);
	#$ts->deleteTR($relID);	
	
	if(!$terminoID || !$terminoID_to_unlink) exit("$accion Need more vars: terminoID: $terminoID, terminoID_to_unlink: $terminoID_to_unlink");
	
	/*
	$RecordObj_dd	= new RecordObj_dd($terminoID);	
	$ar_relaciones	= $RecordObj_dd->get_relaciones();
	
	# eliminamos del array el valor recibido
	$ar_final = NULL;
	if(is_array($ar_relaciones)) foreach($ar_relaciones as $key => $ar_values) {
		
		foreach($ar_values as $modeloID => $terminoID) {
			
			if($terminoID != $terminoID_to_unlink) $ar_final[] =  array($modeloID => $terminoID);	
		}			
	}
	
	# guardamos el resultado
	$RecordObj_dd->set_relaciones($ar_final);
	$RecordObj_dd->Save();
	*/
	
	$RecordObj_dd	= new RecordObj_dd($terminoID);	
	$RecordObj_dd->remove_element_from_ar_terminos_relacionados($terminoID_to_unlink);
	$RecordObj_dd->Save();
	
}
	

# LIST
# Búsqueda de descriptores relacionados con el actual
$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($terminoID,$cache=false);		#echo " n:".count($ar_terminos_relacionados)." <br>";print_r($ar_terminos_relacionados);die();
$n_terminos_relacionados	= count($ar_terminos_relacionados); 
$html = '';
	
if($n_terminos_relacionados > 0) {	
	
	$arTR = array();
	foreach($ar_terminos_relacionados as $ar_terminos) {
				
		if(is_array($ar_terminos)) foreach($ar_terminos as $terminoID) {
					
			$arTR['terminoID'][]= $terminoID ;
			$arTR['termino'][]	= RecordObj_dd::get_termino_by_tipo($terminoID) ;
		}
	}
	
	# ordenamos alfabéticamente el array obtenido
	asort($arTR['termino']);	
}	
	
	
$page_html	= 'html/dd_edit_rel.phtml';	
include($page_html);
#return $page_html;
#exit();
?>