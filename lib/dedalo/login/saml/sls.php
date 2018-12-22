<?php
/**
 * SAML Single Log Out request. Initiate a SAML Single Log Out request
 *
 * When the user visits this URL, the browser will be redirected to the SLO
 * IdP with an SLO request.
 */
session_start();

// Require files
	require_once( dirname(__FILE__) . '/saml_config.php' );
	require_once( SAML_SETTINGS_PATH );
	require_once( TOOLKIT_PATH . '_toolkit_loader.php' );

// v3.0
	$samlSettings = new OneLogin\Saml2\Settings($saml_settings);
	$idpData 	  = $samlSettings->getIdPData();
	if (isset($idpData['singleLogoutService']) && isset($idpData['singleLogoutService']['url'])) {
	    $sloUrl = $idpData['singleLogoutService']['url'];
	} else {
	    throw new Exception("The IdP does not support Single Log Out");
	}
	if (isset($_SESSION['IdPSessionIndex']) && !empty($_SESSION['IdPSessionIndex'])) {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings, null, $_SESSION['IdPSessionIndex']);
	} else {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings);
	}
	$samlRequest = $logoutRequest->getRequest();
	$parameters = array('SAMLRequest' => $samlRequest);
	$url = OneLogin\Saml2\Utils::redirect($sloUrl, $parameters, true);
	header('Pragma: no-cache');
	header('Cache-Control: no-cache, must-revalidate');
	header("Location: $url");
	exit();

// v2.14
	/*
	$samlSettings = new OneLogin_Saml2_Settings($saml_settings);
	$idpData 	  = $samlSettings->getIdPData();
	if (isset($idpData['singleLogoutService']) && isset($idpData['singleLogoutService']['url'])) {
	    $sloUrl = $idpData['singleLogoutService']['url'];
	} else {
	    throw new Exception("The IdP does not support Single Log Out");
	}
	if (isset($_SESSION['IdPSessionIndex']) && !empty($_SESSION['IdPSessionIndex'])) {
	    $logoutRequest = new OneLogin_Saml2_LogoutRequest($samlSettings, null, $_SESSION['IdPSessionIndex']);
	} else {
	    $logoutRequest = new OneLogin_Saml2_LogoutRequest($samlSettings);
	}
	$samlRequest = $logoutRequest->getRequest();
	$parameters = array('SAMLRequest' => $samlRequest);
	$url = OneLogin_Saml2_Utils::redirect($sloUrl, $parameters, true);
	header('Pragma: no-cache');
	header('Cache-Control: no-cache, must-revalidate');
	header("Location: $url");
	exit();
	*/

