<?php
require( DEDALO_CONFIG_PATH . '/config.php' );
/**
* Redirects to propper place based on config
*/
switch (true) {
    case (defined('SAML_CONFIG') && SAML_CONFIG['active']===true):
        // SAML is defined in config file and is active
        header("Location: " . SAML_CONFIG['url']); exit();
        break;
    
    default:
        // Default behavior go to main page
        header("Location: " . DEDALO_ROOT_WEB); exit();
        break;
}