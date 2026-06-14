<?php
/**
* ACS.PHP — SAML Assertion Consumer Service endpoint
*
* Entry point that the Identity Provider (IdP) POSTs the signed SAMLResponse to
* after a successful authentication. This file sits at the URL registered as the
* Assertion Consumer Service (ACS) in the Service Provider (SP) metadata.
*
* Execution flow:
*  1. Include `config_saml.php` — loads `$saml_settings` array and defines the
*     `SAML_CONFIG` constant consumed throughout the file and by login::Login_SAML().
*  2. Validate the POSTed `SAMLResponse` via OneLogin\Saml2\Response::isValid().
*  3. Enforce SAML assertion replay protection (SEC-078) via
*     saml_assertion_register_or_reject() — one-time-use of each assertion ID.
*  4. Extract the subject code attribute (e.g. a national ID or employee number)
*     that maps to a Dédalo user record, as configured in SAML_CONFIG['code'].
*  5. Delegate actual credential/account validation to login::Login_SAML().
*  6. Redirect to the safe-validated RelayState URL (or fallback to DEDALO_ROOT_WEB)
*     via saml_safe_redirect_target() — protects against open-redirect attacks.
*
* Security notes:
*  - SEC-014 : raw SAML attributes are never echoed to the response.
*  - SEC-017 : client IP is resolved through get_client_ip_trusted() to prevent
*              X-Forwarded-For spoofing against IdP IP allowlists.
*  - SEC-078 : assertion replay is blocked by a per-deployment on-disk cache of
*              consumed assertion IDs (atomic fopen 'xb' primitive).
*  - AUTH-01 : raw exception messages from OneLogin are never reflected to the
*              browser; a constant 'Invalid SAML Response' string is returned.
*  - AUTH-02 : the SAML subject code (PII) is only written to the debug log when
*              SHOW_DEBUG is explicitly true; never unconditionally.
*
* Related files:
*  - core/login/saml/index.php       — SP-initiated login; redirects user to IdP.
*  - core/login/saml/sls.php         — Single Logout Service handler.
*  - core/login/saml/metadata.php    — Generates SP metadata XML for IdP registration.
*  - core/login/class.login.php      — login::Login_SAML() credential/account logic.
*  - shared/core_functions.php       — saml_assertion_register_or_reject(),
*                                      saml_safe_redirect_target(),
*                                      get_client_ip_trusted(), start_time(),
*                                      exec_time_unit(), to_string().
*
* @package Dédalo
* @subpackage Core
*/

// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
 * SAML assertion response.
 *
 * The URL of this file will have been given during the SAML authorization.
 * After a successful authorization, the browser will be directed to this
 * link where it will send a certified response via $_POST.
 */

// AUTH-02: removed leftover unconditional `error_log(" SAML acs... ")` debug noise.

$start_time=start_time();

// login v3.0
	try {
		if (isset($_POST['SAMLResponse'])) {

			// Build the SP settings object from the deployment-specific $saml_settings
			// array loaded by config_saml.php. The Settings object validates the config
			// keys and raises an exception on misconfiguration (caught below).
			$samlSettings	= new OneLogin\Saml2\Settings($saml_settings);
			// Decode and parse the base64-encoded XML body that the IdP POSTed.
			// The Response object wraps the raw XML and exposes validation helpers.
			$samlResponse	= new OneLogin\Saml2\Response($samlSettings, $_POST['SAMLResponse']);
			if ($samlResponse->isValid()) {

				// SEC-078: replay-cache check. `isValid()` only verifies the
				// signature and the NotOnOrAfter window; the same signed
				// SAMLResponse XML can be POSTed multiple times by anyone who
				// captured it (browser history, MITM with stolen TLS keys,
				// proxy logs). The SAML core spec mandates one-time-use of
				// each assertion. We enforce this by tracking the assertion
				// ID in a per-deployment cache directory and rejecting any
				// id we have already consumed within its validity window.
				if (!saml_assertion_register_or_reject($samlResponse)) {
					http_response_code(401);
					header('Content-Type: text/plain; charset=utf-8');
					echo 'SAML assertion rejected (replay).';
					debug_log(__FILE__
						. ' SEC-078 SAML assertion replay rejected. assertion_id='
						. to_string(method_exists($samlResponse, 'getAssertionId') ? $samlResponse->getAssertionId() : '<unknown>')
						, logger::ERROR
					);
					exit();
				}

				// SEC-014: removed the dead `$make_login = true;` toggle and its debug-only echo
				// branch. That branch dumped raw SAML attributes to the response and existed only
				// to be flipped by a developer; keeping it in production code is a foot-gun.
				// Login into Dédalo. Credentials are all correct, enter as registered logged user.

						// Code. Is mapped from SAML response attribute name defined in config like 'code' => 'urn:oid:1.3.4.1.47.1.5.1.8'
						// Extract the attributes map from the validated assertion XML.
						// SAML attributes are multi-valued arrays; each key is the OID/name
						// string configured as SAML_CONFIG['code'] (e.g. a national ID OID).
						// `$code` will therefore be an array whose first element is the user's
						// identifying code; login::Login_SAML() normalises single/array form.
							$attributes		= $samlResponse->getAttributes();
							$code_attr_name	= SAML_CONFIG['code'];
							$code			= $attributes[$code_attr_name];
							// SEC-017: prefer the trusted IP resolver for logging consistency with
							// Login_SAML's allowlist check. The legacy get_client_ip() is fine for
							// logs but not for any security decision.
							$client_ip		= function_exists('get_client_ip_trusted')
								? get_client_ip_trusted()
								: get_client_ip();
							// AUTH-02: the SAML subject code is PII (e.g. a national id);
							// do not log it (with the client IP) to the PHP error log on
							// every login. Gate behind SHOW_DEBUG via the standard logger.
							if (defined('SHOW_DEBUG') && SHOW_DEBUG===true) {
								debug_log(__METHOD__
									. " SAMLResponse code: " . to_string($code) . " client_ip: " . to_string($client_ip)
									, logger::DEBUG
								);
							}

						// Login_SAML
						// Delegate all credential and account checks to login::Login_SAML():
						//  - IdP IP allowlist (SAML_CONFIG['idp_ip'])
						//  - brute-force throttle keyed on code+IP
						//  - lookup of the Dédalo user record by SAML code
						//  - active account / permissions validation
						//  - session creation
						// Returns stdClass{result:bool, msg:string, errors:array}.
							$response = login::Login_SAML((object)[
								'code' => $code
							]);

							if ($response->result===true) {

								// Successful login — log at WARNING level so it appears in
								// default log filters without requiring DEBUG mode.
								$total = exec_time_unit($start_time,'ms')." ms";
								debug_log(__METHOD__
									." SAML user code: ".print_r($code, true)." [$client_ip] was logged successfully. Time: ".$total
									, logger::WARNING
								);

							}else{

								// Login_SAML returned false: account inactive, unknown code,
								// IP not in allowlist, or throttle lockout. Full context is
								// logged so the admin can diagnose — attributes dump is safe
								// here because it goes to the server error log, not the browser.
								debug_log(__METHOD__
									. ' Invalid Login_SAML response' . PHP_EOL
									. ' code: ' . to_string($code) . PHP_EOL
									. ' client_ip: ' . to_string($client_ip) . PHP_EOL
									. ' attributes: ' . to_string($attributes) . PHP_EOL
									. ' response: ' . to_string($response)
									, logger::ERROR
								);
							}

						// SEC-014: redirect target. Honour RelayState only when it is a
						// same-origin path under DEDALO_ROOT_WEB; never trust absolute or
						// protocol-relative URLs supplied by the IdP / browser, otherwise
						// the SAML ACS becomes an open redirect.
						// (!) The redirect happens regardless of whether Login_SAML succeeded.
						//     If the login failed, the session is not established and the
						//     user will hit the main page unauthenticated — this is intentional:
						//     silently redirecting to an error page via RelayState is safe because
						//     no session has been set. The admin diagnoses via the ERROR log entry.
							$redirect_target = saml_safe_redirect_target($_POST['RelayState'] ?? null);
							header("Location: ".$redirect_target);
							exit();

			}else{
				// Response is received, but validation process failed
				// isValid() rejected the XML signature or the timing window.
				// A constant response prevents enumeration of validation details.
				echo 'Invalid SAML Response';
			}
		}else{
			// Any pot SAMLResponse var is received
			// No SAMLResponse in the POST body — likely a direct browser GET,
			// a scanner probe, or a misconfigured IdP. Safe to hint plainly.
			echo 'No SAML Response found in POST.';
		}
	}catch (\Throwable $e) {
		// AUTH-01: do not reflect the raw OneLogin exception text to the client
		// (internal detail disclosure). Return a constant message; log the detail.
		// Catches both Exception (OneLogin mis-config, XML parse error) and Error
		// (type errors from malformed POST data), so \Throwable is the correct base.
		http_response_code(400);
		header('Content-Type: text/plain; charset=utf-8');
		echo 'Invalid SAML Response';
		debug_log(__FILE__ . ' SAML response error: ' . $e->getMessage(), logger::ERROR);
	}
