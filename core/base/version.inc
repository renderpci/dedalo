<?php

	// Version
	$DEDALO_VERSION = '6.7.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2025-07-26T15:00:49+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
