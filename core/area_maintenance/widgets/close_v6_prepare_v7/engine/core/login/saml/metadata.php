<?php
// config include file
// Load the $saml_settings array from the deployment-specific SAML configuration.
// The file also defines any SAML-related constants consumed by the OneLogin library.
// Path walks four levels up from this file's directory to reach the shared config/.
	include dirname(__FILE__, 5) . '/private/config_saml.php';

/**
* METADATA.PHP — SAML Service Provider (SP) Metadata endpoint
*
* Generates and serves the XML metadata document that describes this Dédalo
* installation as a SAML 2.0 Service Provider.  Identity Providers (IdPs)
* require this document — either as a one-time manual import or via a live
* URL they poll periodically — in order to establish trust with the SP:
* they read the SP's Entity ID, ACS URL, certificate, and NameID format
* from this file before accepting signed SAMLResponses from the SP.
*
* Execution flow:
*  1. Bootstrap OneLogin\Saml2\Settings in SP-only validation mode (second
*     argument `true` skips IdP-settings validation), so the endpoint works
*     even when the IdP section of $saml_settings is empty or incomplete.
*  2. Generate the SP metadata XML via getSPMetadata().
*  3. Validate the generated XML via validateMetadata(); surface errors as a
*     OneLogin\Saml2\Error::METADATA_SP_INVALID exception rather than serving
*     malformed XML to the IdP.
*  4. Serve the valid XML with Content-Type: text/xml, or emit a safe 500
*     response (SEC-079) without reflecting OneLogin exception detail.
*
* Security notes:
*  - SEC-079: raw OneLogin exception messages are never echoed to the HTTP
*    response; they contain internal file-system paths and configuration keys
*    that would aid enumeration.  Errors are written to the server error log
*    and a generic 500 text/plain body is returned instead.
*
* Related files:
*  - core/login/saml/index.php   — SP-initiated login; redirects user to IdP.
*  - core/login/saml/acs.php     — Assertion Consumer Service; validates the
*                                   IdP POST response and creates the Dédalo session.
*  - core/login/saml/sls.php     — Single Logout Service handler.
*  - config/config_saml.php      — Provides $saml_settings consumed here.
*
* @package Dédalo
* @subpackage Core
*/

// debug
	error_log(" SAML metadata... ");

// v3.0
	try {
		// Real scenario
		// (!) The two lines below illustrate the full Auth-object path that would
		//     also validate IdP settings; they are commented out intentionally so
		//     that the metadata endpoint works even when IdP credentials are not yet
		//     configured.  Do not remove — they serve as a reminder of the alternative.
			#$auth = new OneLogin\Saml2\Auth($saml_settings);
			#$settings = $auth->getSettings();
		// Now we only validate SP settings
		// Passing `true` as the second argument activates SP-only validation mode:
		// the OneLogin library skips all checks that require IdP metadata
		// (certificate, SSO URL, entity ID), so this endpoint remains functional
		// during initial IdP setup or certificate rotation.
			$settings = new OneLogin\Saml2\Settings($saml_settings, true); // true will avoid the IdP Settings validation
			$metadata = $settings->getSPMetadata();

		// validateMetadata
		// Confirm the generated XML is structurally valid SAML 2.0 metadata
		// before serving it.  validateMetadata() checks required elements
		// (EntityDescriptor, SPSSODescriptor, ACS binding, NameIDFormat, etc.)
		// and returns an array of human-readable error strings when violated.
		$errors = $settings->validateMetadata($metadata);
		if (empty($errors)) {
			// Serve the well-formed SP metadata XML to the caller (typically the
			// IdP administrator's browser or an IdP that auto-discovers metadata).
			header('Content-Type: text/xml');
			echo $metadata;
		} else {
			// Promote validation errors into a typed OneLogin exception so the
			// catch block below handles them uniformly — the raw error list is
			// written to the server log and a generic 500 is returned to the client.
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
