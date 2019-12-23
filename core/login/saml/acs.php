<?php
/**
 * SAML assertion response.
 *
 * The URL of this file will have been given during the SAML authorization.
 * After a successful authorization, the browser will be directed to this
 * link where it will send a certified response via $_POST.
 */

$start_time=microtime(1);

// Require files
	require_once( dirname(dirname(dirname(__FILE__))) . '/config/config.php' );
	require_once( dirname(__FILE__) . '/saml_config.php' );
	require_once( SAML_SETTINGS_PATH );
	require_once( TOOLKIT_PATH . '_toolkit_loader.php' );

// test
	/*
	$attributes['urn:oid:1.3.6.1.4.1.5923.1.1.1.6'] = ['33333333P']; // forced test

	// Code. Is mapped from SAML response attribute name defined in config like 'code' => 'urn:oid:1.3.4.1.47.1.5.1.8'
		$code_attr_name = SAML_CONFIG['code'];
		$code           = $attributes[$code_attr_name];

	// Login_SAML
		$response = login::Login_SAML(array(
			'code' => $code
		));

		if ($response->result===true) {
			
			$total = exec_time_unit($start_time,'ms')." ms";
			echo " User was saml logged successfully. ".$total;
			debug_log(__METHOD__." User was saml logged successfully. ".$total, logger::ERROR);

			#header("Location: ".DEDALO_ROOT_WEB);

		}else{

			echo $response->msg;
		}
		exit();
		*/

// login v3.0 
	try {
		if (isset($_POST['SAMLResponse'])) {
			    
			$samlSettings = new OneLogin\Saml2\Settings($saml_settings);        
			$samlResponse = new OneLogin\Saml2\Response($samlSettings, $_POST['SAMLResponse']);
			if ($samlResponse->isValid()) {

				$make_login = true;
				if ($make_login!==true) {

					// Debug verification
						echo 'You are: ' . $samlResponse->getNameId() . '<br>';
						$attributes = $samlResponse->getAttributes();
						if (!empty($attributes)) {
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
						}
				}else{

					// Login into Dédalo. Credentials are all coorect, enter as registerd logged user 
						
						// Code. Is mapped from SAML response attribute name defined in config like 'code' => 'urn:oid:1.3.4.1.47.1.5.1.8'
							$attributes 	= $samlResponse->getAttributes();
							$code_attr_name = SAML_CONFIG['code'];
							$code           = $attributes[$code_attr_name];
							$client_ip 		= common::get_client_ip();
							error_log("SAMLResponse code: ".print_r($code, true).", client_ip: ".print_r($client_ip, true));
						
						// Login_SAML
							$response = login::Login_SAML(array(
								'code' => $code
							));

							if ($response->result===true) {
								
								$total = exec_time_unit($start_time,'ms')." ms"; echo $total;
								debug_log(__METHOD__." SAML user ".print_r($code, true)." [$client_ip] was logged successfully.  ".$total, logger::ERROR);

								header("Location: ".DEDALO_ROOT_WEB);
								
							}else{

								#echo $response->msg;

								// Error msg
									$html_content  = '';
									$html_content .= '<div class="raw_msg">';

										$html_content .= '<div class="content">';
											$html_content .= '<h3>'.$response->msg.'</h3>';
											$html_content .= '<div class="saml_button">';
											#$load_logout = file_get_contents_curl(SAML_CONFIG['logout_url']);
											#$html_content .= '<iframe class="hide" src="'.SAML_CONFIG['logout_url'].'"></iframe>';
											#$html_content .= '<script>var my_window=window.open("'.SAML_CONFIG['logout_url'].'");</script>';
											#$html_content .= include( DEDALO_LIB_BASE_PATH . '/login/html/saml_button.phtml');
											$html_content .= '<a type="button" class="btn btn-success btn-block" href="'.DEDALO_ROOT_WEB.'">Dédalo Login</a>';
											$html_content .= '</div>';											
										$html_content .= '</div>';

									$html_content .= '</div>';

									echo html_page::get_html($html_content, true);
							}
							exit();
				}

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

// login v2.14 
	/*
	try {
		if (isset($_POST['SAMLResponse'])) {
			
			#$samlSettings = new OneLogin_Saml2_Settings();     
			$samlSettings = new OneLogin_Saml2_Settings($saml_settings);        
			$samlResponse = new OneLogin_Saml2_Response($samlSettings, $_POST['SAMLResponse']);
			if ($samlResponse->isValid()) {

				$make_login = true;
				if ($make_login!==true) {

					// Debug verification
						echo 'You are: ' . $samlResponse->getNameId() . '<br>';
						$attributes = $samlResponse->getAttributes();
						if (!empty($attributes)) {
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
						}
				}else{

					// Login into Dédalo. Credentials are all coorect, enter as registerd logged user 
						
						// Code. Is mapped from SAML response attribute name defined in config like 'code' => 'urn:oid:1.3.4.1.47.1.5.1.8'
							$attributes 	= $samlResponse->getAttributes();
							$code_attr_name = SAML_CONFIG['code'];
							$code           = $attributes[$code_attr_name];
							$client_ip 		= common::get_client_ip();
							error_log("SAMLResponse code: ".print_r($code, true).", client_ip: ".print_r($client_ip, true));
						
						// Login_SAML
							$response = login::Login_SAML(array(
								'code' => $code
							));

							if ($response->result===true) {
								
								$total = exec_time_unit($start_time,'ms')." ms"; echo $total;
								debug_log(__METHOD__." User was saml logged successfully.  ".$total, logger::ERROR);

								header("Location: ".DEDALO_ROOT_WEB);
								
							}else{

								echo $response->msg;
							}
							exit();
				}

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
	*/

