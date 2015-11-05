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
$security 	 = new security();
$permissions = (int)$security->get_security_permissions(DEDALO_TESAURO_TIPO);
if ($permissions<1) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}


$field_id = $_REQUEST['id'];
if (empty($field_id)) {
	die("Sorry. Few vars");
}


$page_html = dirname(__FILE__).'/html/ts_map.phtml';

# LOAD VISTA TEMPLATE CODE
require_once($page_html);
?>