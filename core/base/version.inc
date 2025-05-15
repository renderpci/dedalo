<?php

	// Version
	$DEDALO_VERSION = '6.5.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-05-15T13:42:50+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
