<?php

	// Version
	$DEDALO_VERSION = '6.8.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-10-21T09:30:46+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
