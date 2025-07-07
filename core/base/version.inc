<?php

	// Version
	$DEDALO_VERSION = '6.6.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-07-07T18:59:21+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
