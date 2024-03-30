<?php
declare(strict_types=1);
/**
* CLASS LOGIN
*
*
*/
class login extends common {



	/**
	* CLASS VARS
	*/
		protected $id;
		protected $tipo_active_account			= 'dd131';
		protected $tipo_button_login			= 'dd259';
		protected static $login_matrix_table	= 'matrix';
		const SU_DEFAULT_PASSWORD				= '';



	/**
	* __CONSTRUCT
	* @param string $mode = 'edit'
	*/
	public function __construct(string $mode='edit') {

		// removed is_logged verification because it's necessary to get the context of login
		// in test environments like unit_test

		$id		= null;
		$tipo	= self::get_login_tipo();

		$this->set_id($id);
		$this->set_tipo($tipo);
		$this->set_lang(DEDALO_DATA_LANG);
		$this->set_mode($mode);

		// boolean $result
		parent::load_structure_data();
	}//end __construct



	/**
	* LOGIN
	* Exec user login action comparing received values with database encrypted values
	* @param object $options
	* @see Mandatory vars: 'username','password'
	*
	* @return object $response
	*/
	public static function Login( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed [Login]';

		// options
			$username = $options->username;
			$password = $options->password;

		// username
			if(!empty($username) && is_string($username)) {
				$username = trim($username);
			}
			if (!is_string($username) || empty($username)) {
				$response->msg = "Error Processing Request: username is invalid!";
				return $response;
			}

			if(DEDALO_MAINTENANCE_MODE===true && $username!=='root'){
				$response->msg = label::get_label('site_under_maintenance') ?? "System under maintenance";
				return $response;
			}
			// safe username
			$username = safe_xss($username);

		// password
			if (!is_string($password) || empty($password) || strlen($password)<8) {
				$response->msg = "Error Processing Request: password is empty or the length is invalid !";
				return $response;
			}

		// search username
			$arguments = [];
			$arguments['strPrimaryKeyName']	= 'section_id';
			$arguments['section_tipo']		= DEDALO_SECTION_USERS_TIPO;
			$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = json_encode([$username],JSON_UNESCAPED_UNICODE);
			// search
			$matrix_table			= common::get_matrix_table_from_tipo(DEDALO_SECTION_USERS_TIPO);
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table, null, DEDALO_SECTION_USERS_TIPO);
			$ar_result				= (array)$JSON_RecordObj_matrix->search($arguments);
			$user_count				= count($ar_result);

		// user found in db check
			if( !is_array($ar_result) || empty($ar_result[0]) ) {

				#
				# STOP: USERNAME DO NOT EXISTS
				#
				$activity_datos['result']	= 'deny';
				$activity_datos['cause']	= 'User does not exist';
				$activity_datos['username']	= $username;

				# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
				self::login_activity_report(
					"Denied login attempted by: $username. This user does not exist in the database",
					'LOG IN',
					$activity_datos
				);
				// delay failed output after 2 seconds to prevent brute force attacks
				if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				// response
				$response->msg = "Error: User does not exists or password is invalid!";
				// error_log("DEDALO LOGIN ERROR : Invalid user or password");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// user ambiguous check (more than one with same name case)
			if( $user_count>1 ) {

				#
				# STOP: USERNAME DUPLICATED
				#
				$activity_datos['result']	= 'deny';
				$activity_datos['cause']	= 'User duplicated in database';
				$activity_datos['username']	= $username;

				# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
				self::login_activity_report(
					"Denied login attempted by : $username. This user exist more than once in the database ".$user_count,
					'LOG IN',
					$activity_datos
				);
				# delay failed output after 2 seconds to prevent brute force attacks
		        if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				#exit("Error: User $username not exists !");
				$response->msg = 'Error: User ambiguous';
				// error_log("DEDALO LOGIN ERROR : Invalid user or password. User ambiguous ($username)");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// password check
			$user_id = $section_id = (int)reset($ar_result);

			# Search password
			$password_encrypted	= component_password::encrypt_password($password);
			$component_password	= component_common::get_instance(
				'component_password',
				DEDALO_USER_PASSWORD_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				DEDALO_SECTION_USERS_TIPO,
				false
			);
			$ar_password_dato	= $component_password->get_dato();
			$password_dato		= is_array($ar_password_dato)
				? $ar_password_dato[0]
				: $ar_password_dato; // pre-v6 dato cases

			// password match check
				if( $password_encrypted!==$password_dato ) {

					#
					# STOP : PASSWORD IS WRONG
					#
					$activity_datos['result']	= 'deny';
					$activity_datos['cause']	= 'wrong password';
					$activity_datos['username']	= $username;

					# LOGIN ACTIVITY REPORT
					self::login_activity_report(
						"Denied login attempted by: $username. Wrong password [1] (Incorrect password)",
						'LOG IN',
						$activity_datos
					);
					# delay failed output by 2 seconds to prevent brute force attacks
					if (DEVELOPMENT_SERVER!==true) {
						sleep(2);
					}
					$response->msg = 'Error: Wrong password [1]';
					// error_log("DEDALO LOGIN ERROR : Wrong password [1] (".DEDALO_ENTITY.")");
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' username: ' . $username . PHP_EOL
						. ' DEDALO_ENTITY: ' . DEDALO_ENTITY
						, logger::WARNING
					);
					return $response;
				}//end if( $password_encrypted!==$password_dato )

			// password length check
				if( empty($password_dato) || strlen($password_dato)<8 ) {
					$response->msg = 'Error: Wrong password [2]';
					// error_log("DEDALO LOGIN ERROR : Wrong password [2] (".DEDALO_ENTITY.")");
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' username: ' . $username . PHP_EOL
						. ' DEDALO_ENTITY: ' . DEDALO_ENTITY
						, logger::WARNING
					);
					return $response;
				}

		// active account check
			$active_account = login::active_account_check($section_id);
			if( $active_account!==true ) {

				#
				# STOP : ACCOUNT INACTIVE
				#

				# LOGIN ACTIVITY REPORT
				self::login_activity_report(
					"Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
					'LOG IN',
					// activity_datos
					array(
						'result' 	=> 'deny',
						'cause' 	=> 'account inactive',
						'username' 	=> $username
					)
				);

				# delay failed output by 2 seconds to prevent brute force attacks
				if (DEVELOPMENT_SERVER!==true) {
					sleep(2);
				}
				$response->msg = 'Error: Account inactive or not defined [1]';
				// error_log("DEDALO LOGIN ERROR : Account inactive");
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' username: ' . $username
					, logger::WARNING
				);
				return $response;
			}

		// profile / projects check
			$is_global_admin = security::is_global_admin($user_id);
			if($is_global_admin!==true) {

				#
				# PROFILE
					$user_have_profile = login::user_have_profile_check($user_id);
					if ($user_have_profile!==true) {
						$response->msg = label::get_label('user_without_profile_error');
						return $response;
					}

				#
				# PROJECTS : TEST FILTER MASTER VALUES
					$user_have_projects = login::user_have_projects_check($user_id);
					if ($user_have_projects!==true) {
						$response->msg = label::get_label('user_without_projects_error');
						return $response;
					}

			}//end if(!security::is_global_admin($user_id))


		// Login (all is ok) - init login sequence when all is ok
			$full_username				= login::get_full_username($user_id);
			$init_user_login_sequence	= login::init_user_login_sequence(
				$user_id,
				$username,
				$full_username
			);
			if ($init_user_login_sequence->result===false) {

				// return false
				$response->result			= false;
				$response->msg				= $init_user_login_sequence->msg;
				$response->errors			= isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
				$response->result_options	= $init_user_login_sequence->result_options;

			}else if($init_user_login_sequence->result===true) {

				// return OK and reload page
				$response->result			= true;
				$response->msg				= " Login.. ";
				$response->errors			= isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
				$response->result_options	= $init_user_login_sequence->result_options;
				$response->default_section	= login::get_default_section($user_id);
			}


		return $response;
	}//end Login



	/**
	* LOGIN_SAML
	* @param object $request_options
	* @return object $response
	*/
	public static function Login_SAML(object $request_options) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__.' Error. Request failed';

		$options = new stdClass();
			$options->code = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// IP validation
			if (!empty(SAML_CONFIG['idp_ip'])) {
				$client_ip = get_client_ip();
				if (!in_array($client_ip, SAML_CONFIG['idp_ip'])) {
					$response->msg = "[Login_SAML] Error. Invalid client IP !";
					return $response;
				}
			}

		# Search code
			$arguments=array();
			$arguments["strPrimaryKeyName"] = 'section_id';
			$arguments["section_tipo"]  	= DEDALO_SECTION_USERS_TIPO;
			$arguments["datos#>>'{components,dd1053,dato,lg-nolan}'"] = json_encode((array)$options->code,JSON_UNESCAPED_UNICODE);

			$matrix_table 			= common::get_matrix_table_from_tipo(DEDALO_SECTION_USERS_TIPO);
			$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_USERS_TIPO);
			$ar_result				= (array)$JSON_RecordObj_matrix->search($arguments);

			$section_id = !empty($ar_result[0]) ? $ar_result[0] : false;
			if($section_id!==false) {

				// Ok

					$section_id = $ar_result[0];
					$username 	= 'saml_user';

					// Is already logged check
						if (login::is_logged()===true) {
							if (logged_user_id()==$section_id) {
								# Logged as same user
								$response->result = true;
								$response->msg 	  = " User already logged. ";
								return $response;
							}else{
								# Logged as different user
								login::Quit((object)[
									'mode'	=> 'saml',
									'cause'	=> 'Browser already logged as different user'
								]); // Logout old user before continue login
							}
						}

					// Active account check
						$active_account = login::active_account_check($section_id);
						if( $active_account!==true ) {

							#
							# STOP : ACCOUNT INACTIVE
							#

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"[Login_SAML] Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
								'LOG IN',
								// activity_datos
								array(
									'result' 	=> 'deny',
									'cause' 	=> 'account inactive',
									'username' 	=> $username
								)
							);

							# delay failed output by 2 seconds to prevent brute force attacks
							if (DEVELOPMENT_SERVER!==true) {
								sleep(2);
							}
							$response->msg = "[Login_SAML] Error: Account inactive or not defined [1]";
							error_log("[Login_SAML] DEDALO LOGIN ERROR : Account inactive");
							return $response;
						}

					// Is global admin
						$is_global_admin = security::is_global_admin($section_id);

					// Profile / projects check
						if($is_global_admin!==true) {

							#
							# PROFILE
								$user_have_profile = login::user_have_profile_check($section_id);
								if ($user_have_profile!==true) {
									$response->msg = label::get_label('error_usuario_sin_perfil');
									return $response;
								}

							#
							# PROJECTS : TEST FILTER MASTER VALUES
								$user_have_projects = login::user_have_projects_check($section_id);
								if ($user_have_projects!==true) {
									$response->msg = label::get_label('user_without_projects_error');
									return $response;
								}

						}//end if(!security::is_global_admin($section_id))

					// LOGIN (ALL IS OK) - INIT LOGIN SECUENCE WHEN ALL IS OK

						// User name
							$username = login::logged_user_username($section_id);

						// Full username
							$full_username = login::get_full_username($section_id);

						// init_user_login_sequence
							$init_user_login_sequence = login::init_user_login_sequence(
								$section_id,
								$username,
								$full_username,
								false, // bool init_test
								'saml'
							);
							if ($init_user_login_sequence->result===false) {
								# RETURN FALSE
								$response->result = false;
								$response->msg 	  = $init_user_login_sequence->msg;
								$response->errors = isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
							}else if($init_user_login_sequence->result===true) {
								# RETURN OK AND RELOAD PAGE
								$response->result = true;
								$response->msg 	  = " Login.. ";
								$response->errors = isset($init_user_login_sequence->errors) ? $init_user_login_sequence->errors : [];
							}
			}else{

				// Error
					#
					# STOP: CODE NOT EXISTS
					#

					// LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
						self::login_activity_report(
							"[Login_SAML] Denied login attempted by: saml_user. This code does not exist in the database",
							'LOG IN',
							// activity_datos
							array(
								'result' 	=> 'deny',
								'cause' 	=> 'code not exist',
								'username' 	=> 'from saml',
								'code' 		=> $options->code
							)
						);

					# delay failed output after 2 seconds to prevent brute force attacks
			        if (DEVELOPMENT_SERVER!==true) {
						sleep(2);
					}
					$response->msg = label::get_label('user_code_does_not_exist_error'); # "Error: User Code not exists! Please try again";
					error_log("[Login_SAML] DEDALO LOGIN ERROR : Invalid saml code");
					return $response;
			}


		return $response;
	}//end Login_SAML



	/**
	* GET_USERNAME
	* @param string|int $section_id (is user section id)
	* @return string $username
	*/
	public static function logged_user_username(string|int $section_id) : string {

		$component = component_common::get_instance(
			'component_input_text',
			DEDALO_USER_NAME_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$dato = $component->get_dato();

		$username = !empty($dato)
			? implode(' ', (array)$dato)
			: '';

		return $username;
	}//end get_username



	/**
	* GET_FULL_USERNAME
	* @param string|int $section_id (is user section id)
	* @return string $full_username
	*/
	public static function get_full_username($section_id) : string {

		$component = component_common::get_instance(
			'component_input_text',
			DEDALO_FULL_USER_NAME_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$dato = $component->get_valor();

		$full_username = !empty($dato)
			? implode(' ', (array)$dato)
			: '';

		return $full_username;
	}//end get_full_username



	/**
	* GET_USER_IMAGE
	* @param string|int $section_id (is user section id)
	* @return string|null $user_image
	* 	Local url of user image path as /v6/media/media_development/image/1.5MB/dd522_dd128_1.jpg
	*/
	public static function get_user_image($section_id) : ?string {

		$component = component_common::get_instance(
			'component_image',
			DEDALO_USER_IMAGE_TIPO, // 'dd522'
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$user_image = $component->get_url(
			DEDALO_IMAGE_QUALITY_DEFAULT,
			true, // test_file
			false, // absolute
			false // default_add
		);

		if(empty($user_image) && $section_id<1) {
			$user_image = DEDALO_ROOT_WEB . '/core/themes/default/raspas/raspa_screen.jpg';
		}


		return $user_image;
	}//end get_user_image



	/**
	* ACTIVE_ACCOUNT_CHECK
	* @param string|int $section_id
	* @return bool
	*/
	public static function active_account_check($section_id) : bool {

		$active_account = false; // Default false

		$model					= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_ACTIVE_ACCOUNT_TIPO,true);
		$component_radio_button	= component_common::get_instance(
			$model,
			DEDALO_ACTIVE_ACCOUNT_TIPO,
			$section_id,
			'edit',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$cuenta_activa_dato = $component_radio_button->get_dato();

		// NOTE: The valid value can only be 1, which is 'Yes' in the referenced list of values and is assigned as a constant in config 'NUMERICAL_MATRIX_VALUE_YES'
		if (isset($cuenta_activa_dato[0]) && isset($cuenta_activa_dato[0]->section_id) && $cuenta_activa_dato[0]->section_id==NUMERICAL_MATRIX_VALUE_YES) {
			$active_account = true;
		}

		return (bool)$active_account;
	}//end active_account_check



	/**
	* USER_HAVE_PROFILE_CHECK
	* Check if the given user id have profile data
	* @param string|int $section_id
	* @return bool $have_profile
	*/
	public static function user_have_profile_check($section_id) : bool {

		$locator		= security::get_user_profile($section_id);
		$have_profile	= !empty($locator)
			? true
			: false;

		return (bool)$have_profile;
	}//end user_have_profile_check



	/**
	* USER_HAVE_PROJECTS_CHECK
	* @param string|int $section_id
	* @return bool
	*/
	public static function user_have_projects_check($section_id) : bool {

		$user_have_projects = false; // Default false

		$component_filter_master = component_common::get_instance(
			'component_filter_master',
			DEDALO_FILTER_MASTER_TIPO,
			$section_id,
			'list',
			DEDALO_DATA_LANG,
			DEDALO_SECTION_USERS_TIPO
		);
		$filter_master_dato = (array)$component_filter_master->get_dato();
		if (!empty($filter_master_dato) && count($filter_master_dato)>0) {
			$user_have_projects = true;
		}

		return (bool)$user_have_projects;
	}//end user_have_projects_check



	/**
	* GET_DEFAULT_SECTION
	* @param string|int $section_id (is user section id)
	* @return string $full_username
	*/
	private static function get_default_section($section_id) : ?string {

		// root user case
			if ($section_id==-1) {
				return DEDALO_AREA_MAINTENANCE_TIPO;
			}

		$component = component_common::get_instance(
			'component_input_text',
			'dd1603',
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$dato				= $component->get_dato();
		$default_section	= !empty($dato) && !empty($dato[0])
			? $dato[0]
			: null;

		return $default_section;
	}//end get_default_section



	/**
	* INIT_USER_LOGIN_SEQUENCE
	* init login sequence when all is OK
	* @param int $user_id
	* @param string $username
	* @param string $full_username
	* @param bool $init_test = true
	* @param string $login_type = 'default'
	* @return object $response
	*/
	private static function init_user_login_sequence(int $user_id, string $username, string $full_username, bool $init_test=true, string $login_type='default') : object {

		$response = new stdClass();
			$response->result			= false;
			$response->msg				= 'Error on init_user_login_sequence';
			$response->errors			= [];
			$response->result_options	= null;

		// ob_implicit_flush(true);

		// dedalo init test sequence
			if ($init_test===true) {

				// dd_init_test
					$init_response = require DEDALO_CORE_PATH.'/base/dd_init_test.php';

				// errors found on init test (Don't stop execution here)
					if ($init_response->result===false) {
						debug_log(__METHOD__
							." Init test error (dd_init_test): ". PHP_EOL
							.' init_response: ' . $init_response->msg
							, logger::ERROR
						);
						// Don't stop here. Only inform user of init error via JavaScript
							# $response->result 	= false;
							# $response->msg 		= $init_response->msg;
							# return $response;
						array_push($response->errors, ...$init_response->msg);
					}

				// init_response result_options (like redirect)
					if (isset($init_response->result_options)) {
						$response->result_options = $init_response->result_options;
					}
			}

		// is_global_admin (before set user session vars)
			$is_global_admin = (bool)security::is_global_admin($user_id);
			$_SESSION['dedalo']['auth']['is_global_admin'] = $is_global_admin;

		// is_developer (before set user session vars)
			$is_developer = (bool)security::is_developer($user_id);
			$_SESSION['dedalo']['auth']['is_developer'] = $is_developer;

		// session : If backup is OK, fix session data
			$_SESSION['dedalo']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo']['auth']['username']			= $username;
			$_SESSION['dedalo']['auth']['full_username']	= $full_username;
			$_SESSION['dedalo']['auth']['is_logged']		= 1;

		// config key
			$_SESSION['dedalo']['auth']['salt_secure'] = dedalo_encrypt_openssl(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo']['auth']['login_type'] = $login_type;

		// fix lang
			if (!isset($_SESSION['dedalo']['config']['dedalo_application_lang'])) {
				$_SESSION['dedalo']['config']['dedalo_application_lang'] = DEDALO_APPLICATION_LANG;
			}

		// cookie authorization
			if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
				self::init_cookie_auth();
			}

		// backup all
			if( DEDALO_BACKUP_ON_LOGIN ) {

				$make_backup_response = backup::make_backup((object)[
					'user_id'					=> $user_id,
					'username'					=> $username,
					'skip_backup_time_range'	=> false
				]);
				$backup_info = $make_backup_response->msg;

			}else{
				$backup_info = 'Deactivated "on login backup" for this domain';
			}

		// remove lock_components elements
			try {
				# remove lock_components elements
				if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
					lock_components::force_unlock_all_components($user_id);
				}
				# GET ENTITY DIFFUSION TABLES / SECTIONS . Store for speed
				# $entity_diffusion_tables = diffusion::get_entity_diffusion_tables(DEDALO_DIFFUSION_DOMAIN);
				# $_SESSION['dedalo']['config']['entity_diffusion_tables'] = $entity_diffusion_tables;

			} catch (Exception $e) {
				debug_log(__METHOD__." $e ", logger::CRITICAL);
			}



		// precalculate profiles datalist security access in background
		// This file is generated on every user login, launching the process in background
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {

				// delete previous cache files (prevents reuse of old files when the user does not quit from the browser)
				dd_cache::delete_cache_files();

				$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);
				debug_log(__METHOD__
					." Generating security access datalist in background... [cache_file_name: $cache_file_name]"
					, logger::DEBUG
				);
				dd_cache::process_and_cache_to_file((object)[
					'process_file'	=> DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
					'data'			=> (object)[
						'session_id'	=> session_id(),
						'user_id'		=> $user_id,
						'lang'			=> DEDALO_APPLICATION_LANG
					],
					'file_name'		=> $cache_file_name,
					'wait'			=> false
				]);
			}

		// user image
			$user_image = login::get_user_image($user_id);
			if (!isset($response->result_options)) {
				$response->result_options = new stdClass();
			}
			$response->result_options->user_image	= $user_image;
			$response->result_options->user_id		= $user_id;

		// add cookie dedalo_logged (used to check some features in same domain web)
			setcookie('dedalo_logged', 'true', time() + (86400 * 1), '/');

		// log : Prepare and save login action
			$browser = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
			if (strpos($browser, 'AppleWebKit')===false) $browser = '<i style="color:red">'.$browser.'</i>';

			$activity_datos['result']		= 'allow';
			$activity_datos['cause']		= 'correct user and password';
			$activity_datos['username']		= $username;
			$activity_datos['browser']		= $browser;
			$activity_datos['DB-backup']	= $backup_info;

			// login activity report
			self::login_activity_report(
				"User $user_id is logged. Hello $username",
				'LOG IN',
				$activity_datos
			);

		// OK response
			$response->result	= true;
			$response->msg		= 'OK init_user_login_sequence is done';

		return $response;
	}//end init_user_login_sequence



	/**
	* INIT_COOKIE_AUTH
	* @return bool true
	*/
	private static function init_cookie_auth() : bool {

		// short vars
			$cookie_name		= self::get_auth_cookie_name();
			$cookie_value		= self::get_auth_cookie_value();
			$ktoday				= date("Y_m_d");
			$kyesterday			= date("Y_m_d",strtotime("-1 day"));
			$cookie_file		= DEDALO_EXTRAS_PATH.'/media_protection/cookie/cookie_auth.php';
			$cookie_file_exists	= file_exists($cookie_file);
			if ($cookie_file_exists===true) {

				$current_file	= file_get_contents($cookie_file);
				$ar_data		= json_decode($current_file);
			}

		if ( $cookie_file_exists===true && isset($ar_data->$ktoday) && isset($ar_data->$kyesterday) ) {

			$data = $ar_data;
			debug_log(__METHOD__." data 1 Recycle ".to_string($data), logger::DEBUG);

		}else{

			$data = new stdClass();

			$ktoday_data = new stdClass();
				$ktoday_data->cookie_name	= $cookie_name;
				$ktoday_data->cookie_value	= $cookie_value;

			$data->$ktoday = $ktoday_data;

			if (isset($ar_data->$kyesterday)) {
				$data->$kyesterday = $ar_data->$kyesterday;
			}else{

				$kyesterday_data = new stdClass();
					$kyesterday_data->cookie_name	= self::get_auth_cookie_name();
					$kyesterday_data->cookie_value	= self::get_auth_cookie_value();

				$data->$kyesterday = $kyesterday_data;
			}
			// File cookie data
			if( !file_put_contents($cookie_file, json_encode($data)) ){
				throw new Exception("Error Processing Request. Media protection error on create cookie_file", 1);
			}

			debug_log(__METHOD__." data 2 New data ".to_string($data), logger::DEBUG);

			// APACHE 2.2
				// 	$htaccess_text  = '';

				// 	$htaccess_text .= '# Protect files and directories from prying eyes.'.PHP_EOL;
				// 	$htaccess_text .= '<FilesMatch "\.(deleted|sh|temp|tmp|import)$">'.PHP_EOL;
				// 	$htaccess_text .= 'Order allow,deny'.PHP_EOL;
				// 	$htaccess_text .= '</FilesMatch>'.PHP_EOL;

				// 	$htaccess_text .= '# Protect media files with realm'.PHP_EOL;
				// 	$htaccess_text .= 'AuthType Basic'.PHP_EOL;
				// 	$htaccess_text .= 'AuthName "Protected Login"'.PHP_EOL;
				// 	$htaccess_text .= 'AuthUserFile ".htpasswd"'.PHP_EOL;
				// 	$htaccess_text .= 'AuthGroupFile "/dev/null"'.PHP_EOL;
				// 	$htaccess_text .= 'SetEnvIf Cookie '.$data->$ktoday->cookie_name.'='.$data->$ktoday->cookie_value.' PASS=1'.PHP_EOL;
				// 	$htaccess_text .= 'SetEnvIf Cookie '.$data->$kyesterday->cookie_name.'='.$data->$kyesterday->cookie_value.' PASS=1'.PHP_EOL;
				// 	$htaccess_text .= 'Order deny,allow'.PHP_EOL;
				// 	$htaccess_text .= 'Deny from all'.PHP_EOL;
				// 	$htaccess_text .= 'Allow from env=PASS'.PHP_EOL;
				// 	$htaccess_text .= 'Require valid-user'.PHP_EOL;
				// 	$htaccess_text .= 'Satisfy any'.PHP_EOL;

			// APACHE 2.4
				$htaccess_text  = '';

				$htaccess_text .= '# Protect files and directories from prying eyes.'.PHP_EOL;
				$htaccess_text .= '<FilesMatch "\.(deleted|sh|temp|tmp|import)$">'.PHP_EOL;
	  			$htaccess_text .= 'Require all granted'.PHP_EOL;
				$htaccess_text .= '</FilesMatch>'.PHP_EOL;

				$htaccess_text .= '# Protect media files with realm'.PHP_EOL;
				$htaccess_text .= 'AuthType Basic'.PHP_EOL;
				$htaccess_text .= 'AuthName "Protected Login"'.PHP_EOL;
				$htaccess_text .= 'AuthUserFile ".htpasswd"'.PHP_EOL;
				$htaccess_text .= 'AuthGroupFile "/dev/null"'.PHP_EOL;
				$htaccess_text .= 'SetEnvIf Cookie '.$data->$ktoday->cookie_name.'='.$data->$ktoday->cookie_value.' PASS=1'.PHP_EOL;
				$htaccess_text .= 'SetEnvIf Cookie '.$data->$kyesterday->cookie_name.'='.$data->$kyesterday->cookie_value.' PASS=1'.PHP_EOL;
				// Require any sentence
				$htaccess_text .= '<RequireAny>'.PHP_EOL;
				$htaccess_text .= 'Require env PASS'.PHP_EOL;
				$htaccess_text .= 'Require valid-user'.PHP_EOL;

			# INIT_COOKIE_AUTH_ADDONS (From config)
			if ( defined('INIT_COOKIE_AUTH_ADDONS') ) {
				if ($ar_lines = json_decode(INIT_COOKIE_AUTH_ADDONS)) {
					foreach ((array)$ar_lines as $current_line) {
						$htaccess_text .= $current_line . PHP_EOL;
					}
				}
			}

			$htaccess_text .= '</RequireAny>'.PHP_EOL;

			debug_log(__METHOD__." htaccess_text ".to_string($htaccess_text), logger::DEBUG);

			# File .htaccess
			$htaccess_file = DEDALO_MEDIA_PATH.'/.htaccess';
			if( !file_put_contents($htaccess_file, $htaccess_text) ){
				// Remove cookie file (cookie_file.php)
				unlink($cookie_file);
				// Launch Exception
				throw new Exception("Error Processing Request. Media protection error on create access file", 1);
			}
		}

		$_SESSION['dedalo']['auth']['cookie_auth'] = $data;

		// set cookie
			$cookie_properties = get_cookie_properties();
			// setcookie($data->$ktoday->cookie_name, $data->$ktoday->cookie_value, time() + (86400 * 1), '/'); // 86400 = 1 day
			$cookie_values = (object)[
				'name'		=> $data->{$ktoday}->cookie_name,
				'value'		=> $data->{$ktoday}->cookie_value,
				'expires'	=> (time() + (86400 * 1)),
				'path'		=> '/',
				'domain'	=> $cookie_properties->domain ?? '',
				'secure'	=> $cookie_properties->secure,
				'httponly'	=> $cookie_properties->httponly
			];
			setcookie(
				$cookie_values->name,		// string $name
				$cookie_values->value,		// string $value = ""
				$cookie_values->expires,	// int $expires = 0
				$cookie_values->path,		// string $path = ""
				$cookie_values->domain,		// string $domain = ""
				$cookie_values->secure,		// bool $secure = false
				$cookie_values->httponly	// bool $httponly = false
			);

		return true;
	}//end init_cookie_auth



	/**
	* GET_AUTH_COOKIE_NAME
	* @return string $cookie_name
	*/
	private static function get_auth_cookie_name() : string {
		$date = getdate();
		#$cookie_name = md5( 'dedalo_c_name_'.$date['year'].$date['mon'].$date['mday'].$date['weekday']. mt_rand() );
		$cookie_name = hash('sha512', 'dedalo_c_name_'.$date['year'].$date['mon'].$date['mday'].$date['weekday']. random_bytes(8));

	    return $cookie_name;
	}//end get_auth_cookie_name



	/**
	* GET_AUTH_COOKIE_value
	*    [mday]    => 17
	*    [wday]    => 2
	*    [mon]     => 6
	*    [year]    => 2003
	*    [yday]    => 167
	*    [weekday] => Tuesday
	*    [month]   => June
	* @return string $cookie_value
	*/
	private static function get_auth_cookie_value() : string {
		$date = getdate();
		#$cookie_value = md5( 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. mt_rand() );
		$cookie_value = hash('sha512', 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. random_bytes(8) );

	    return $cookie_value;
	}//end get_auth_cookie_value



	/**
	* IS_LOGGED
	* Test if current user is logged (alias of verify_login)
	* @see login::verify_login
	* @return bool
	*/
	public static function is_logged() : bool {

		return self::verify_login();
	}//end is_logged



	/**
	* VERIFY_LOGIN
	* Check that the user is authenticated
	* based in session existing properties.
	* Note that if the system is under maintenance,
	* only the root user is authorized
	* @return bool
	*/
	private static function verify_login() : bool {

		if( empty($_SESSION['dedalo']['auth']['user_id']) ||
			empty($_SESSION['dedalo']['auth']['is_logged']) ||
			$_SESSION['dedalo']['auth']['is_logged'] !== 1 ||
			empty($_SESSION['dedalo']['auth']['salt_secure'])
			) {

			// not authenticated case

			if (empty($_SESSION['dedalo']['auth']['user_id'])) {

				# Store current lang for not loose
				$dedalo_application_lang	= $_SESSION['dedalo']['config']['dedalo_application_lang'] ?? false;
				$dedalo_data_lang			= $_SESSION['dedalo']['config']['dedalo_data_lang'] ?? false;

				# remove complete session
				unset($_SESSION['dedalo']);

				# Restore langs
				if ($dedalo_application_lang) {
					$_SESSION['dedalo']['config']['dedalo_application_lang'] = $dedalo_application_lang;
				}
				if ( $dedalo_data_lang) {
					$_SESSION['dedalo']['config']['dedalo_data_lang'] = $dedalo_data_lang;
				}
			}

			return false;

		}else{

			// authenticated case

			// maintenance mode. Only toot user is allowed in maintenance mode
				if(DEDALO_MAINTENANCE_MODE===true && $_SESSION['dedalo']['auth']['username']!=='root') {
					return false;
				}

			return true;
		}
	}//end verify_login



	/**
	* GET_LOGIN_TIPO
	* @return string $tipo
	* 	value 'dd229'
	*/
	private static function get_login_tipo() : string {

		$tipo = 'dd229'; // fixed because never changes

		return $tipo;
	}//end get_login_tipo



	/**
	* QUIT
	* Made logout
	* @param object $options
	* @return bool
	*/
	public static function Quit(object $options) : bool {

		// options
			$mode	= $options->mode ?? null;
			$cause	= $options->cause ?? 'called quit method';

		// already login check
			if (self::is_logged()!==true) {
				$user_id = isset($_SESSION['dedalo'])
					? $_SESSION['dedalo']['auth']['user_id']
					: null;
				debug_log(__METHOD__
					. " User is already logged " . PHP_EOL
					. ' user_id: '. $user_id
					, logger::WARNING
				);
				return false;
			}

		// session user values
			$user_id	= logged_user_id();
			$username	= logged_user_username();

		// lock_components. remove lock_components elements
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

		// user activity update stats
			diffusion_section_stats::update_user_activity_stats( (int)$user_id );

		// delete previous cache files (prevents reuse of old files when the user does not quit from the browser)
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path'])) {
				dd_cache::delete_cache_files();
			}

		// login activity report
			self::login_activity_report(
				"User $user_id was logout. Bye $username",
				'LOG OUT',
				// $activity_datos
				array(
					'result'	=> 'quit',
					'cause'		=> $cause,
					'username'	=> $username,
					'mode'		=> $mode
				)
			);

		// Cookie properties
			$cookie_properties = get_cookie_properties();

		// Delete authorization cookie
			if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
				$cookie_auth = (object)$_SESSION['dedalo']['auth']['cookie_auth'];
				$ktoday 	 = date("Y_m_d");
				$kyesterday  = date("Y_m_d",strtotime("-1 day"));

				if (isset($cookie_auth->$ktoday->cookie_name)) {
					setcookie(
						$cookie_auth->$ktoday->cookie_name, // string $name
						'', // string $value
						-1, // int $expires_or_options
						'/', // string $path
						$cookie_properties->domain, // string $domain
						$cookie_properties->secure, // bool $secure
						$cookie_properties->httponly // bool $httponly
					);
				}
				if (isset($cookie_auth->$kyesterday->cookie_name)) {
					setcookie(
						$cookie_auth->$kyesterday->cookie_name, // string $name
						'', // string $value
						-1, // int $expires_or_options
						'/', // string $path
						$cookie_properties->domain, // string $domain
						$cookie_properties->secure, // bool $secure
						$cookie_properties->httponly// bool $httponly
					);
				}
			}

		// reset cookie and session
			#unset($_SESSION['dedalo']['auth']);
			#unset($_SESSION['dedalo']['config']);
			$cookie_name = session_name();
			setcookie(
				$cookie_name,
				'',
				-1,
				'/',
				$cookie_properties->domain,
				$cookie_properties->secure,
				$cookie_properties->httponly
			);

		// remove cookie dedalo_logged (used to check some features in same domain web)
			setcookie('dedalo_logged', 'false', 1, '/');

		// delete session
			unset($_SESSION['dedalo']);
			if (session_status() == PHP_SESSION_ACTIVE) {
				session_destroy();
			}

		// debug
			debug_log(__METHOD__
				." Unset session and cookie. cookie_name/session_name: $cookie_name "
				, logger::DEBUG
			);


		// saml logout
			if (defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
				# code...
			}

		return true;
	}//end Quit



	/**
	* LOGIN ACTIVITY REPORT
	* Save activity info into logger file
	* @param string $msg
	* @param string $login_label
	* @param array $activity_datos = null
	* @return void
	*/
	public static function login_activity_report(string $msg, string $login_label, array $activity_datos=null) : void {

		// data base
			$data = [
				'msg' => $msg
			];
			// append activity_datos if exists
			if(!empty($activity_datos) && is_array($activity_datos)) {
				$data = array_merge($data, $activity_datos);
			}

		// LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				$login_label,
				logger::INFO,
				self::get_login_tipo(),
				null,
				$data
			);
	}//end login_activity_report



	/**
	* CHECK_ROOT_HAS_DEFAULT_PASSWORD
	* Check if super user password (root) default has been changed or not
	* If is default password returns true, else false
	* @return bool
	*/
	public static function check_root_has_default_password() : bool {

		$component = component_common::get_instance(
			'component_password',
			DEDALO_USER_PASSWORD_TIPO,
			-1,
			'edit',
			DEDALO_DATA_NOLAN,
			DEDALO_SECTION_USERS_TIPO
		);
		$dato = $component->get_dato();

		if (is_null($dato)) {
			return true;
		}

		return false;
	}//end check_root_has_default_password



	/**
	* IS_DEVELOPER
	* Test if received user is developer
	* @param string|int $user_id
	*	Normally current logged user id
	* @return bool
	*/
		// public static function is_developer( string|int $user_id) : bool {

		// 	$user_id = (int)$user_id;

		// 	// Dedalo superuser case
		// 	if ($user_id==DEDALO_SUPERUSER) {
		// 		return true;
		// 	}

		// 	// Empty user_id
		// 	if ($user_id<1) {
		// 		return false;
		// 	}

		// 	// If request user_id is the same as current logged user, return session value, without access to component
		// 		// if ( isset($_SESSION['dedalo']['auth']['user_id']) && $user_id==$_SESSION['dedalo']['auth']['user_id'] ) {
		// 		// 	return (bool)$_SESSION['dedalo']['auth']['is_developer'];
		// 		// }

		// 	// Resolve from component data
		// 		$model		= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_USER_DEVELOPER_TIPO,true);
		// 		$component	= component_common::get_instance(
		// 			$model,
		// 			DEDALO_USER_DEVELOPER_TIPO,
		// 			$user_id,
		// 			'list',
		// 			DEDALO_DATA_NOLAN,
		// 			DEDALO_SECTION_USERS_TIPO
		// 		);
		// 		$dato = $component->get_dato();

		// 	// no data case
		// 		if (empty($dato)) {
		// 			return false;
		// 		}

		// 	// test radio button locator value
		// 		$locator = reset($dato); // value is always an array
		// 		if (isset($locator->section_id) && (int)$locator->section_id===1) {
		// 			return true;
		// 		}


		// 	return false;
		// }//end is_developer



	/**
	* GET_STRUCTURE_CONTEXT
	* @param int $permissions = 1
	* @param bool $add_request_config = false
	* @return dd_object $dd_object
	*/
	public function get_structure_context(int $permissions=1, bool $add_request_config=false) : dd_object {

		// short vars
			$model	= 'login';
			$tipo	= $this->get_tipo();
			$mode	= $this->get_mode();
			$label	= $this->get_label();
			$lang	= $this->get_lang();

		// properties
			$properties = $this->get_properties();
			if (empty($properties)) {
				$properties = new stdClass();
			}
			$properties->login_items = [];

			// login_items
				$children = RecordObj_dd::get_ar_childrens($tipo);
				foreach ($children as $children_tipo) {
					$item = (object)[
						'tipo'	=> $children_tipo,
						'model'	=> RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true),
						'label'	=> RecordObj_dd::get_termino_by_tipo($children_tipo, DEDALO_APPLICATION_LANG, true, true)
					];
					$properties->login_items[] = $item;
				}

		// Dedalo  info
			$properties->info   = [];
		// entity (from config)
			$properties->info[] = [
				'type'	=> 'dedalo_entity',
				'label'	=> 'Dédalo entity',
				'value'	=> DEDALO_ENTITY
			];
		// dedalo version
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Code version',
				'value'	=> DEDALO_VERSION
			];
		// build
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Code Build',
				'value'	=> DEDALO_BUILD
			];
		// dedalo data version
			$properties->info[] = [
				'type'	=> 'data_version',
				'label'	=> 'Data version',
				'value'	=> get_current_version_in_db()
			];
		// ontology version
			$properties->info[] = [
				'type'	=> 'version',
				'label'	=> 'Ontology version',
				'value'	=> RecordObj_dd::get_termino_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, true, true)
			];

		// development server only
			if (DEDALO_ENTITY==='development' && DEVELOPMENT_SERVER===true) {
				// database user (only developer)
					$properties->info[] = [
						'type'	=> 'db_user',
						'label'	=> 'DB user',
						'value'	=> DEDALO_USERNAME_CONN." -> ".DEDALO_DATABASE_CONN
					];
				// db info
					$properties->info[] = [
						'type'	=> 'db_user',
						'label'	=> 'DB info',
						'value'	=> DEDALO_DATABASE_CONN .' - '. DEDALO_HOSTNAME_CONN .' - '. DEDALO_USERNAME_CONN
					];
			}

		// demo user
		// Demo is an account used to open and public demo installation
		// if depends of the entity name, do not used in production.
			if(DEDALO_ENTITY==='dedalo_demo'){

				$demo_user = new stdClass();
					$demo_user->user	= 'dedalo';
					$demo_user->pw		= '76&_MbdCs3#17_Vhm';

				$properties->info[] = [
					'type'	=> 'demo_user',
					'label'	=> 'Demo user',
					'value'	=> $demo_user
				];
			}

		// dd_object
			$dd_object = new dd_object((object)[
				'label'			=> $label,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'lang'			=> $lang,
				'mode'			=> $mode,
				'properties'	=> $properties
			]);


		return $dd_object;
	}//end get_structure_context



}//end login class



class exec {
    /**
     * Run Application in background
     *
     * @param     unknown_type $Command
     * @param     unknown_type $Priority
     * @return     PID
     */
    function background($Command, $Priority = 0){
       if($Priority)
           $PID = shell_exec("nohup nice -n $Priority $Command > /dev/null & echo $!");
       else
           $PID = shell_exec("nohup $Command > /dev/null & echo $!");
       return($PID);
   }
   /**
    * Check if the Application running !
    *
    * @param     unknown_type $PID
    * @return     boolen
    */
   function is_running($PID){
       exec("ps $PID", $ProcessState);
       return(count($ProcessState) >= 2);
   }
   /**
    * Kill Application PID
    *
    * @param  unknown_type $PID
    * @return boolen
    */
   function kill($PID){
       if(exec::is_running($PID)){
           exec("kill -KILL $PID");
           return true;
       }else return false;
   }
}//end exec
