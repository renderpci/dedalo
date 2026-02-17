<?php

	// Version
	$DEDALO_VERSION = '6.8.7';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2026-02-17T10:52:44+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
