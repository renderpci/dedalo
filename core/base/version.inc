<?php

	// Version
	$DEDALO_VERSION = '6.4.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-02-26T12:27:41+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
