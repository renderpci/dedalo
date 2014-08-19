<?php
/*
* CLASS LOGIN
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


	public function __construct($modo='edit') {

		$this->is_logged = self::is_logged();						#echo __METHOD__."-> is_loged: ";var_dump($this->is_logged); #die("");

		# CARGAMOS EL COMPONENTE
		if($this->is_logged === false) {

			$id 	= NULL;
			$tipo	= self::get_login_tipo();						#echo  $tipo; die();	#'dd229';

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
		$mandatoy_vars = array('username','password','tipo_login','tipo_username','tipo_password','tipo_active_account');
		foreach ($mandatoy_vars as $var_name) {
			if ( !array_key_exists($var_name, $trigger_post_vars) ) {
				throw new Exception("Error Processing Request: var $var_name is mandatory!", 1);
			}
			if ( empty($trigger_post_vars[$var_name])) {
				throw new Exception("Error Processing Request: $var_name is empty!", 1);
			}
			$$var_name = $trigger_post_vars[$var_name];
		}

		$html 	= '';

		# Search username
		$arguments=array();
		$arguments['tipo']		= $tipo_username;
		$arguments['dato:json']	= $username;
		$matrix_table 			= self::$login_matrix_table;
		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		$ar_result				= $RecordObj_matrix->search($arguments);					#dump($ar_result);	#exit();

		if( !is_array($ar_result) || empty($ar_result[0]) ) {

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
			# delay failed output by 2 seconds to prevent bruit force attacks
	        sleep(2);
			exit("Error: User $username not exists !");

		}else{

			if( is_array($ar_result) ) foreach($ar_result as $id) {

				$matrix_table 			= self::$login_matrix_table;
				$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$id);
				$parent 				= $RecordObj_matrix->get_parent();

				##
				# verificamos el dato para verificar mayúsculas y minúsculas (dato es case insensitive en tabla de matrix)
				$dato 					= $RecordObj_matrix->get_dato();
				if($dato!=$username) {

					$activity_datos['result'] 	= "deny";
					$activity_datos['cause'] 	= "user not exist";
					$activity_datos['username']	= $username;

					# LOGIN ACTIVITY REPORT
					self::login_activity_report(
						"Denied login attempted by: $username. This user does not exist in the database (user name is case sensitive)",
						NULL,
						'LOG IN',
						$activity_datos
						);
					# delay failed output by 2 seconds to prevent bruit force attacks
	        		sleep(2);
					exit("Error: User $username not exists ! (user name is case sensitive)");
				}

				# Search password
				$password_encripted 	= component_password::encrypt_password($password);

				$arguments=array();
				$arguments['parent']	= $parent;
				$arguments['tipo']		= $tipo_password;
				$arguments['dato:json']	= $password_encripted;
				$matrix_table 			= self::$login_matrix_table;
				$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
				$ar_password_id			= $RecordObj_matrix->search($arguments);					#dump($ar_password_id);	exit();

				if( empty($ar_password_id[0]) ) {

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

				if( isset($ar_password_id[0]) && strlen($ar_password_id[0]) ) {

					##
					# verificamos el dato para verificar mayúsculas y minúsculas (dato es case insensitive en tabla de matrix)
						$matrix_table 			= self::$login_matrix_table;
						$RecordObj_matrix		= new RecordObj_matrix($matrix_table,$ar_password_id[0]);
						$dato_password			= $RecordObj_matrix->get_dato();

						if($dato_password != $password_encripted) {

							$activity_datos['result'] 	= "deny";
							$activity_datos['cause'] 	= "wrong password";
							$activity_datos['username']	= $username;

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"Denied login attempted by: $username. Wrong password [2] (Incorrect password case)",
								NULL,
								'LOG IN',
								$activity_datos
								);
							# delay failed output by 2 seconds to prevent bruit force attacks
	        				sleep(2);
							exit("Error: Wrong password [2]");
						}

					##
					# Verificamos si la cuenta está activa
						$arguments=array();
						$arguments['parent']		= $parent;
						$arguments['tipo']			= $tipo_active_account;
						$matrix_table 				= self::$login_matrix_table;;
						$RecordObj_matrix			= new RecordObj_matrix($matrix_table,NULL);
						$ar_tipo_active_account_id	= $RecordObj_matrix->search($arguments);			#dump($ar_tipo_active_account_id,'ar_tipo_active_account_id', print_r($arguments,true));

						if( empty($ar_tipo_active_account_id[0]) ) {

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

						$matrix_table 				= self::$login_matrix_table;;
						$RecordObj_matrix			= new RecordObj_matrix($matrix_table,$ar_tipo_active_account_id[0]);
						$dato						= $RecordObj_matrix->get_dato();

						if( empty($dato[0]) ) {

							$activity_datos['result'] 	= "deny";
							$activity_datos['cause'] 	= "account inactive";
							$activity_datos['username']	= $username;

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"Denied login attempted by: $username. Account inactive or not defined [2]",
								NULL,
								'LOG IN',
								$activity_datos
								);
							# delay failed output by 2 seconds to prevent bruit force attacks
	        				sleep(2);
							exit("Error: Account inactive or not defined 2");
						}


						# Since this data is translatable, we will use the value 'si' (yes) from the list of values in numerical form
						# that is defined in config (NUMERICAL_MATRIX_VALUE_YES)
						$dato_activo = $dato[0];
							#dump($dato_activo,'dato_activo',"NUMERICAL_MATRIX_VALUE_YES:".NUMERICAL_MATRIX_VALUE_YES);
						if( empty($dato_activo) || intval($dato_activo) != NUMERICAL_MATRIX_VALUE_YES ) {

							$activity_datos['result'] 	= "deny";
							$activity_datos['cause'] 	= "account inactive";
							$activity_datos['username']	= $username;

							# LOGIN ACTIVITY REPORT
							self::login_activity_report(
								"Denied login attempted by: $username. Account inactive",
								NULL,
								'LOG IN',
								$activity_datos
								);
							# delay failed output by 2 seconds to prevent bruit force attacks
	        				sleep(2);
							exit("Warning: Account inactive  ");
						}


						$user_id_matrix	= $parent;

						# No para global admin					
						if(!component_security_administrator::is_global_admin($user_id_matrix)) {
							# USER : TEST SECURITY AREAS VALUES
							# Comprobamos que el usuario tiene algún área asignada antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_security_areas 	= new component_security_areas(NULL,DEDALO_COMPONENT_SECURITY_AREAS_TIPO,'edit',$user_id_matrix,DEDALO_DATA_LANG); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$security_areas_dato 		= $component_security_areas->get_dato();
							if (empty($security_areas_dato) || !is_array($security_areas_dato) || count($security_areas_dato)<1) {
								exit(label::get_label('error_usuario_sin_areas'));
							}

							# USER : TEST FILTER MASTER VALUES
							# Comprobamos que el usuario tiene algún proyecto asignado antes de dejarlo entrar (los administradores suelen olvidarse de hacerlo)
							$component_filter_master 	= new component_filter_master(NULL,DEDALO_FILTER_MASTER_TIPO,'edit',$user_id_matrix,DEDALO_DATA_LANG); #($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$filter_master_dato 		= $component_filter_master->get_dato();								
							if (empty($filter_master_dato) || !is_array($filter_master_dato) || count($filter_master_dato)<1) {
								exit(label::get_label('error_usuario_sin_proyectos'));
							}
						}						

						


					# LOGIN (ALL IS OK) - INIT LOGIN SECUENCE WHEN ALL IS OK					
					$init_user_login_secuence = login::init_user_login_secuence($user_id_matrix, $username);


					# RETURN OK AND RELOAD PAGE
					return 'Login..';
					die();

				}#if(isset($ar_password_id[0])

			}#if( is_array($ar_result) ) foreach($ar_result as $id)

		}#if( !is_array($ar_result) || count($ar_result)==0 || empty($ar_result[0]) )

	}#end Login


	

	/**
	* INIT_USER_LOGIN_SECUENCE
	* Init login secuence when all is ok
	*/
	private static function init_user_login_secuence($user_id_matrix, $username) {
		/**/
		# RESET ALL SESSION VARS BEFORE INIT
		#dump($_SESSION,'$_SESSION');		
		if(isset($_SESSION)) foreach ($_SESSION as $key => $value) {
			# Nothint to delete
		}


		# DEDALO INIT TEST SECUENCE
		require(DEDALO_LIB_BASE_PATH.'/config/dd_init_test.php');
		

		# SESSION : If backup is ok, fix session data
		$_SESSION['auth4']['userID_matrix']	= $user_id_matrix;
		$_SESSION['auth4']['username']		= $username;
		$_SESSION['auth4']['is_logged']		= 1;

		# CONFIG KEY
		$_SESSION['auth4']['salt_secure']	= dedalo_encryptStringArray(DEDALO_SALT_STRING);
		

		# BACKUP ALL
		if( DEDALO_BACKUP_ON_LOGIN ) {
			require(DEDALO_LIB_BASE_PATH.'/backup/class.backup.php');
			$backup_info = backup::init_backup_secuence($user_id_matrix, $username);
		}else{
			$backup_info = 'Deactivated "on login backup" for this domain';
		}


		# LOG : Prepare and save login action
		$browser = $_SERVER["HTTP_USER_AGENT"];
		if (strpos($browser, 'AppleWebKit')===false)
			$browser = "<i style='color:red'>$browser</i>";

		$activity_datos['result'] 	= "allow";
		$activity_datos['cause'] 	= "correct user and password";
		$activity_datos['username']	= $username;
		$activity_datos['browser']	= $browser;
		$activity_datos['DB-backup']= $backup_info;

		# LOGIN ACTIVITY REPORT
		self::login_activity_report(
			"User $user_id_matrix is logged. Hello $username",
			filter::get_user_projects($user_id_matrix),
			'LOG IN',
			$activity_datos
			);
			#dump(filter::get_user_projects($user_id_matrix),'filter::get_user_projects($user_id_matrix) '.$user_id_matrix);

		return true;
	}


	/**
	* IS_LOGGED
	* Test if current user is logged
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
		if( empty($_SESSION['auth4']['userID_matrix']) || empty($_SESSION['auth4']['is_logged']) || $_SESSION['auth4']['is_logged'] != 1 || empty($_SESSION['auth4']['salt_secure']) ) {

			if( empty($_SESSION['auth4']['userID_matrix']) || $_SESSION['auth4']['userID_matrix']<1  ) {
				#throw new Exception("Error Login: User ID incorrect", 1);
			}
			if( empty($_SESSION['auth4']['is_logged']) || $_SESSION['auth4']['is_logged'] != 1 ) {
				#throw new Exception("Error Login: User is not logged", 1);
			}
			#if( empty($_SESSION['auth4']['salt_secure']) || $_SESSION['auth4']['salt_secure'] != '7PVecu9VSxLHnawfGF2oDCISXvsq2khsOKvPiTJ_D7a_wVaxqQwzRJElPxsecePnFzmrP34RIG0J0ykg3Mbobg,,') {
				#throw new Exception("Error Login: Incorrect security config", 1);
			#}

			return false;

		# SI ESTÁ UTENTIFICADO
		}else{

			#if( $_SESSION['auth4']['salt_secure'] != '7PVecu9VSxLHnawfGF2oDCISXvsq2khsOKvPiTJ_D7a_wVaxqQwzRJElPxsecePnFzmrP34RIG0J0ykg3Mbobg,,') {
			#	throw new Exception("Error Login: Incorrect security config", 1);
			#	return false;
			#}

			return true;
		}
	}

	/**
	* GET_LOGIN_TIPO
	*/
	private static function get_login_tipo() {

		$ar_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name($modelo_name='login', $prefijo='dd');

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

		$RecordObj_ts	= new RecordObj_ts($this->tipo);
		$ar_childrens 	= $RecordObj_ts->get_ar_childrens_of_this();	 	#dump($ar_childrens);

		if(is_array($ar_childrens)) foreach($ar_childrens as $terminoID) {

			# Para cada hijo, verificamos su modelo
			$RecordObj_ts	= new RecordObj_ts($terminoID);
			$modeloID		= $RecordObj_ts->get_modelo();
			$modelo_current	= RecordObj_ts::get_termino_by_tipo($modeloID);

			# Despejamos el nombre del modelo que será el tipo del componente (ej. 'component_input_text') y es también el nombre de la clase del mismo
			#$clase_name	= RecordObj_ts::get_termino_by_tipo($modeloID);
			$modo			= 'simple';

			$ar_terminos_relacionados	= $RecordObj_ts->get_relaciones();
				#dump($ar_terminos_relacionados,'$ar_terminos_relacionados');


			switch($modelo_current) {

				case 'login_username'	:

						if(isset($ar_terminos_relacionados[0]))	foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$ar_components['username']	= new component_input_text(NULL, $current_tipo, $modo, 0, DEDALO_DATA_NOLAN);						#var_dump($ar_terminos_relacionados	);	#die();
							break;
						}
						# Store session user tipo (used in matrix time machine)
						$_SESSION['config4']['user_name_tipo'] = $current_tipo ;		#dump($_SESSION['config4']['user_name'],"$current_tipo");

						break;

				case 'component_password' 	:

						if(isset($ar_terminos_relacionados[0]))	foreach($ar_terminos_relacionados[0] as $key => $current_tipo) {
							$ar_components['password']	= new component_password(NULL, $current_tipo, $modo, 0, DEDALO_DATA_NOLAN);
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
							$ar_components['email']		= new component_email(NULL, $current_tipo, $modo, 0, DEDALO_DATA_NOLAN);
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

			$user_id_matrix = $_SESSION['auth4']['userID_matrix'];
			$username 		= $_SESSION['auth4']['username'];

			$activity_datos['result'] 	= "quit";
			$activity_datos['cause'] 	= "called quit method";
			$activity_datos['username']	= $username;

			# LOGIN ACTIVITY REPORT
			self::login_activity_report(
				"User $user_id_matrix was logout. Bye $username",
				filter::get_user_projects($user_id_matrix),
				'LOG OUT',
				$activity_datos
				);

			unset($_SESSION['auth4']);
			unset($_SESSION['config4']);
			unset($_SESSION);
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
			$projects,
			$datos
		);
	}










}
?>
