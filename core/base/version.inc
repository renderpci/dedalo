<?php

	// Version
	$DEDALO_VERSION = '6.8.8';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2026-03-09T13:37:05+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
