<?php
/*
* CLASS LOGIN
*
*
*/
class login extends common {

	protected $id;
	protected $tipo;
	protected $lang;
	protected $modo;

	protected $modelo;
	protected $tipo_active_account 	= 'dd131';
	protected $tipo_button_login 	= 'dd259';
	
	protected static $login_matrix_table = 'matrix';

	const SU_DEFAULT_PASSWORD = '';

	/**
	* __CONSTRUCT
	*/
	public function __construct($modo='edit') {

		$this->is_logged = self::is_logged();

		# CARGAMOS EL COMPONENTE
		if($this->is_logged === false) {

			$id 	= NULL;
			$tipo	= self::get_login_tipo();

			$this->define_id($id);
			$this->define_tipo($tipo);
			$this->define_lang(DEDALO_DATA_LANG);
			$this->define_modo($modo);

			parent::load_structure_data();
		}
	}//end __construct



	# define id
	protected function define_id($id) {	$this->id = $id ; }
	# define tipo
	protected function define_tipo($tipo) {	$this->tipo = $tipo ; }
	# define lang
	protected function define_lang($lang) {	$this->lang = $lang ; }
	# define modo
	protected function define_modo($modo) {	$this->modo = $modo ; }



	/**
	* LOGIN
	* @see Mandatory vars: 'username','password','tipo_login','tipo_username','tipo_password','tipo_active_account'
	* Get post vars and search received user/password in db
	* @return 'ok' / Error text
	*/
	public static function Login( $trigger_post_vars ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed [Login]';
	
		# Test mcrypt lib
		#if (!function_exists('mcrypt_encrypt')) {
		#	$response->msg = "Error Processing Request: MCRYPT lib is not available";
		#	return $response;
		#}

		# Mandatory vars
		$mandatoy_vars = array('username','password','tipo_login','tipo_password','tipo_active_account');
		foreach ($mandatoy_vars as $var_name) {
			if ( !array_key_exists($var_name, $trigger_post_vars) ) {
				#throw new Exception("Error Processing Request: var $var_name is mandatory!", 1);
				$response->msg = "Error Processing Request: var $var_name is mandatory!";
				return $response;
			}
			if ( empty($trigger_post_vars[$var_name])) {
				#throw new Exception("Error Processing Request: $var_name is empty!", 1);
				$response->msg = "Error Processing Request: $var_name is empty!";
				return $response;
			}
			if ($var_name==='password') {
				# Untouch var always
				$$var_name = $trigger_post_vars[$var_name];
			}else{
				# Check safe var
				$$var_name = safe_xss($trigger_post_vars[$var_name]);
			}
			
		}

		$html='';

		# Search username
		$arguments=array();
		$arguments["strPrimaryKeyName"] = 'section_id';
		$arguments["section_tipo"]  	= DEDALO_SECTION_USERS_TIPO;
		$current_data_version = tool_administration::get_current_version_in_db();
		# Username query
		$min_subversion = 22;
		if( $current_data_version[0] >= 5 ||
			($current_data_version[0] >= 4 && $current_data_version[1] >= 0 && $current_data_version[2] >= $min_subversion) || 
			($current_data_version[0] >= 4 && $current_data_version[1] >= 5) ||
			$current_data_version[0] > 4 ) {
			// Dato of component_input_text is array
			$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = json_encode((array)$username,JSON_UNESCAPED_UNICODE);
		}else{
			// Dato of component_input_text is string
			$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = $username;
		}
		$matrix_table 			= common::get_matrix_table_from_tipo(DEDALO_SECTION_USERS_TIPO);
		$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_USERS_TIPO);
		$ar_result				= (array)$JSON_RecordObj_matrix->search($arguments);


		if( !is_array($ar_result) || empty($ar_result[0]) ) {

			#
			# STOP: USERNAME NOT EXISTS
			#
			$activity_datos['result'] 	= "deny";
			$activity_datos['cause'] 	= "user not exist";
			$activity_datos['username']	= $username;

			# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
			self::login_activity_report(
				"Denied login attempted by: $username. This user does not exist in the database",
				NULL,
				'LOG IN',
				$activity_datos
				);
			# delay failed output after 2 seconds to prevent brute force attacks
	        sleep(2);
			#exit("Error: User $username not exists !");
			$response->msg = "Error: User not exists or password si invalid!";
			error_log("DEDALO LOGIN ERROR : Invalid user or password");
			return $response;

		}else if( count($ar_result)>1 ) {

			#
			# STOP: USERNAME DUPLICATED
			#
			$activity_datos['result'] 	= "deny";
			$activity_datos['cause'] 	= "user duplicated in database";
			$activity_datos['username']	= $username;

			# LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
			self::login_activity_report(
				"Denied login attempted by: $username. This user exist more than once in the database ".count($ar_result),
				NULL,
				'LOG IN',
				$activity_datos
				);
			# delay failed output after 2 seconds to prevent brute force attacks
	        sleep(2);
			#exit("Error: User $username not exists !");
			$response->msg = "Error: User ambiguous";
			error_log("DEDALO LOGIN ERROR : Invalid user or password. User ambiguous ($username)");
			return $response;

		}else{

			foreach($ar_result as $section_id) {

				$user_id = $section_id;
				
				# Search password
				$password_encrypted = component_password::encrypt_password($password);
				$component_password = component_common::get_instance('component_password',
																	 DEDALO_USER_PASSWORD_TIPO,
																	 $section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,DEDALO_SECTION_USERS_TIPO);
				$password_dato 		= $component_password->get_dato();
				
				if( $password_encrypted!==$password_dato ) {

					#
					# STOP : PASSWORD IS WRONG
					#
					$activity_datos['result'] 	= "deny";
					$activity_datos['cause'] 	= "wrong password";
					$activity_datos['username']	= $username;

					# LOGIN ACTIVITY REPORT
					self::login_activity_report(
						"Denied login attempted by: $username. Wrong password [1] (Incorrect password)",
						NULL,
						'LOG IN',
						$activity_datos
						);
					# delay failed output by 2 seconds to prevent brute force attacks
	        		sleep(2);
					
					$response->msg = "Error: Wrong password [1]";
					error_log("DEDALO LOGIN ERROR : Wrong password");
					return $response;
				}

				if( isset($password_dato) && strlen($password_dato) ) {

					// Active account check 
						$active_account = login::active_account_check($section_id);
					
						if( $active_account!==true ) {

							#
							# STOP : ACCOUNT INACTIVE
							#

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
								NULL,
								'LOG IN',
								// activity_datos
								array(
									'result' 	=> 'deny',
									'cause' 	=> 'account inactive',
									'username' 	=> $username
								)
							);


							# delay failed output by 2 seconds to prevent brute force attacks
							sleep(2);
							#exit("Error: Account inactive or not defined [1]");
							$response->msg = "Error: Account inactive or not defined [1]";
							error_log("DEDALO LOGIN ERROR : Account inactive");
							return $response;
						}

					// Is global admin
						$is_global_admin = component_security_administrator::is_global_admin($user_id);

					// Profile / projects check
						if($is_global_admin!==true) {
							
							#
							# PROFILE							
								$user_have_profile = login::user_have_profile_check($user_id);
								if ($user_have_profile!==true) {
									$response->msg = label::get_label('error_usuario_sin_perfil');
									return $response;
								}

							#
							# PROJECTS : TEST FILTER MASTER VALUES
								$user_have_projects = login::user_have_projects_check($user_id);
								if ($user_have_projects!==true) {
									$response->msg = label::get_label('error_usuario_sin_proyectos');
									return $response;
								}

						}//end if(!component_security_administrator::is_global_admin($user_id))

					// Full_username
						$full_username = login::get_full_username($user_id);
					
					// Login (all is ok) - init login secuence when all is ok
						$init_user_login_secuence = login::init_user_login_secuence($user_id, $username, $full_username);
						if ($init_user_login_secuence->result===false) {
							# RETURN FALSE
							$response->result = false;
							$response->msg 	  = $init_user_login_secuence->msg;
							$response->errors = isset($init_user_login_secuence->errors) ? $init_user_login_secuence->errors : [];
						}else if($init_user_login_secuence->result===true) {
							# RETURN OK AND RELOAD PAGE
							$response->result = true;
							$response->msg 	  = " Login.. ";
							$response->errors = isset($init_user_login_secuence->errors) ? $init_user_login_secuence->errors : [];
						}

				}//end if(isset($ar_password_id[0])

			}#if( is_array($ar_result) ) foreach($ar_result as $section_id)

		}//if( !is_array($ar_result) || count($ar_result)==0 || empty($ar_result[0]) )


		return (object)$response;
	}//end Login



	/**
	* LOGIN_SAML
	* @param object $request_options
	* @return object $response
	*/
	public static function Login_SAML($request_options) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= __METHOD__.' Error. Request failed';
		
		$options = new stdClass();
			$options->code = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// IP validation
			if (!empty(SAML_CONFIG['idp_ip'])) {
				$client_ip = common::get_client_ip();
				if (!in_array($client_ip, SAML_CONFIG['idp_ip'])) {
					$response->msg = "Error. Invalid client IP !";
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
							if ($_SESSION['dedalo4']['auth']['user_id']==$section_id) {
								# Logged as same user
								$response->result = true;
								$response->msg 	  = " User already logged. ";
								return $response;
							}else{
								# Logged as different user
								login::Quit(array(
									'mode' => 'saml',
									'cause'=> 'Browser already logged as different user'
								)); // Logout old user before continue login 
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
								"Denied login attempted by username: $username, id: $section_id. Account inactive or not defined [1]",
								NULL,
								'LOG IN',
								// activity_datos
								array(
									'result' 	=> 'deny',
									'cause' 	=> 'account inactive',
									'username' 	=> $username
								)
							);

							# delay failed output by 2 seconds to prevent brute force attacks
							sleep(2);
							$response->msg = "Error: Account inactive or not defined [1]";
							error_log("DEDALO LOGIN ERROR : Account inactive");
							return $response;
						}

					// Is global admin
						$is_global_admin = component_security_administrator::is_global_admin($section_id);

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
									$response->msg = label::get_label('error_usuario_sin_proyectos');
									return $response;
								}

						}//end if(!component_security_administrator::is_global_admin($section_id))					
					
					// LOGIN (ALL IS OK) - INIT LOGIN SECUENCE WHEN ALL IS OK
						
						// User name
							$username = login::get_username($section_id);

						// Full username
							$full_username = login::get_full_username($section_id);

						// init_user_login_secuence
							$init_user_login_secuence = login::init_user_login_secuence($section_id, $username, $full_username, $init_test=false, 'saml');
							if ($init_user_login_secuence->result===false) {
								# RETURN FALSE
								$response->result = false;
								$response->msg 	  = $init_user_login_secuence->msg;
								$response->errors = isset($init_user_login_secuence->errors) ? $init_user_login_secuence->errors : [];
							}else if($init_user_login_secuence->result===true) {
								# RETURN OK AND RELOAD PAGE
								$response->result = true;
								$response->msg 	  = " Login.. ";
								$response->errors = isset($init_user_login_secuence->errors) ? $init_user_login_secuence->errors : [];
							}
			}else{

				// Error
					#
					# STOP: CODE NOT EXISTS
					#

					// LOGIN ACTIVITY REPORT ($msg, $projects=NULL, $login_label='LOG IN', $ar_datos=NULL)
						self::login_activity_report(
							"Denied login attempted by: saml_user. This code does not exist in the database",
							NULL,
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
			        sleep(2);					
					$response->msg = label::get_label('error_el_codigo_de_usuario_no_existe'); # "Error: User Code not exists! Please try again";
					error_log("DEDALO LOGIN ERROR : Invalid saml code");
					return $response;			
			}
	

		return $response;
	}//end Login_SAML



	/**
	* GET_USERNAME
	* @param int $section_id (is user section id)
	* @return string $full_username
	*/
	public static function get_username($section_id) {

		$component = component_common::get_instance('component_input_text',
													DEDALO_USER_NAME_TIPO,
													$section_id,
													'list',
													DEDALO_DATA_NOLAN,
													DEDALO_SECTION_USERS_TIPO);
		$username = $component->get_valor();

		return $username;
	}//end get_username



	/**
	* GET_FULL_USERNAME
	* @param int $section_id (is user section id)
	* @return string $full_username
	*/
	public static function get_full_username($section_id) {

		$component = component_common::get_instance('component_input_text',
													DEDALO_FULL_USER_NAME_TIPO,
													$section_id,
													'list',
													DEDALO_DATA_NOLAN,
													DEDALO_SECTION_USERS_TIPO);
		$full_username = $component->get_valor();

		return $full_username;
	}//end get_full_username



	/**
	* ACTIVE_ACCOUNT_CHECK
	* @param int $section_id
	* @return bool
	*/
	public static function active_account_check($section_id) {

		$active_account = false; // Default false
		
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_CUENTA_ACTIVA_TIPO,true);
		$component_radio_button = component_common::get_instance($modelo_name,
																 DEDALO_CUENTA_ACTIVA_TIPO,
																 $section_id,
																 'edit',
																 DEDALO_DATA_NOLAN,
																 DEDALO_SECTION_USERS_TIPO);
		$cuenta_activa_dato 	= $component_radio_button->get_dato();

		# OJO: El valor válido sólo puede ser 1 que es 'Si' en la lista de valores referenciada y se asigna como constante en config 'NUMERICAL_MATRIX_VALUE_YES'
		if (isset($cuenta_activa_dato[0]) && isset($cuenta_activa_dato[0]->section_id) && $cuenta_activa_dato[0]->section_id==NUMERICAL_MATRIX_VALUE_YES) {
			
			$active_account = true;
		}

		return (bool)$active_account;
	}//end active_account_check



	/**
	* USER_HAVE_PROFILE_CHECK
	* @param int $section_id
	* @return bool
	*/
	public static function user_have_profile_check($section_id) {

		$user_have_profile = false; // Default false
		
		$component_profile 		  = component_common::get_instance('component_profile',
																	DEDALO_USER_PROFILE_TIPO,
																	$section_id,
																	'list',
																	DEDALO_DATA_NOLAN,
																	DEDALO_SECTION_USERS_TIPO);
		$profile_dato = (int)$component_profile->get_dato();
		if (!empty($profile_dato) && $profile_dato>0) {
			
			$user_have_profile = true;
		}

		return (bool)$user_have_profile;
	}//end user_have_profile_check



	/**
	* USER_HAVE_PROJECTS_CHECK
	* @param int $section_id
	* @return bool
	*/
	public static function user_have_projects_check($section_id) {

		$user_have_projects = false; // Default false
		
		$component_filter_master 	= component_common::get_instance('component_filter_master',
																	 DEDALO_FILTER_MASTER_TIPO,
																	 $section_id,
																	 'list',
																	 DEDALO_DATA_LANG,
																	 DEDALO_SECTION_USERS_TIPO); 
		$filter_master_dato 		= (array)$component_filter_master->get_dato();
		if (!empty($filter_master_dato) && count($filter_master_dato)>0) {
			
			$user_have_projects = true;
		}

		return (bool)$user_have_projects;
	}//end user_have_projects_check



	/**
	* REST_LOGIN
	* Special login for rest users. $auth_code and source ip are verified for security
	* @param stdClass $options
	*		options->source_ip Optional
	*		options->auth_code Mandatory
	* @return object $response
	*/
	public static function rest_login( stdClass $options ) {
		global $rest_config;
		#unset($_SESSION['dedalo4']);
		
		$response = new stdClass();


		if ( !property_exists($options, 'source_ip') ) {
			$options->source_ip = $_SERVER['REMOTE_ADDR'];
		}
	
		if ( !property_exists($options, 'auth_code') || $options->auth_code!=$rest_config->auth_code ) {
			$response->logged 	= false;
			$response->msg 		= 'Invalid auth_code';
			return $response;
		}

		if ( !property_exists($options, 'source_ip') || !in_array($options->source_ip, (array)$rest_config->source_ip) ) {
			$response->logged 	= false;
			$response->msg 		= 'Invalid source';
			return $response;
		}

		# Is already logged? If yes, return true and no activity log is generated again
		if ( 
			isset($_SESSION['dedalo4']['auth']['user_id']) && 
			$_SESSION['dedalo4']['auth']['user_id']==$rest_config->user_id &&
			($_SESSION['dedalo4']['auth']['is_logged']==1) 
		 ) {
			$response->logged 	= true;
			$response->msg 		= 'User is already logged';
			return $response;
		}

		$_SESSION['dedalo4']['auth']['user_id']		= $rest_config->user_id;
		$_SESSION['dedalo4']['auth']['username']	= $rest_config->user;
		$_SESSION['dedalo4']['auth']['is_logged']	= 1;

		# CONFIG KEY
		$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encrypt_openssl(DEDALO_SALT_STRING);


		#
		# LOGIN ACTIVITY REPORT
		$activity_datos['result'] 	= "allow";
		$activity_datos['cause'] 	= "rest_login";
		if (isset($_SERVER['REQUEST_URI']))
		$activity_datos['url'] 		= urldecode( 'http://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'] );		
		if (isset($_SERVER['HTTP_REFERER']))
		$activity_datos['referer'] 	= $_SERVER['HTTP_REFERER'];
		if (property_exists($options, 'activity_info')) {
			$activity_datos['activity_info'] = $options->activity_info;
		}
		
		self::login_activity_report(
			"User $rest_config->user_id is logged. Hello $rest_config->user",
			null,
			'LOG IN',
			$activity_datos
			);


		$response->logged 	= true;
		$response->msg 		= 'Logged successfully';
		return $response;
	}#rest_login
	


	/**
	* INIT_USER_LOGIN_SECUENCE
	* Init login secuence when all is ok
	* @param int $user_id
	* @param string $username
	* @return bool 
	*/
	private static function init_user_login_secuence($user_id, $username, $full_username, $init_test=true, $login_type='default') {

		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 	 	= 'Error on init_user_login_secuence';
			$response->errors 	= [];

		#ob_implicit_flush(true);
		
		# RESET ALL SESSION VARS BEFORE INIT
		#if(isset($_SESSION)) foreach ($_SESSION as $key => $value) {
			# Nothint to delete
		#}	
		
		# DEDALO INIT TEST SECUENCE
		if ($init_test===true) {
			require(DEDALO_LIB_BASE_PATH.'/config/dd_init_test.php');
			if ($init_response->result===false) {
				debug_log(__METHOD__." Init test error: ".$init_response->msg.to_string(), logger::ERROR);
				// Don't stop here. Only inform user of init error via jasvascript 
					# $response->result 	= false;
					# $response->msg 		= $init_response->msg;
					# return $response;
				$response->errors[] = $init_response->msg;
			}
		}

		// IS_GLOBAL_ADMIN (before set user session vars)
			$_SESSION['dedalo4']['auth']['is_global_admin'] = (bool)component_security_administrator::is_global_admin($user_id);
		
		// IS_DEVELOPER (before set user session vars)
			$_SESSION['dedalo4']['auth']['is_developer'] 	= (bool)login::is_developer($user_id);

		// SESSION : If backup is ok, fix session data
			$_SESSION['dedalo4']['auth']['user_id']			= $user_id;
			$_SESSION['dedalo4']['auth']['username']		= $username;
			$_SESSION['dedalo4']['auth']['full_username'] 	= $full_username;
			$_SESSION['dedalo4']['auth']['is_logged']		= 1;

		// CONFIG KEY
			$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encrypt_openssl(DEDALO_SALT_STRING);

		// login_type
			$_SESSION['dedalo4']['auth']['login_type']  = $login_type;			

		# Auth cookie
		if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
			self::init_cookie_auth();
		}

		# BACKUP ALL
		if( DEDALO_BACKUP_ON_LOGIN ) {
			require(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
			$backup_secuence_response = backup::init_backup_secuence($user_id, $username);
			$backup_info = $backup_secuence_response->msg;
		}else{
			$backup_info = 'Deactivated "on login backup" for this domain';
		}

		
		try {
			
			# REMOVE LOCK_COMPONENTS ELEMENTS
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

			# GET ENTITY DIFFUSION TABLES / SECTIONS . Store for speed
			# $entity_diffusion_tables = diffusion::get_entity_diffusion_tables(DEDALO_DIFFUSION_DOMAIN);
			# $_SESSION['dedalo4']['config']['entity_diffusion_tables'] = $entity_diffusion_tables;

		} catch (Exception $e) {
			debug_log(__METHOD__." $e ", logger::CRITICAL);
		}
		


		# LOG : Prepare and save login action
		$browser = $_SERVER["HTTP_USER_AGENT"];
		if (strpos($browser, 'AppleWebKit')===false) $browser = "<i style='color:red'>$browser</i>";

		$activity_datos['result'] 	= "allow";
		$activity_datos['cause'] 	= "correct user and password";
		$activity_datos['username']	= $username;
		$activity_datos['browser']	= $browser;
		$activity_datos['DB-backup']= $backup_info;

		# LOGIN ACTIVITY REPORT
		self::login_activity_report(
			"User $user_id is logged. Hello $username",
			null,
			'LOG IN',
			$activity_datos
			);

		$response->result 	= true;
		$response->msg 	 	= 'Ok init_user_login_secuence is done';

		
		return $response;
	}//end init_user_login_secuence



	/**
	* INIT_COOKIE_AUTH
	* @return bool true
	*/
	private static function init_cookie_auth() {

		$cookie_name  = self::get_auth_cookie_name();
		$cookie_value = self::get_auth_cookie_value();

		$current = '';
		$previous= '';
	
		$ktoday 	= date("Y_m_d");
		$kyesterday = date("Y_m_d",strtotime("-1 day"));

		$cookie_file 		= DEDALO_EXTRAS_PATH.'/media_protection/cookie/cookie_auth.php';
		$cookie_file_exists = file_exists($cookie_file);
		if ($cookie_file_exists===true) {

			$current_file = file_get_contents($cookie_file);
			$ar_data 	  = json_decode($current_file);
		}

		if ( $cookie_file_exists===true && isset($ar_data->$ktoday) && isset($ar_data->$kyesterday) ) {
			
			$data = $ar_data;
			debug_log(__METHOD__." data 1 Recycle ".to_string($data), logger::DEBUG);
		
		}else{

			$data = new stdClass();

			$ktoday_data = new stdClass();
				$ktoday_data->cookie_name  = $cookie_name;
				$ktoday_data->cookie_value = $cookie_value;

			$data->$ktoday = $ktoday_data;

			if (isset($ar_data->$kyesterday)) {
				$data->$kyesterday = $ar_data->$kyesterday;
			}else{

				$kyesterday_data = new stdClass();
					$kyesterday_data->cookie_name  = self::get_auth_cookie_name();
					$kyesterday_data->cookie_value = self::get_auth_cookie_value();

				$data->$kyesterday = $kyesterday_data; 
			}					
			# File cookie data
			if( !file_put_contents($cookie_file, json_encode($data)) ){
				throw new Exception("Error Processing Request. Media protecction error on create cookie_file", 1);
			}

			debug_log(__METHOD__." data 2 New data ".to_string($data), logger::DEBUG);

			# APACHE 2.2
				# $htaccess_text  = '';

				# $htaccess_text .= '# Protect files and directories from prying eyes.'.PHP_EOL;
				# $htaccess_text .= '<FilesMatch "\.(deleted|sh|temp|tmp|import)$">'.PHP_EOL;
	  			# $htaccess_text .= 'Order allow,deny'.PHP_EOL;
				# $htaccess_text .= '</FilesMatch>'.PHP_EOL;

				# $htaccess_text .= '# Protect media files with realm'.PHP_EOL;
				# $htaccess_text .= 'AuthType Basic'.PHP_EOL;
				# $htaccess_text .= 'AuthName "Protected Login"'.PHP_EOL;
				# $htaccess_text .= 'AuthUserFile ".htpasswd"'.PHP_EOL;
				# $htaccess_text .= 'AuthGroupFile "/dev/null"'.PHP_EOL;
				# $htaccess_text .= 'SetEnvIf Cookie '.$data->$ktoday->cookie_name.'='.$data->$ktoday->cookie_value.' PASS=1'.PHP_EOL;
				# $htaccess_text .= 'SetEnvIf Cookie '.$data->$kyesterday->cookie_name.'='.$data->$kyesterday->cookie_value.' PASS=1'.PHP_EOL;
				# $htaccess_text .= 'Order deny,allow'.PHP_EOL;
				# $htaccess_text .= 'Deny from all'.PHP_EOL;
				# $htaccess_text .= 'Allow from env=PASS'.PHP_EOL;
				# $htaccess_text .= 'Require valid-user'.PHP_EOL;
				# $htaccess_text .= 'Satisfy any'.PHP_EOL;
			

			# APACHE 2.4
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
			# Require any sentence
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
			$htaccess_file = DEDALO_MEDIA_BASE_PATH.'/.htaccess';
			if( !file_put_contents($htaccess_file, $htaccess_text) ){
				# Remove cookie file (cookie_file.php)
				unlink($cookie_file);
				# Launch Exception
				throw new Exception("Error Processing Request. Media protecction error on create access file", 1);
			}	
		}			

		$_SESSION['dedalo4']['auth']['cookie_auth'] = $data;	
		# SET COOKIE		
		$cookie_properties = common::get_cookie_properties();
		#setcookie($data->$ktoday->cookie_name, $data->$ktoday->cookie_value, time() + (86400 * 1), '/'); // 86400 = 1 day
		setcookie($data->$ktoday->cookie_name, $data->$ktoday->cookie_value, time() + (86400 * 1), '/', $cookie_properties->domain, $cookie_properties->secure, $cookie_properties->httponly);

		return true;
	}//end init_cookie_auth



	/**
	* GET_AUTH_COOKIE_NAME
	* @return string $cookie_name
	*/
	private static function get_auth_cookie_name() {
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
	private static function get_auth_cookie_value() {
		$date = getdate();
		#$cookie_value = md5( 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. mt_rand() );
		$cookie_value = hash('sha512', 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. random_bytes(8) );

	    return $cookie_value;
	}//end get_auth_cookie_value



	/**
	* IS_LOGGED
	* Test if current user is logged (alias of verify_login)
	* @see login::verify_login
	* @return bool (true/false)
	*/
	public static function is_logged() {
		return self::verify_login();
	}


	/**
	* VERIFY_LOGIN
	* Comprueba que el usuario está autentificado
	* @return bool (true/false)
	*/
	private static function verify_login() {
		#global $maintenance_mode;
		#debug_log(__METHOD__." maintenance_mode ".to_string($maintenance_mode), logger::DEBUG);

		# NO ESTÁ AUTENTIFICADO
		if( empty($_SESSION['dedalo4']['auth']['user_id']) || 
			empty($_SESSION['dedalo4']['auth']['is_logged']) || 
			$_SESSION['dedalo4']['auth']['is_logged'] !== 1 || 
			empty($_SESSION['dedalo4']['auth']['salt_secure']) 
			) {
			
			
			if (empty($_SESSION['dedalo4']['auth']['user_id'])) {

				# Store current lang for not loose
				$dedalo_application_lang = isset($_SESSION['dedalo4']['config']['dedalo_application_lang']) ? $_SESSION['dedalo4']['config']['dedalo_application_lang'] : false;
				$dedalo_data_lang 		 = isset($_SESSION['dedalo4']['config']['dedalo_data_lang']) ? $_SESSION['dedalo4']['config']['dedalo_data_lang'] : false;
            
				# remove complete session
				unset($_SESSION['dedalo4']);

				# Restore langs
				if ($dedalo_application_lang) {
					$_SESSION['dedalo4']['config']['dedalo_application_lang'] = $dedalo_application_lang;
				}
				if ( $dedalo_data_lang) {
					$_SESSION['dedalo4']['config']['dedalo_data_lang'] 		  = $dedalo_data_lang;
				}				
			}

			return false;

		# SI ESTÁ UTENTIFICADO
		}else{

			#if( $_SESSION['dedalo4']['auth']['salt_secure'] != '7PVecu9VSxLHnawfGF2oDCISXvsq2khsOKvPiTJ_D7a_wVaxqQwzRJElPxsecePnFzmrP34RIG0J0ykg3Mbobg,,') {
			#	throw new Exception("Error Login: Incorrect security config", 1);
			#	return false;
			#}

			return true;
		}
	}//end verify_login



	/**
	* GET_LOGIN_TIPO
	*/
	private static function get_login_tipo() {

		$ar_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name($modelo_name='login', $prefijo='dd');

		if(!empty($ar_tipo[0]))
		return $ar_tipo[0];

		return null;
	}//end get_login_tipo



	/**
	* GET HTML CODE .
	* Return include file __class__.php
	*/
	public function get_html() {

		$file_include	= DEDALO_LIB_BASE_PATH .'/'. __CLASS__ . '/' . __CLASS__ . '.php' ;

		ob_start();
		include ( $file_include );
		$html =  ob_get_clean();
		

		return $html;
	}//end get_html



	/**
	* QUIT
	* Made logout
	*/
	public static function Quit($request_options) {

		$options = new stdClass();
			$options->mode 	= null;
			$options->cause = 'called quit method';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		if (self::is_logged()!==true) {
			return false;
		}

		$user_id  = $_SESSION['dedalo4']['auth']['user_id'];
		$username = $_SESSION['dedalo4']['auth']['username'];

		// LOCK_COMPONENTS. Remove lock_components elements
			if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
				lock_components::force_unlock_all_components($user_id);
			}

		// LOGIN ACTIVITY REPORT
			self::login_activity_report(
				"User $user_id was logout. Bye $username",
				null,
				'LOG OUT',
				// $activity_datos
				array(
					'result' 	=> 'quit',
					'cause' 	=> $options->cause,
					'username' 	=> $username,
					'mode' 		=> $options->mode
				)
			);

		// Cookie properties
			$cookie_properties = common::get_cookie_properties();

		// Delete auth cookie
			if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
				$cookie_auth = (object)$_SESSION['dedalo4']['auth']['cookie_auth'];
				$ktoday 	 = date("Y_m_d");
				$kyesterday  = date("Y_m_d",strtotime("-1 day"));
		
				if (isset($cookie_auth->$ktoday->cookie_name)) {
					#setcookie($cookie_auth->$ktoday->cookie_name, null, -1, '/');
					setcookie($cookie_auth->$ktoday->cookie_name, null, -1, '/', $cookie_properties->domain, $cookie_properties->secure, $cookie_properties->httponly);
				}
				if (isset($cookie_auth->$kyesterday->cookie_name)) {
					#setcookie($cookie_auth->$kyesterday->cookie_name, null, -1, '/');
					setcookie($cookie_auth->$kyesterday->cookie_name, null, -1, '/', $cookie_properties->domain, $cookie_properties->secure, $cookie_properties->httponly);
				}
			}

		#unset($_SESSION['dedalo4']['auth']);
		#unset($_SESSION['dedalo4']['config']);
		$cookie_name = session_name();
		unset($_SESSION['dedalo4']);
		#setcookie($cookie_name, null, -1, '/');
		setcookie($cookie_name, null, -1, '/', $cookie_properties->domain, $cookie_properties->secure, $cookie_properties->httponly);
		#unset($_SESSION);
		debug_log(__METHOD__." Unset session and cookie. cookie_name: $cookie_name ".to_string(), logger::DEBUG);

		// SAML LOGOUT
			if (defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
				# code...
			}

		return true;
	}//end Quit



	/**
	* LOGIN ACTIVITY REPORT
	*/
	public static function login_activity_report($msg, $projects=NULL, $login_label='LOG IN', $activity_datos=NULL) {

		$datos = array("msg" => $msg);

		if(!empty($activity_datos) && is_array($activity_datos))
			$datos = array_merge($datos, $activity_datos);

		# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			$login_label,
			logger::INFO,
			self::get_login_tipo(),
			null,
			$datos
		);
	}//end login_activity_report



	/**
	* TEST_SU_DEFAULT_PASSWORD
	* Check if admin user password default has ben changed or not
	* If is fefault password returns true, else false
	* @return bool true/false 
	*/
	public function test_su_default_password() {
	
		$component  = component_common::get_instance('component_password',
													 DEDALO_USER_PASSWORD_TIPO,
													 -1,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 DEDALO_SECTION_USERS_TIPO);
		$dato = $component->get_dato();		

		if ($dato==='') {
			return true;
		}		

		return false;
	}//end test_su_default_password



	/**
	* IS_DEVELOPER
	* Test if received user is developer
	* @param $user_id
	*	Normally current logged user id
	* @return bool
	*/
	public static function is_developer($user_id) {

		$is_developer = false;
		
		$user_id = (int)$user_id;

		# Dedalo superuser case
		if ($user_id===DEDALO_SUPERUSER) return true;
	
		# Empty user_id
		if ($user_id<1) return false;

		# If request user_id is the same as current logged user, return session value, without acces to component
		if ( isset($_SESSION['dedalo4']['auth']['user_id']) && $user_id==$_SESSION['dedalo4']['auth']['user_id'] ) {
			#return (bool)$_SESSION['dedalo4']['auth']['is_developer'];
		}

		# Resolve from component
		$component 	 = component_common::get_instance('component_radio_button',
													   DEDALO_USER_DEVELOPER_TIPO,
													   $user_id,
													   'edit',
													   DEDALO_DATA_NOLAN,
													   DEDALO_SECTION_USERS_TIPO);
		$dato = $component->get_dato();
	
		if (empty($dato)) {
			return false;
		}

		# test radio button locator value
		$locator = reset($dato); # value is always an array
		if (isset($locator->section_id) && (int)$locator->section_id===1) {
			$is_developer = true;
		}
	

		return $is_developer;
	}//end is_developer



}//end login
?>