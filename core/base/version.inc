<?php

	// Version
	$DEDALO_VERSION = '6.2.8';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-10-08T11:43:23+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
