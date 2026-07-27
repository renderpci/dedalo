<?php

	// Version
	$DEDALO_VERSION = '7.0.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);

	define('DEDALO_BUILD'	, '2026-03-14T13:52:19+02:00');
	define('DEDALO_MAJOR_VERSION', '7');

