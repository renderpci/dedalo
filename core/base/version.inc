<?php

	// Version
	$DEDALO_VERSION = '6.8.10';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2026-05-05T19:58:16+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
