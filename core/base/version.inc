<?php

	# Version
	$DEDALO_VERSION = '6.0.6';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '22024-01-08T12:49:39+01:00');
	define('DEDALO_MAJOR_VERSION', '6');
