<?php
/*
* CLASS LOGIN
*/
#dump($_SESSION, ' _SESSION');

class login extends common {

	protected $id;
	protected $tipo;
	protected $lang;
	protected $modo;

	protected $modelo;
	protected $tipo_active_account;
	protected $ar_components;

	protected static $login_matrix_table = 'matrix';


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
	
		# Test mcrypt lib
		if (!function_exists('mcrypt_encrypt')) return ("Error Processing Request: MCRYPT lib is not available");

		# Mandatory vars
		$mandatoy_vars = array('username','password','tipo_login','tipo_password','tipo_active_account');
		foreach ($mandatoy_vars as $var_name) {
			if ( !array_key_exists($var_name, $trigger_post_vars) ) {
				throw new Exception("Error Processing Request: var $var_name is mandatory!", 1);
			}
			if ( empty($trigger_post_vars[$var_name])) {
				throw new Exception("Error Processing Request: $var_name is empty!", 1);
			}
			$$var_name = $trigger_post_vars[$var_name];
		}

		$html='';

		# Search username
		$arguments=array();
		#$arguments["datos#>>'{section_tipo}'"] = DEDALO_SECTION_USERS_TIPO;
		$arguments["section_tipo"]  = DEDALO_SECTION_USERS_TIPO;
		$arguments["datos#>>'{components,".DEDALO_USER_NAME_TIPO.",dato,lg-nolan}'"] = $username;
		$matrix_table 				= common::get_matrix_table_from_tipo(DEDALO_SECTION_USERS_TIPO);
		$JSON_RecordObj_matrix		= new JSON_RecordObj_matrix($matrix_table,NULL,DEDALO_SECTION_USERS_TIPO);
		$ar_result					= (array)$JSON_RecordObj_matrix->search($arguments);
			#dump($ar_result,"ar_result ",$arguments);#die();

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
			exit("Error: User $username not exists !");

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
					exit("Error: Wrong password [1]");
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
							exit("Error: Account inactive or not defined [1]");
						}

						$user_id = $section_id;

						# No para global admin					
						if(!component_security_administrator::is_global_admin($user_id)) {
							#dump(component_security_administrator::is_global_admin($user_id),"is_global_admin $user_id");
							# USER : TEST SECURITY AREAS VALUES
							# Comprobamos que el usuario tiene algún área asignada antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_security_areas 	= component_common::get_instance('component_security_areas', DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO, $user_id, 'edit', DEDALO_DATA_LANG,DEDALO_SECTION_USERS_TIPO);
							$security_areas_dato 		= (array)$component_security_areas->get_dato();
								#dump($security_areas_dato,"security_areas_dato $user_id"); die();
							if (empty($security_areas_dato) || count($security_areas_dato)<1) {
								exit(label::get_label('error_usuario_sin_areas'));
							}

							# USER : TEST FILTER MASTER VALUES
							# Comprobamos que el usuario tiene algún proyecto asignado antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_filter_master 	= component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, $user_id, 'edit', DEDALO_DATA_LANG, DEDALO_SECTION_USERS_TIPO); 
							$filter_master_dato 		= (array)$component_filter_master->get_dato();								
							if (empty($filter_master_dato) || count($filter_master_dato)<1) {
								exit(label::get_label('error_usuario_sin_proyectos'));
							}
						}						

					#
					# LOGIN (ALL IS OK) - INIT LOGIN SECUENCE WHEN ALL IS OK					
					$init_user_login_secuence = login::init_user_login_secuence($user_id, $username);


					# RETURN OK AND RELOAD PAGE
					return ' Login.. ';
					die();

				}#if(isset($ar_password_id[0])

			}#if( is_array($ar_result) ) foreach($ar_result as $section_id)

		}#if( !is_array($ar_result) || count($ar_result)==0 || empty($ar_result[0]) )

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
		$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encryptStringArray(DEDALO_SALT_STRING);


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
	private static function init_user_login_secuence($user_id, $username) {

		#ob_implicit_flush(true);
		
		# RESET ALL SESSION VARS BEFORE INIT
		#dump($_SESSION,'$_SESSION');		
		if(isset($_SESSION)) foreach ($_SESSION as $key => $value) {
			# Nothint to delete
		}

		# DEDALO INIT TEST SECUENCE
		require(DEDALO_LIB_BASE_PATH.'/config/dd_init_test.php');
		

		# SESSION : If backup is ok, fix session data
		$_SESSION['dedalo4']['auth']['user_id']		= $user_id;
		$_SESSION['dedalo4']['auth']['username']	= $username;
		$_SESSION['dedalo4']['auth']['is_logged']	= 1;

		# CONFIG KEY
		$_SESSION['dedalo4']['auth']['salt_secure']	= dedalo_encryptStringArray(DEDALO_SALT_STRING);
		

		# BACKUP ALL
		if( DEDALO_BACKUP_ON_LOGIN ) {
			require(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
			$backup_info = backup::init_backup_secuence($user_id, $username);
		}else{
			$backup_info = 'Deactivated "on login backup" for this domain';
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

		# NO ESTÁ AUTENTIFICADO
		if( empty($_SESSION['dedalo4']['auth']['user_id']) || empty($_SESSION['dedalo4']['auth']['is_logged']) || $_SESSION['dedalo4']['auth']['is_logged'] != 1 || empty($_SESSION['dedalo4']['auth']['salt_secure']) ) {

			if( empty($_SESSION['dedalo4']['auth']['user_id']) || $_SESSION['dedalo4']['auth']['user_id']<1  ) {
				#throw new Exception("Error Login: User ID incorrect", 1);
			}
			if( empty($_SESSION['dedalo4']['auth']['is_logged']) || $_SESSION['dedalo4']['auth']['is_logged'] != 1 ) {
				#throw new Exception("Error Login: User is not logged", 1);
			}
			#if( empty($_SESSION['dedalo4']['auth']['salt_secure']) || $_SESSION['dedalo4']['auth']['salt_secure'] != '7PVecu9VSxLHnawfGF2oDCISXvsq2khsOKvPiTJ_D7a_wVaxqQwzRJElPxsecePnFzmrP34RIG0J0ykg3Mbobg,,') {
				#throw new Exception("Error Login: Incorrect security config", 1);
			#}

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

		return NULL;
	}


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

				case 'component_active_account'		:

						if(isset($ar_terminos_relacionados[0])) foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$this->tipo_active_account	= $current_tipo;					#echo " - ".$current_tipo;
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

						$ar_components['button_login']	= new button_login($terminoID, NULL,  $modo);
						break;

				#default	: print(__METHOD__ . "  <span class='error'>modelo: $modelo_current [$terminoID] is not valid !</span>");
			}

		}
		#tools::var_dump_pre($ar_components); #die();
		$this->ar_components = $ar_components;

		return 	$this->ar_components;
	}


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
	}





	/**
	* QUIT
	*/
	public static function Quit( $trigger_post_vars ) {

		if (self::is_logged()) {

			$user_id = $_SESSION['dedalo4']['auth']['user_id'];
			$username 		= $_SESSION['dedalo4']['auth']['username'];

			$activity_datos['result'] 	= "quit";
			$activity_datos['cause'] 	= "called quit method";
			$activity_datos['username']	= $username;

			# LOGIN ACTIVITY REPORT
			self::login_activity_report(
				"User $user_id was logout. Bye $username",
				null,
				'LOG OUT',
				$activity_datos
				);

			#unset($_SESSION['dedalo4']['auth']);
			#unset($_SESSION['dedalo4']['config']);
			unset($_SESSION['dedalo4']);
			#unset($_SESSION);
		}
		# Return OK
		return 'ok';
	}




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
	}






	/**
	* TEST_SU_DEFAULT_PASSWORD
	* Check if admin user password default has ben changed or not
	* @return bool true/false
	*/
	public function test_su_default_password() {
	
		$component  = component_common::get_instance('component_password', DEDALO_USER_PASSWORD_TIPO, -1, 'edit', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
		$dato 		= $component->get_dato();
		if(SHOW_DEBUG) {
			#dump(dedalo_decryptStringArray($dato), 'psw : '.$dato);
		}
		
		$default = 'Dedalo4debugChangePsW'; // Dedalo4debugChangePsW		
		if (dedalo_decryptStringArray($dato)==$default) {
			return true;
		}
		return false;

	}#end test_su_default_password



}
?>
