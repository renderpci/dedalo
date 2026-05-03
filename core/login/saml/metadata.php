<?php
// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
 * SAML Metadata view
 *
 * Your IdP will usually want your metadata, you can use this code to generate it once,
 * or expose it on a URL so your IdP can check it periodically.
*/

// debug
	error_log(" SAML metadata... ");

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
		// SEC-079: do not echo the raw library exception to the public
		// metadata endpoint — it leaks internal settings paths and enables
		// OAISIS-level enumeration of the SAML configuration. Log server-side
		// and respond with a generic 500.
		error_log(' SAML metadata error: ' . $e->getMessage());
		http_response_code(500);
		header('Content-Type: text/plain; charset=utf-8');
		echo 'Error generating SP metadata';
	}
