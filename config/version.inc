<?php

	# Version
	$DEDALO_VERSION = '6.0.0_beta2a';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.'.time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '27-08-2020');
	define('DEDALO_MAJOR_VERSION', '6');
