<?php
// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
* SLS.PHP — SAML Single Logout Service initiator
*
* Entry point that starts an SP-initiated SAML Single Logout (SLO) flow.
* When the browser visits this URL the script builds a signed SAMLLogoutRequest
* XML blob, encodes it for the HTTP-Redirect binding, and issues a 302 redirect
* that sends the user's browser to the Identity Provider (IdP) SLO endpoint.
* The IdP then terminates the IdP-side session and optionally notifies other
* Service Providers that share the SSO session before redirecting the browser
* back to the SP (typically to a "you are logged out" page).
*
* Execution flow:
*  1. Include `config_saml.php` — loads the `$saml_settings` array, which
*     contains both SP and IdP metadata (keys, certificates, endpoints).
*  2. Start or resume the PHP session to read `$_SESSION['IdPSessionIndex']`,
*     a value set by acs.php after a successful SAML login that identifies the
*     IdP-side session to be terminated.
*  3. Instantiate OneLogin\Saml2\Settings from `$saml_settings` and read the
*     IdP's SLO endpoint URL.  If the IdP metadata does not advertise an SLO
*     endpoint an Exception is thrown — the IdP does not support SLO.
*  4. Build a LogoutRequest XML message, optionally embedding the session index
*     so the IdP can locate the exact federation session to kill.
*  5. Encode the request as a Base64/deflated SAMLRequest query parameter, build
*     the redirect URL via OneLogin\Saml2\Utils::redirect(), and send the browser
*     there with cache-control headers that prevent the redirect from being cached.
*
* Security notes:
*  - The SAMLRequest is signed by the SP private key (configured in $saml_settings)
*    so the IdP can verify the request's authenticity.
*  - Sending `$_SESSION['IdPSessionIndex']` lets the IdP terminate exactly the
*    right federation session; omitting it would leave ghost SSO sessions on the
*    IdP until they expire naturally.
*  - Cache-control headers (Pragma: no-cache, Cache-Control: no-cache, must-revalidate)
*    prevent proxies and browsers from caching the 302 redirect, which would
*    cause repeated SLO requests to be skipped on subsequent visits.
*
* Related files:
*  - core/login/saml/index.php    — SP-initiated login; redirects user to IdP SSO.
*  - core/login/saml/acs.php      — Assertion Consumer Service; validates SAMLResponse,
*                                   creates session, stores IdPSessionIndex.
*  - core/login/saml/metadata.php — Generates SP metadata XML for IdP registration.
*  - config/config_saml.php       — Loads $saml_settings with SP/IdP keys and endpoints.
*
* @package Dédalo
* @subpackage Core
*/

// debug
	error_log(" SAML sls... ");

// session
	// Resume the existing PHP session so $_SESSION['IdPSessionIndex'] is accessible.
	// A session started elsewhere (e.g. by the main app) is reused rather than
	// started a second time; starting over would create a new, empty session.
	if(session_status()!==PHP_SESSION_ACTIVE) {
		session_start();
	}

// v3.0
	// samlSettings build
	// Instantiate the SP settings object from the $saml_settings array loaded by
	// config_saml.php. Raises an exception on misconfiguration (e.g. missing
	// certificate, invalid key path).
	$samlSettings = new OneLogin\Saml2\Settings( $saml_settings );

	// idpData
	// Retrieve the IdP's metadata block from the parsed settings.
	// `$idpData['singleLogoutService']['url']` is the IdP's SLO endpoint registered
	// in the SP metadata (config_saml.php). If the IdP does not publish an SLO
	// endpoint it cannot participate in federated logout, so we fail fast with an
	// exception rather than silently falling back to a local-only logout.
	$idpData = $samlSettings->getIdPData();
	if (isset($idpData['singleLogoutService']) && isset($idpData['singleLogoutService']['url'])) {
	    $sloUrl = $idpData['singleLogoutService']['url'];
	} else {
	    throw new Exception("The IdP does not support Single Log Out");
	}

	// logoutRequest
	// Build the SAMLLogoutRequest XML.  Including the IdPSessionIndex (stored in
	// $_SESSION during the ACS response at login time) is strongly recommended by
	// the SAML 2.0 spec (SAMLProf §4.4.3.4): it lets the IdP pinpoint the exact
	// federation session to invalidate.  When the index is absent or empty (e.g.
	// the user's PHP session expired or the IdP did not send a SessionIndex in the
	// assertion) a generic LogoutRequest without a session index is sent, which
	// some IdPs will honour by terminating all sessions for the subject.
	if (isset($_SESSION['IdPSessionIndex']) && !empty($_SESSION['IdPSessionIndex'])) {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings, null, $_SESSION['IdPSessionIndex']);
	} else {
	    $logoutRequest = new OneLogin\Saml2\LogoutRequest($samlSettings);
	}

	// re-direction
	// Encode the LogoutRequest for the HTTP-Redirect binding.
	// getRequest() deflates and Base64-encodes the signed XML.
	// Utils::redirect() appends the SAMLRequest parameter to $sloUrl and, when the
	// third argument is true, returns the URL as a string instead of issuing the
	// redirect itself — we handle the Location header below so we can attach the
	// no-cache directives first.
	$samlRequest	= $logoutRequest->getRequest();
	$parameters		= array('SAMLRequest' => $samlRequest);
	$url			= OneLogin\Saml2\Utils::redirect($sloUrl, $parameters, true);

	// headers
	// (!) These no-cache directives must be sent before the Location header.
	// Without them, a proxy or browser could cache the 302, causing every
	// subsequent logout attempt (or back-button navigation) to replay the same
	// encoded SAMLRequest — which the IdP would legitimately reject as a replay.
	header('Pragma: no-cache');
	header('Cache-Control: no-cache, must-revalidate');
	header("Location: $url");

	exit();
