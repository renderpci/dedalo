<?php

	# Version
	$DEDALO_VERSION = '6.2.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-08-03T13:19:03+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
