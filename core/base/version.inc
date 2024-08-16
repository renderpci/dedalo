<?php

	# Version
	$DEDALO_VERSION = '6.2.5';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev';
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-08-16T12:43:01+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
