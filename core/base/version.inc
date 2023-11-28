<?php

	# Version
	$DEDALO_VERSION = '6.0.3';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-11-28T11:21:24+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
