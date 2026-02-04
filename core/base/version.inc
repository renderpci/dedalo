<?php

	// Version
	$DEDALO_VERSION = '6.8.6';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2026-02-04T11:26:10+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
