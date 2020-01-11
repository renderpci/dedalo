<?php
// dedalo config include
	$config_path = dirname(dirname(dirname(__FILE__))).'/config/config.php';
	if( !include($config_path) ) {
		die("Dédalo is misconfigured. Please review your app config");
	}

// controller
	include( dirname(__FILE__) .'/unit_test.php' );
