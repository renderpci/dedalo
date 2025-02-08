<?php

	// Version
	$DEDALO_VERSION = '6.4.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '22025-02-08T14:00:56+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
