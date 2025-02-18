<?php

	// Version
	$DEDALO_VERSION = '6.4.2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-02-18T10:42:36+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
