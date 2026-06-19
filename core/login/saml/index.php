<?php declare(strict_types=1);
/**
 * SAML ENTRY POINT
 * SSO login initiator — the URL the Dédalo login form's "SAML" button targets.
 *
 * This script serves two distinct roles depending on whether the HTTP request
 * carries a POST body:
 *
 *  1. Default flow (GET, no POST body)
 *     The script bootstraps the OneLogin/php-saml SP library using the
 *     $saml_settings array supplied by config_saml.php, then calls
 *     OneLogin\Saml2\Auth::login() which builds a signed SAMLAuthnRequest XML
 *     blob, Base64-encodes it, and HTTP-redirects the browser to the Identity
 *     Provider's SSO URL.  After successful IdP authentication the browser is
 *     sent back to the Assertion Consumer Service at saml/acs.php with a
 *     signed SAMLResponse in $_POST.
 *
 *  2. Non-standard POST-back flow (POST body present — e.g. the "mpr" case)
 *     Some IdPs redirect back to this same URL (instead of the registered ACS
 *     endpoint) with the SAMLResponse in $_POST.  In that scenario control is
 *     delegated to a deployment-specific file at:
 *       <docroot>/../../../private/custom_saml_manager.php
 *     That file lives outside the web root and is expected to perform the full
 *     assertion-validation and Dédalo login sequence on its own.
 *
 * SAML flow overview (standard case):
 *   Browser ──GET──► saml/index.php
 *     ──302──► IdP SSO URL  (AuthnRequest via HTTP-Redirect binding)
 *       IdP authenticates user
 *     ──POST──► saml/acs.php  (SAMLResponse via HTTP-POST binding)
 *       acs.php validates response, calls login::Login_SAML(), sets session
 *     ──302──► Dédalo app root
 *
 * Dependencies (injected by config_saml.php):
 *   $saml_settings   — associative array consumed by OneLogin\Saml2\Auth
 *   $target_saml_url — IdP SSO URL string used only for diagnostic logging;
 *                      the OneLogin library reads it directly from $saml_settings
 *   get_client_ip()  — global helper; returns the remote IP for log context
 *
 * @package Dédalo
 * @subpackage Core
 */

// A. Login Initiator
// config include file
	include dirname(__FILE__, 5) . '/private/config_saml.php';

/**
 * SAML Authorization. Initiate a SAML Authorization request
 *
 * When the user visits this URL, the browser will be redirected to the SSO
 * IdP with an authorization request. If successful, it will then be
 * redirected to the consume URL (this page again in this case) with the auth
 * details.
 */

// Login into idp
	try {
		$client_ip = get_client_ip();
		error_log("[SAML index] Loading index... from IP: ".$client_ip);

		// handle_idp_response. If the request contains data into the POST, pass
		// the control to the custom_saml_manager file (mpr case)
		$handle_idp_response = !empty($_POST);

		if ($handle_idp_response) {

			// Receiving POST case
			error_log("[SAML index] Loading custom SAML manager to handle this POST request");
			// This is not standard situation where the IDP provider redirects to the same URL (this)
			// after successfully login (normally redirects to the 'acs.php' file).
			// custom_saml_manager file must place in private directory, outside httpdocs
			// like '/home/www/vhosts/mydomain.org/private/custom_saml_manager.php'
			include dirname(__FILE__, 6) . '/private/custom_saml_manager.php';

		}else{

			// Default case
			// (!) $target_saml_url comes from config_saml.php (via saml_settings.inc);
			// it is used here only for logging.  The authoritative IdP URL that the
			// OneLogin library actually uses is read from $saml_settings['idp']['singleSignOnService']['url'].
			$provider_url = $target_saml_url ?? ''; // '$target_saml_url' is defined in saml_settings.inc
			error_log("[SAML index] Starting Auth and redirecting to Identifier Provider ($provider_url)");

			// v3.0
			// Instantiate the SP; internally parses $saml_settings to build the
			// signing/encryption keys and IdP metadata.
			$auth = new OneLogin\Saml2\Auth( $saml_settings ); // Constructor of the SP, loads settings.php and private saml_settings

			// login method. Like $auth->login(null, array(), false, false, true);
			// $returnTo - url to change the workflow and redirect the user to the other PHP file
			// $parameters - An array of parameters that will be added to the GET in the HTTP-Redirect.
			// $forceAuthn - When true the AuthNRequest will set the ForceAuthn='true'
			// $isPassive - When true the AuthNRequest will set the Ispassive='true'
			// $strict - True if we want to stay (returns the url string) False to redirect
			// $setNameIdPolicy - When true the AuthNRequest will set a nameIdPolicy element.
			// (!) This call issues a Location: header and exits; no code after this line runs
			//     in the default case.
			$auth->login();   // Redirects the user to the IdP's SSO URL
		}

	} catch (Exception $e) {
		// Surface a safe, generic error to the browser and write the detail to
		// the server log.  Raw OneLogin exception messages are not forwarded to
		// avoid leaking SP key paths or configuration details.
		error_log( "[SAML index] Caught exception: ".$e->getMessage() );
		echo 'An server error occurred';
	}
