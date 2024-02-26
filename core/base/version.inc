<?php

	# Version
	$DEDALO_VERSION = '6.1.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-02-26T19:17:39+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
