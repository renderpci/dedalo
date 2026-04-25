<?php

	// Version
	$DEDALO_VERSION = '6.8.9';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2026-04-25T13:00:24+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
