<?php

	# Version
	$DEDALO_VERSION = '6.1.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-03-29T17:40:31+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
