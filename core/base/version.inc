<?php

	// Version
	$DEDALO_VERSION = '6.8.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-11-12T16:06:43+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
