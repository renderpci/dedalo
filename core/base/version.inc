<?php

	# Version
	$DEDALO_VERSION = '6.1.3';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-03-25T09:14:59+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
