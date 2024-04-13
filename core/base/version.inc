<?php

	# Version
	$DEDALO_VERSION = '6.1.4';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.dev'; // .time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '2024-04-13T11:50:26+02:00');
	define('DEDALO_MAJOR_VERSION', '6');
