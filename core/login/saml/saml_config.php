<?php
/**
 * SAML settings and toolkit paths
 *
 * Store your saml settings and certificates in a safe place outside public folders
 */

// Dédalo root
	if (!defined('DEDALO_ROOT_PATH')) {
		define('DEDALO_ROOT_PATH',    dirname(dirname(dirname(dirname(dirname(__FILE__))))));
	}
// SAML settings file path
    define('SAML_SETTINGS_PATH', dirname(DEDALO_ROOT_PATH) . '/private/saml_settings.inc');
// SAML TOOLKIT_PATH
    define("TOOLKIT_PATH", DEDALO_ROOT_PATH . '/vendor/onelogin/php-saml/');

// Remove deprecated errors
    #error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);