<?php
// ontology custom config file
require_once( dirname(dirname(__FILE__)) .'/ontology_legacy_setup.php');



// login check
	$is_logged = login::is_logged();

	if($is_logged!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}
	$is_global_admin = security::is_global_admin(CURRENT_LOGGED_USED_ID);

	if($is_global_admin!==true) {
		$url =  DEDALO_ROOT_WEB;
		header("Location: $url");
		exit();
	}


// include html
	include( dirname(__FILE__).'/html/request_conf_editor.phtml' );
