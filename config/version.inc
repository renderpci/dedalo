<?php

	# Version
	$DEDALO_VERSION = '6.0.0_RC6';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-08-22T19:19:35+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
