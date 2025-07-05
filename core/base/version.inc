<?php

	// Version
	$DEDALO_VERSION = '6.6.3';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-07-05T09:54:56+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
