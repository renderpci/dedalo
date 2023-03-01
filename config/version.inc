<?php

	# Version
	$DEDALO_VERSION = '6.0.0_RC2';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.'.time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '02-03-2023');
	define('DEDALO_MAJOR_VERSION', '6');
