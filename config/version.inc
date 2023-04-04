<?php

	# Version
	$DEDALO_VERSION = '6.0.0_RC2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-04-04T18:16:37+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
