<?php
/**
 * SAML Metadata view
 *
 * Your IdP will usually want your metadata, you can use this code to generate it once,
 * or expose it on a URL so your IdP can check it periodically.
*/

// Require files
	require_once( dirname(__FILE__) . '/saml_config.php' );
	require_once( SAML_SETTINGS_PATH );
	require_once( TOOLKIT_PATH . '_toolkit_loader.php' );

// v3.0 
	try {
		// Real scenario
			#$auth = new OneLogin\Saml2\Auth($saml_settings);
			#$settings = $auth->getSettings();
		// Now we only validate SP settings
			$settings = new OneLogin\Saml2\Settings($saml_settings, true); // true will avoid the IdP Settings validation
			$metadata = $settings->getSPMetadata();

		$errors = $settings->validateMetadata($metadata);
		if (empty($errors)) {
			header('Content-Type: text/xml');
			echo $metadata;
		} else {
			throw new OneLogin\Saml2\Error(
				'Invalid SP metadata: '.implode(', ', $errors),
				OneLogin\Saml2\Error::METADATA_SP_INVALID
			);
		}
	} catch (Exception $e) {
		echo $e->getMessage();
	}

// v2.14 
	/*
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
	*/

