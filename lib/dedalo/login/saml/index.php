<?php
/**
 * SAMPLE Code to demonstrate how to initiate a SAML Authorization request
 *
 * When the user visits this URL, the browser will be redirected to the SSO
 * IdP with an authorization request. If successful, it will then be
 * redirected to the consume URL (specified in settings) with the auth
 * details.
 */

// Session
	session_start();

// Require files
	require_once( dirname(__FILE__) . '/saml_config.php' );
	require_once( SAML_SETTINGS_PATH );
	require_once( TOOLKIT_PATH . '_toolkit_loader.php' );

// Login into idp
	$auth = new OneLogin_Saml2_Auth($saml_settings); // Constructor of the SP, loads settings.php
                                   					 // and advanced_settings.php

	// login method. Like $auth->login(null, array(), false, false, true);
		// $returnTo - url to change the workflow and redirect the user to the other PHP file
		// $parameters - An array of parameters that will be added to the GET in the HTTP-Redirect.
		// $forceAuthn - When true the AuthNRequest will set the ForceAuthn='true'
		// $isPassive - When true the AuthNRequest will set the Ispassive='true'
		// $strict - True if we want to stay (returns the url string) False to redirect
		// $setNameIdPolicy - When true the AuthNRequest will set a nameIdPolicy element.
	$auth->login();   // Method that sent the AuthNRequest


/*
// User is logged 
	if (isset($_SESSION['samlUserdata'])) {

		if (!empty($_SESSION['samlUserdata'])) {

			// Temp show user info
				$attributes = $_SESSION['samlUserdata'];
				echo 'You have the following attributes:<br>';
				echo '<table><thead><th>Name</th><th>Values</th></thead><tbody>';
				foreach ($attributes as $attributeName => $attributeValues) {
					echo '<tr><td>' . htmlentities($attributeName) . '</td><td><ul>';
					foreach ($attributeValues as $attributeValue) {
						echo '<li>' . htmlentities($attributeValue) . '</li>';
					}
					echo '</ul></td></tr>';
				}
				echo '</tbody></table>';
				if (!empty($_SESSION['IdPSessionIndex'])) {
					echo '<p>The SessionIndex of the IdP is: '.$_SESSION['IdPSessionIndex'].'</p>';
				}

			  // Dédalo redirect to default url
				#header("Location: $url");
				#exit();

		} else {
			echo "<p>Sorry. You don't have any attribute</p>";
		}
		echo '<p><a href="slo.php">Logout</a></p>';

// User is NOT logged 
	}else{

		// settings. Load var $saml_settings from file inc (/private/saml_settings.inc)
			// new OneLogin_Saml2_Settings();			
			$settings = new OneLogin_Saml2_Settings($saml_settings);

		$authRequest = new OneLogin_Saml2_AuthnRequest($settings);
		$samlRequest = $authRequest->getRequest();
		$parameters = array('SAMLRequest' => $samlRequest);
		$parameters['RelayState'] = OneLogin_Saml2_Utils::getSelfURLNoQuery();
		$idpData = $settings->getIdPData();
		$ssoUrl = $idpData['singleSignOnService']['url'];
		$url = OneLogin_Saml2_Utils::redirect($ssoUrl, $parameters, true);
		header('Pragma: no-cache');
		header('Cache-Control: no-cache, must-revalidate');
		header("Location: $url");
		exit();
	}
*/

/*
// Require files
	require_once( dirname(__FILE__) . '/saml_config.php' );

// settings. Load var $saml_settings from file inc (/private/saml_settings.inc)
	require_once( SAML_SETTINGS_PATH );

// auth
	$auth = new OneLogin_Saml2_Auth($saml_settings); // Constructor of the SP, loads settings.php
													 // and advanced_settings.php
// Login
	$auth->login();   // Method that sent the AuthNRequest
*/

