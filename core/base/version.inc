<?php

	// Version
	$DEDALO_VERSION = '6.5.2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-05-22T10:16:57+02:000');
	define('DEDALO_MAJOR_VERSION', '6');
