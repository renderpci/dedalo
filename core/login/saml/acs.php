<?php
// config include file
	include dirname(dirname(dirname(dirname(__FILE__)))) . '/config/config_saml.php';

/**
 * SAML assertion response.
 *
 * The URL of this file will have been given during the SAML authorization.
 * After a successful authorization, the browser will be directed to this
 * link where it will send a certified response via $_POST.
 */

// debug
	error_log(" SAML acs... ");

$start_time=start_time();

// login v3.0
	try {
		if (isset($_POST['SAMLResponse'])) {

			$samlSettings	= new OneLogin\Saml2\Settings($saml_settings);
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
							$attributes		= $samlResponse->getAttributes();
							$code_attr_name	= SAML_CONFIG['code'];
							$code			= $attributes[$code_attr_name];
							// SEC-017: prefer the trusted IP resolver for logging consistency with
							// Login_SAML's allowlist check. The legacy get_client_ip() is fine for
							// logs but not for any security decision.
							$client_ip		= function_exists('get_client_ip_trusted')
								? get_client_ip_trusted()
								: get_client_ip();
							error_log("SAMLResponse code: ".print_r($code, true).", client_ip: ".print_r($client_ip, true));

						// Login_SAML
							$response = login::Login_SAML((object)[
								'code' => $code
							]);

							if ($response->result===true) {

								$total = exec_time_unit($start_time,'ms')." ms";
								debug_log(__METHOD__
									." SAML user code: ".print_r($code, true)." [$client_ip] was logged successfully. Time: ".$total
									, logger::WARNING
								);

							}else{

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
							$redirect_target = saml_safe_redirect_target($_POST['RelayState'] ?? null);
							header("Location: ".$redirect_target);
							exit();

			}else{
				// Response is received, but validation process failed
				echo 'Invalid SAML Response';
			}
		}else{
			// Any pot SAMLResponse var is received
			echo 'No SAML Response found in POST.';
		}
	}catch (Exception $e) {
		// Error in saml response manager
		echo 'Invalid SAML Response (2): ' . $e->getMessage();
	}
