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
	protected $tipo_active_account;
	protected $ar_components;

	protected static $login_matrix_table = 'matrix';

	const SU_DEFAULT_PASSWORD = ''; //Dedalo4debugChangePsW


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
	}


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
		if (!function_exists('mcrypt_encrypt')) die("Error Processing Request: MCRYPT lib is not available");

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
			$$var_name = $trigger_post_vars[$var_name];
		}

		$html='';

		# Search username
		$arguments=array();
		$arguments["strPrimaryKeyName"] = 'section_id';
		$arguments["section_tipo"]  	= DEDALO_SECTION_USERS_TIPO;
		$current_version = tool_administration::get_current_version_in_db();
		# Username query
		$min_subversion = 22;
		if( ($current_version[0] >= 4 && $current_version[1] >= 0 && $current_version[2] >= $min_subversion) || 
			($current_version[0] >= 4 && $current_version[1] >= 5) ||
			$current_version[0] > 4 ) {
			// Dato of component_input_text is array
			$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = json_encode((array)$username,JSON_UNESCAPED_UNICODE);
		}else{
			// Dato of component_input_text is string
			$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = $username;
		}
		$matrix_table 			= common::get_matrix_table_from_tipo(DEDALO_SECTION_USERS_TIPO);
		$JSON_RecordObj_matrix	= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_USERS_TIPO);
		$ar_result				= (array)$JSON_RecordObj_matrix->search($arguments);

		if( !is_array($ar_result) || empty($ar_result[0])  ) {

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
			# delay failed output after 2 seconds to prevent bruit force attacks
	        sleep(2);
			#exit("Error: User $username not exists !");
			$response->msg = "Error: User $username not exists !";
			return $response;

		}else{

			foreach($ar_result as $section_id) {
				
				# Search password
				$password_encrypted = component_password::encrypt_password($password);
				$component_password = component_common::get_instance('component_password', DEDALO_USER_PASSWORD_TIPO, $section_id, 'edit', DEDALO_DATA_NOLAN,DEDALO_SECTION_USERS_TIPO);					
				$password_dato 		= $component_password->get_dato();
					#dump($component_password,"component_password ");die();
					#dump($password_dato,"password_dato:$password_dato -  password_encrypted:$password_encrypted");die(" die en login");
				
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
					# delay failed output by 2 seconds to prevent bruit force attacks
	        		sleep(2);
					#exit("Error: Wrong password [1]");
					$response->msg = "Error: Wrong password [1]";
					return $response;
				}

				if( isset($password_dato) && strlen($password_dato) ) {
						
					##
					# Verificamos si la cuenta está activa
						$component_radio_button = component_common::get_instance('component_radio_button',DEDALO_CUENTA_ACTIVA_TIPO,$section_id,'edit',DEDALO_DATA_NOLAN,DEDALO_SECTION_USERS_TIPO);
						$cuenta_activa_dato 	= $component_radio_button->get_dato();
							#dump($cuenta_activa_dato,"cuenta_activa_dato");die();

						# OJO: El valor válido sólo puede ser 1 que es 'Si' en la lista de valores referenciada y se asigna como constante en config 'NUMERICAL_MATRIX_VALUE_YES'
						if( empty($cuenta_activa_dato[0]) || !isset($cuenta_activa_dato[0]->section_id) || $cuenta_activa_dato[0]->section_id!=NUMERICAL_MATRIX_VALUE_YES ) {

							#
							# STOP : ACCOUNT INACTIVE
							#
							$activity_datos['result'] 	= "deny";
							$activity_datos['cause'] 	= "account inactive";
							$activity_datos['username']	= $username;

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"Denied login attempted by: $username. Account inactive or not defined [1]",
								NULL,
								'LOG IN',
								$activity_datos
								);

							# delay failed output by 2 seconds to prevent bruit force attacks
	        				sleep(2);
							#exit("Error: Account inactive or not defined [1]");
							$response->msg = "Error: Account inactive or not defined [1]";
							return $response;
						}

						$user_id = $section_id;

						# No para global admin					
						if(!component_security_administrator::is_global_admin($user_id)) {
							#dump(component_security_administrator::is_global_admin($user_id),"is_global_admin $user_id");
							# USER : TEST SECURITY AREAS VALUES
							/*
							# Comprobamos que el usuario tiene algún área asignada antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_security_areas 	= component_common::get_instance('component_security_areas', DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO, $user_id, 'edit', DEDALO_DATA_LANG,DEDALO_SECTION_USERS_TIPO);
							$security_areas_dato 		= (object)$component_security_areas->get_dato();
								#dump($security_areas_dato,"security_areas_dato $user_id"); die();
							if (empty($security_areas_dato) || count((array)$security_areas_dato)<1) {
								exit(label::get_label('error_usuario_sin_areas'));
							}
							*/
							$component_profile 		  = component_common::get_instance('component_profile',
																						DEDALO_USER_PROFILE_TIPO,
																						$user_id,
																						'edit',
																						DEDALO_DATA_NOLAN,
																						DEDALO_SECTION_USERS_TIPO);
							$profile_dato 	  		  = $component_profile->get_dato();
								#dump($profile_dato,"profile_dato $user_id"); die();
							if (empty($profile_dato) || $profile_dato<1) {
								#exit(label::get_label('error_usuario_sin_perfil'));
								$response->msg = label::get_label('error_usuario_sin_perfil');
								return $response;
							}


							# USER : TEST FILTER MASTER VALUES
							# Comprobamos que el usuario tiene algún proyecto asignado antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_filter_master 	= component_common::get_instance('component_filter_master',
																						 DEDALO_FILTER_MASTER_TIPO,
																						 $user_id,
																						 'edit',
																						 DEDALO_DATA_LANG, DEDALO_SECTION_USERS_TIPO); 
							$filter_master_dato 		= (array)$component_filter_master->get_dato();								
							if (empty($filter_master_dato) || count($filter_master_dato)<1) {
								#exit(label::get_label('error_usuario_sin_proyectos'));
								$response->msg = label::get_label('error_usuario_sin_proyectos');
								return $response;
							}
						}

					#
					# FULL_USERNAME
					$component = component_common::get_instance('component_input_text',
																DEDALO_FULL_USER_NAME_TIPO,
																$user_id,
																'edit',
																DEDALO_DATA_NOLAN,
																DEDALO_SECTION_USERS_TIPO);
					$full_username = $component->get_valor();						
	
					#
					# LOGIN (ALL IS OK) - INIT LOGIN SECUENCE WHEN ALL IS OK					
					$init_user_login_secuence = login::init_user_login_secuence($user_id, $username, $full_username);


					# RETURN OK AND RELOAD PAGE
					$response->result = true;
					$response->msg = " Login.. ";				

				}#if(isset($ar_password_id[0])

			}#if( is_array($ar_result) ) foreach($ar_result as $section_id)

		}#if( !is_array($ar_result) || count($ar_result)==0 || empty($ar_result[0]) )


		return (object)$response;
	}#end Login



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
	private static function init_user_login_secuence($user_id, $username, $full_username) {

		#ob_implicit_flush(true);
		
		# RESET ALL SESSION VARS BEFORE INIT
		#dump($_SESSION,'$_SESSION');		
		#if(isset($_SESSION)) foreach ($_SESSION as $key => $value) {
			# Nothint to delete
		#}	
		
		# IS_GLOBAL_ADMIN (before set user session vars)
		$_SESSION['dedalo4']['auth']['is_global_admin'] = (bool)component_security_administrator::is_global_admin($user_id);
		# IS_DEVELOPER (before set user session vars)
		$_SESSION['dedalo4']['auth']['is_developer'] 	= (bool)login::is_developer($user_id);

		# SESSION : If backup is ok, fix session data
		$_SESSION['dedalo4']['auth']['user_id']			= $user_id;
		$_SESSION['dedalo4']['auth']['username']		= $username;
		$_SESSION['dedalo4']['auth']['full_username'] 	= $full_username;
		$_SESSION['dedalo4']['auth']['is_logged']		= 1;


		# CONFIG KEY
		$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encrypt_openssl(DEDALO_SALT_STRING);


		# DEDALO INIT TEST SECUENCE
		require(DEDALO_LIB_BASE_PATH.'/config/dd_init_test.php');
		

		# Auth cookie
		if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
			self::init_cookie_auth();
		}

		# BACKUP ALL
		if( DEDALO_BACKUP_ON_LOGIN ) {
			require(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
			$backup_info = backup::init_backup_secuence($user_id, $username);
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
		
		return true;
	}#end init_user_login_secuence



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

		$cookie_file = DEDALO_EXTRAS_PATH.'/media_protection/cookie/cookie_auth.php';
		if ($cookie_file_exists  = file_exists($cookie_file)) {
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

			/* APACHE 2.2
				$htaccess_text  = '';

				$htaccess_text .= '# Protect files and directories from prying eyes.'.PHP_EOL;
				$htaccess_text .= '<FilesMatch "\.(deleted|sh|temp|tmp|import)$">'.PHP_EOL;
	  			$htaccess_text .= 'Order allow,deny'.PHP_EOL;
				$htaccess_text .= '</FilesMatch>'.PHP_EOL;

				$htaccess_text .= '# Protect media files with realm'.PHP_EOL;
				$htaccess_text .= 'AuthType Basic'.PHP_EOL;
				$htaccess_text .= 'AuthName "Protected Login"'.PHP_EOL;
				$htaccess_text .= 'AuthUserFile ".htpasswd"'.PHP_EOL;
				$htaccess_text .= 'AuthGroupFile "/dev/null"'.PHP_EOL;
				$htaccess_text .= 'SetEnvIf Cookie '.$data->$ktoday->cookie_name.'='.$data->$ktoday->cookie_value.' PASS=1'.PHP_EOL;
				$htaccess_text .= 'SetEnvIf Cookie '.$data->$kyesterday->cookie_name.'='.$data->$kyesterday->cookie_value.' PASS=1'.PHP_EOL;
				$htaccess_text .= 'Order deny,allow'.PHP_EOL;
				$htaccess_text .= 'Deny from all'.PHP_EOL;
				$htaccess_text .= 'Allow from env=PASS'.PHP_EOL;
				$htaccess_text .= 'Require valid-user'.PHP_EOL;
				$htaccess_text .= 'Satisfy any'.PHP_EOL;
				*/

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
			$htaccess_text .= '<RequireAny>'.PHP_EOL;
			$htaccess_text .= 'Require env PASS'.PHP_EOL;
			$htaccess_text .= 'Require valid-user'.PHP_EOL;
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
		setcookie($data->$ktoday->cookie_name, $data->$ktoday->cookie_value, time() + (86400 * 1), '/'); // 86400 = 1 day

		return true;
	}//end init_cookie_auth



	/**
	* GET_AUTH_COOKIE_NAME
	* @return 
	*/
	private static function get_auth_cookie_name() {
		$date = getdate();
	    $cookie_name = md5( 'dedalo_c_name_'.$date['year'].$date['mon'].$date['mday'].$date['weekday']. mt_rand() );

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
	    $cookie_value = md5( 'dedalo_c_value_'.$date['wday'].$date['yday'].$date['mday'].$date['month']. mt_rand() );
	    
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
			$_SESSION['dedalo4']['auth']['is_logged'] != 1 || 
			empty($_SESSION['dedalo4']['auth']['salt_secure']) 
			) {
			
			
			if (empty($_SESSION['dedalo4']['auth']['user_id'])) {
				# exit possible session
				unset($_SESSION['dedalo4']);
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
	}#end verify_login



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
	* LOAD_COMPONENTS
	* Despeja y carga los componentes requeridos para el login
	* - username	(component_input_text)
	* - password	(component_password)
	* - email		(component_email)
	* Deben estar definidos en la estructura con el modelo apropiado
	*/
	protected function load_components() {

		$ar_components	= array();		#dump($this->tipo,'tipo',"load_components");

		$RecordObj_dd	= new RecordObj_dd($this->tipo);
		$ar_childrens 	= $RecordObj_dd->get_ar_childrens_of_this();	 	#dump($ar_childrens);

		if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

			# Para cada hijo, verificamos su modelo
			$RecordObj_dd	= new RecordObj_dd($terminoID);
			$modeloID		= $RecordObj_dd->get_modelo();
			$modelo_current	= RecordObj_dd::get_termino_by_tipo($modeloID);

			# Despejamos el nombre del modelo que será el tipo del componente (ej. 'component_input_text') y es también el nombre de la clase del mismo
			#$clase_name	= RecordObj_dd::get_termino_by_tipo($modeloID);
			$modo			= 'simple';

			$ar_terminos_relacionados	= $RecordObj_dd->get_relaciones();
				#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');


			switch($modelo_current) {
				/*
				case 'login_username'	:

						if(isset($ar_terminos_relacionados[0]))	foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$ar_components['username']	= component_common::get_instance('component_input_text', $current_tipo, 0, $modo, DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);						#var_dump($ar_terminos_relacionados	);	#die();
							break;
						}
						# Store session user tipo (used in matrix time machine)
						$_SESSION['dedalo4']['config']['user_name_tipo'] = $current_tipo ;		#dump($_SESSION['dedalo4']['config']['user_name'],"$current_tipo");

						break;

				case 'component_password' 	:

						if(isset($ar_terminos_relacionados[0]))	foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$ar_components['password']	= component_common::get_instance('component_password', $current_tipo,0, $modo, DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
							break;
						}
						break;
				*/
				case 'component_active_account'		:

						if(isset($ar_terminos_relacionados[0])) foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$this->tipo_active_account	= $current_tipo;
							break;
						}
						break;

				case 'component_email'		:

						if(isset($ar_terminos_relacionados[0])) foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$ar_components['email']		= component_common::get_instance('component_email', $current_tipo, 0, $modo, DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
							break;
						}
						break;

				case 'button_login'			:

						$ar_components['button_login']	= new button_login($terminoID, null,  null);
						break;

				#default	: print(__METHOD__ . "  <span class='error'>modelo: $modelo_current [$terminoID] is not valid !</span>");
			}

		}
		#tools::var_dump_pre($ar_components); #die();
		$this->ar_components = $ar_components;

		return 	$this->ar_components;
	}//end load_components



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
	public static function Quit( $trigger_post_vars ) {

		if (self::is_logged()!==true) {
			return false;
		}

		$user_id 	 = $_SESSION['dedalo4']['auth']['user_id'];
		$username	 = $_SESSION['dedalo4']['auth']['username'];		

		$activity_datos['result'] 	= "quit";
		$activity_datos['cause'] 	= "called quit method";
		$activity_datos['username']	= $username;

		# REMOVE LOCK_COMPONENTS ELEMENTS
		if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
			lock_components::force_unlock_all_components($user_id);
		}

		# LOGIN ACTIVITY REPORT
		self::login_activity_report(
			"User $user_id was logout. Bye $username",
			null,
			'LOG OUT',
			$activity_datos
			);

		# Delete auth cookie
		if (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
			$cookie_auth = (object)$_SESSION['dedalo4']['auth']['cookie_auth'];
			$ktoday 	 = date("Y_m_d");
			$kyesterday  = date("Y_m_d",strtotime("-1 day"));

			if (isset($cookie_auth->$ktoday->cookie_name)) {
				setcookie($cookie_auth->$ktoday->cookie_name, null, -1, '/');
			}
			if (isset($cookie_auth->$kyesterday->cookie_name)) {
				setcookie($cookie_auth->$kyesterday->cookie_name, null, -1, '/');
			}
		}			

		#unset($_SESSION['dedalo4']['auth']);
		#unset($_SESSION['dedalo4']['config']);
		unset($_SESSION['dedalo4']);
		setcookie('PHPSESSID', null, -1, '/');
		#unset($_SESSION);


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
	* @return bool true/false
	*/
	public function test_su_default_password() {
	
		$component  = component_common::get_instance('component_password',
													 DEDALO_USER_PASSWORD_TIPO,
													 -1,
													 'edit',
													 DEDALO_DATA_NOLAN,
													 DEDALO_SECTION_USERS_TIPO);
		$dato 		= $component->get_dato();		
		$default 	= login::SU_DEFAULT_PASSWORD; // Dedalo4debugChangePsW

		$encryption_mode = encryption_mode();
		
		if( $encryption_mode==='openssl' ) {
			if (dedalo_decrypt_openssl($dato)==$default) {
				return true;
			}
		}else if($encryption_mode==='mcrypt') {
			if (dedalo_decryptStringArray($dato)==$default) {
				return true;
			}
		}else{
			debug_log(__METHOD__." UNKNOW ENCRYPTION MODE !! ".to_string(), logger::ERROR);
		}


		return false;
	}#end test_su_default_password



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