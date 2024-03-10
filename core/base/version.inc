<?php

	# Version
	$DEDALO_VERSION = '6.1.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-03-10T21:29:36+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
