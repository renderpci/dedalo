<?php
/**
 * SAML settings and toolkit paths
 *
 * Store your saml settings and certificates in a safe place outside public folders
 */


// Dédalo root. Normally at '../httpdocs/dedalo'
	define('DEDALO_ROOT',    dirname(dirname(dirname(dirname(dirname(__FILE__))))));


// SAML settings file path. Customize for your instalation. Normally out of httpdocs dir
    define('SAML_SETTINGS_PATH', dirname(dirname(DEDALO_ROOT)) . '/private/private_v5/saml_settings.inc');


// SAML TOOLKIT_PATH
    define("TOOLKIT_PATH", 	DEDALO_ROOT . '/vendor/onelogin/php-saml/');


// (!) robrichards xmlseclibs library autoload error fix
	require_once DEDALO_ROOT . '/vendor/robrichards/xmlseclibs/xmlseclibs.php';


// Remove deprecated errors
    #error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);