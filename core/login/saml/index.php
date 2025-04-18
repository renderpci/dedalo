<?php
// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
 * SAML Authorization. Initiate a SAML Authorization request
 *
 * When the user visits this URL, the browser will be redirected to the SSO
 * IdP with an authorization request. If successful, it will then be
 * redirected to the consume URL (specified in settings) with the auth
 * details.
 */

// Login into idp

	// debug
		try {
			$client_ip = get_client_ip();
			$ip = print_r($client_ip, true);
			error_log(" SAML index... ".$ip);
		} catch (Exception $e) {
			error_log( "Caught exception: ".$e->getMessage() );
		}

	// v3.0
		$auth = new OneLogin\Saml2\Auth( $saml_settings ); // Constructor of the SP, loads settings.php and private saml_settings

	// login method. Like $auth->login(null, array(), false, false, true);
		// $returnTo - url to change the workflow and redirect the user to the other PHP file
		// $parameters - An array of parameters that will be added to the GET in the HTTP-Redirect.
		// $forceAuthn - When true the AuthNRequest will set the ForceAuthn='true'
		// $isPassive - When true the AuthNRequest will set the Ispassive='true'
		// $strict - True if we want to stay (returns the url string) False to redirect
		// $setNameIdPolicy - When true the AuthNRequest will set a nameIdPolicy element.
		$auth->login();   // Method that sent the AuthNRequest
