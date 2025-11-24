<?php

	// Version
	$DEDALO_VERSION = '6.8.3';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-11-24T10:16:44+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
