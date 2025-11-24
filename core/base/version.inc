<?php

	// Version
	$DEDALO_VERSION = '6.8.2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-11-24T09:25:45+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
