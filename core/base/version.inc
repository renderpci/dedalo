<?php

	// Version
	$DEDALO_VERSION = '6.5.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-04-15T22:27:09+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
