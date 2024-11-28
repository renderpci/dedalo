<?php

	// Version
	$DEDALO_VERSION = '6.3.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '22024-11-28T16:23:46+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
