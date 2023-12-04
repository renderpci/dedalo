<?php

	# Version
	$DEDALO_VERSION = '6.0.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-12-04T18:00:10+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
