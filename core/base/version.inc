<?php

	// Version
	$DEDALO_VERSION = '6.2.8';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-10-13T11:22:26+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
