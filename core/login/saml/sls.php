<?php
// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
 * SAML Single Log Out request. Initiate a SAML Single Log Out request
 *
 * When the user visits this URL, the browser will be redirected to the SLO
 * IdP with an SLO request.
 */

// debug
	error_log(" SAML sls... ");

// session
	if(session_status()!==PHP_SESSION_ACTIVE) {
		session_start();
	}

// v3.0
	// samlSettings build
	$samlSettings = new OneLogin\Saml2\Settings($saml_settings);

	// idpData
	$idpData = $samlSettings->getIdPData();
	if (isset($idpData['singleLogoutService']) && isset($idpData['singleLogoutService']['url'])) {
	    $sloUrl = $idpData['singleLogoutService']['url'];
	} else {
	    throw new Exception("The IdP does not support Single Log Out");
	}

	// logoutRequest
	if (isset($_SESSION['IdPSessionIndex']) && !empty($_SESSION['IdPSessionIndex'])) {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings, null, $_SESSION['IdPSessionIndex']);
	} else {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings);
	}

	// re-direction
	$samlRequest	= $logoutRequest->getRequest();
	$parameters		= array('SAMLRequest' => $samlRequest);
	$url			= OneLogin\Saml2\Utils::redirect($sloUrl, $parameters, true);

	// headers
	header('Pragma: no-cache');
	header('Cache-Control: no-cache, must-revalidate');
	header("Location: $url");

	exit();
