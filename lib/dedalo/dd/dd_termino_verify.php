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


require_once(DEDALO_LIB_BASE_PATH . '/dd/class.dd.php');

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');


$termino	= trim(safe_xss($_REQUEST['termino']));
$terminoID	= safe_xss($_REQUEST['terminoID']);
$tabla		= safe_xss($_REQUEST['tabla']);

if( strlen($termino)>2 ) {
	
	$dd 	= new dd($modo='tesauro_list');
	echo 	$dd->existeEsteTermino($termino,$terminoID);
}
die();