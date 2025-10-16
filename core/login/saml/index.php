<?php declare(strict_types=1);
/**
 * SAML ENTRY POINT
 * Acceded from Dédalo login form 'SAML' button
 * */

// A. Login Initiator
// config include file
	include dirname(__FILE__, 4) . '/config/config_saml.php';

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
			$provider_url = $target_saml_url ?? ''; // '$target_saml_url' is defined in saml_settings.inc
			error_log("[SAML index] Starting Auth and redirecting to Identifier Provider ($provider_url)");

			// v3.0
			$auth = new OneLogin\Saml2\Auth( $saml_settings ); // Constructor of the SP, loads settings.php and private saml_settings

			// login method. Like $auth->login(null, array(), false, false, true);
			// $returnTo - url to change the workflow and redirect the user to the other PHP file
			// $parameters - An array of parameters that will be added to the GET in the HTTP-Redirect.
			// $forceAuthn - When true the AuthNRequest will set the ForceAuthn='true'
			// $isPassive - When true the AuthNRequest will set the Ispassive='true'
			// $strict - True if we want to stay (returns the url string) False to redirect
			// $setNameIdPolicy - When true the AuthNRequest will set a nameIdPolicy element.
			$auth->login();   // Redirects the user to the IdP's SSO URL
		}

	} catch (Exception $e) {
		error_log( "[SAML index] Caught exception: ".$e->getMessage() );
		echo 'An server error occurred';
	}
