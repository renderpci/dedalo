<?php

	# Version
	$DEDALO_VERSION = '6.0.0_RC7';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-08-30T13:08:59+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
