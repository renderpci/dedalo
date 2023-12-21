<?php

	# Version
	$DEDALO_VERSION = '6.0.6';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-12-21T21:24:44+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
