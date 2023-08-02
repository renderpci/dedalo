<?php

	# Version
	$DEDALO_VERSION = '6.0.0_RC5';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2023-08-02T18:30:49+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
