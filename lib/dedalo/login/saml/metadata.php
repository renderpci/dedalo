<?php
/**
 * SAMPLE Code to demonstrate how to handle a SAML assertion response.
 *
 * Your IdP will usually want your metadata, you can use this code to generate it once,
 * or expose it on a URL so your IdP can check it periodically.
 
require_once( dirname(__FILE__) . '/saml_config.php' );
header('Content-Type: text/xml');
#$samlSettings = new OneLogin_Saml2_Settings();
require_once( SAML_SETTINGS_PATH );
$samlSettings = new OneLogin_Saml2_Settings($saml_settings);
$sp = $samlSettings->getSPData();
$samlMetadata = OneLogin_Saml2_Metadata::builder($sp);
echo $samlMetadata;
*/
 
/**
 *  SAML Metadata view
 */
// Require files
	require_once( dirname(__FILE__) . '/saml_config.php' );
	require_once( SAML_SETTINGS_PATH );
	require_once( TOOLKIT_PATH . '_toolkit_loader.php' );

try {
	// Real scenario
		#$auth = new OneLogin_Saml2_Auth($saml_settings);
		#$settings = $auth->getSettings();
	// Now we only validate SP settings
		$settings = new OneLogin_Saml2_Settings($saml_settings, true); // true will avoid the IdP Settings validation
		$metadata = $settings->getSPMetadata();

	$errors = $settings->validateMetadata($metadata);
	if (empty($errors)) {
		header('Content-Type: text/xml');
		echo $metadata;
	} else {
		throw new OneLogin_Saml2_Error(
			'Invalid SP metadata: '.implode(', ', $errors),
			OneLogin_Saml2_Error::METADATA_SP_INVALID
		);
	}
} catch (Exception $e) {
	echo $e->getMessage();
}


