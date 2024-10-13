<?php
// ontology custom config file
require_once( dirname(__FILE__) .'/ontology_legacy_setup.php');



/**
* LOGIN
*/
$is_logged	= login::is_logged();

if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB;
	header("Location: $url");
	exit();
}


require_once(dirname(__FILE__) . '/class.dd.php');
require_once(dirname(__FILE__) . '/inc/funciones.php');


$termino	= trim(safe_xss($_REQUEST['termino']));
$terminoID	= safe_xss($_REQUEST['terminoID']);
$tabla		= safe_xss($_REQUEST['tabla']);

if( strlen($termino)>2 ) {

	$dd 	= new dd($modo='tesauro_list');
	echo 	$dd->existeEsteTermino($termino,$terminoID);
}
