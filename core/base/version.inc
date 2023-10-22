<?php

	# Version
	$DEDALO_VERSION = '6.0.1';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-10-22T18:36:28+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
