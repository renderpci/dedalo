<?php

	// Version
	$DEDALO_VERSION = '6.6.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-05-29T19:51:55+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
