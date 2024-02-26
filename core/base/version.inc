<?php

	# Version
	$DEDALO_VERSION = '6.0.7';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-02-26T18:01:17+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
