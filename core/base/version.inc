<?php

	// Version
	$DEDALO_VERSION = '6.2.9';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-12-04T10:29:27+01:000');
	define('DEDALO_MAJOR_VERSION', '6');
