<?php 
// dedalo config include
	$config4_path = dirname(dirname(__FILE__)).'/config/config4.php';
	if( !include($config4_path) ) {
		die("Dédalo is misconfigured. Please review your app config");
	}

// controller
	include( dirname(__FILE__) .'/page.php' );