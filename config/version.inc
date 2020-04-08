<?php

	# Version
	$DEDALO_VERSION = '6.0.0_alpha14';
	if(defined('DEVELOPMENT_SERVER') && DEVELOPMENT_SERVER===true) {
		$DEDALO_VERSION .= '.'.time();
	}
	define('DEDALO_VERSION'	, $DEDALO_VERSION);
	define('DEDALO_BUILD'	, '27-12-2019');
	define('DEDALO_MAJOR_VERSION', '6');
