<?php

	// Version
	$DEDALO_VERSION = '6.3.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-12-14T12:21:30+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
