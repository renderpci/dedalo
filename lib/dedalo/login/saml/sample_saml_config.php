<?php
// Dédalo config file (needed for SAML_CONFIG constant values)
	require_once( dirname(dirname(dirname(__FILE__))) . '/config/config4.php' );

// Dédalo root
	if (!defined('DEDALO_ROOT')) {
		define('DEDALO_ROOT',    dirname(dirname(dirname(dirname(dirname(__FILE__))))));
	}

// SAML settings file path
	define('SAML_SETTINGS_PATH', dirname(dirname(DEDALO_ROOT)) . '/private/saml_settings.inc');


// SAML TOOLKIT_PATH
	define("TOOLKIT_PATH", DEDALO_ROOT . '/vendor/onelogin/php-saml/');

	require_once DEDALO_ROOT . '/vendor/robrichards/xmlseclibs/xmlseclibs.php';

// Remove deprecated errors
	// error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);