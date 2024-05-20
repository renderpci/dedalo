<?php

	# Version
	$DEDALO_VERSION = '6.2.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-05-20T08:56:16+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
