<?php

	# Version
	$DEDALO_VERSION = '6.2.0';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-05-02T19:31:10+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
