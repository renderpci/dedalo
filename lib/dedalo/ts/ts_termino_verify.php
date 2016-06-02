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

require_once(DEDALO_LIB_BASE_PATH . '/ts/class.Tesauro.php');

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');


$termino	= trim($_REQUEST['termino']);
$terminoID	= $_REQUEST['terminoID'];
$tabla		= $_REQUEST['tabla'];

if( strlen($termino)>2 ) {
	
	$ts 	= new Tesauro($modo='tesauro_list');
	echo 	$ts->existeEsteTermino($termino,$terminoID);
}
die();
?>