<?php

	# Version
	$DEDALO_VERSION = '6.2.2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-06-03T08:13:52+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
