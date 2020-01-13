<?php
require_once( DEDALO_CORE_PATH .'/logger/class.logger_backend.php' );
/**
* LOGGER BACKEND ACTIVITY CLASS
*
*/
class logger_backend_activity extends logger_backend {

	private $log_level;
	private $h_conn;
	private static $activity_matrix_table = 'matrix_activity';

	static $what 	= array(
		'LOG IN'			=>	1,	# dd696 login module
		'LOG OUT'			=>	2,	# dd697 login module
		'NEW'				=>	3, 	# dd695 section
		'DELETE'			=>	4,	# dd698 section
		'SAVE'				=>	5,	# dd700 component
		'LOAD EDIT'			=>	6,	# dd694 page
		'LOAD LIST'			=>	7,	# dd693 page
		'SEARCH'			=>	8,	# dd699 component
		'UPLOAD'			=>	9, 	# dd1090 upload file by tool upload
		'DOWNLOAD'			=>	10, # dd1080 download file by tool av / image / pdf
		'UPLOAD COMPLETE'	=>	11, # dd1094 upload file by tool upload
		'DELETE FILE'		=>	12, # dd1095 delete file by tool
		'RECOVER SECTION'	=>	13, # dd1092 recuperar sección
		'RECOVER COMPONENT'	=>	14, # dd1091 recuperar componente
		'STATS'				=>	15, # dd1098 estadisticas
		'NEW VERSION'		=>	16, # dd1081 new version file
	);



	static $_SECTION_TIPO 		= array('tipo'=>'dd542','modelo_name'=>'section');
	static $_COMPONENT_IP 		= array('tipo'=>'dd544','modelo_name'=>'component_ip');
	static $_COMPONENT_QUIEN 	= array('tipo'=>'dd543','modelo_name'=>'component_autocomplete');
	static $_COMPONENT_QUE 		= array('tipo'=>'dd545','modelo_name'=>'component_input_text');
	static $_COMPONENT_DONDE 	= array('tipo'=>'dd546','modelo_name'=>'component_input_text');
	static $_COMPONENT_CUANDO 	= array('tipo'=>'dd547','modelo_name'=>'component_date');
	static $_COMPONENT_PROYECTOS= array('tipo'=>'dd550','modelo_name'=>'component_filter');
	static $_COMPONENT_DATOS 	= array('tipo'=>'dd551','modelo_name'=>'component_input_text');

	static $ar_elements_activity_tipo;

	public static $enable_log 	= true;



	# CONSTRUCT
	# Require url_data string like: 'mysql://user:password@host/database?tabe=matrix_activity' for caompatibity
	public function __construct($url_data) {
		#parent::__construct($url_data);

		# FIX ARRAY ar_elements_activity_tipo
		logger_backend_activity::$ar_elements_activity_tipo = array(
			self::$_SECTION_TIPO['tipo'],
			self::$_COMPONENT_IP['tipo'],
			self::$_COMPONENT_QUIEN['tipo'],
			self::$_COMPONENT_QUE['tipo'],
			self::$_COMPONENT_DONDE['tipo'],
			self::$_COMPONENT_CUANDO['tipo'],
			self::$_COMPONENT_PROYECTOS['tipo'],
			self::$_COMPONENT_DATOS['tipo']
		);
	}//end __construct



	/**
	* BUILD_COMPONENT_ACTIVITY_OBJECT
	*/
	public static function build_component_activity_object($dato) {

		$component_lang = DEDALO_DATA_NOLAN;
		$component_obj 	= new stdClass();
			$component_obj->dato = new stdClass();
			$component_obj->dato->$component_lang = new stdClass();
			$component_obj->dato->$component_lang = [$dato];

		return $component_obj;
	}//end build_component_activity_object


	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS
	*	IP_ADDRESS 	QUIEN 	QUE 	DONDE 	CUANDO 	DATOS
	*	QUE(like 'LOAD EDIT'), LOGLEVEL(INFO), TIPO(like 'dd120'), DATOS(array of related info)
	*/
	public function log_message( $message, $log_level=logger::INFO, $tipo_donde=NULL, $projects=array(), $datos=NULL ) {


		// Creation log exceptions

			# ENABLE LOG : OPTIONAL
			if(logger_backend_activity::$enable_log === false) return null;

			# if tipo of activity is not sended is not possible generate log
			if (empty($tipo_donde)) {
				trigger_error("Error on log_message (var 'tipo_donde' is empty) ".__METHOD__);
				return NULL;
			}

			# AUTOLOG STOP
			# Prevent infinite loop saving self
			if (in_array($tipo_donde, self::$ar_elements_activity_tipo)) {
				trigger_error("Error on log_message (infinite loop stopped) ".__METHOD__);
				return NULL;
			}
			#dump($datos,"$message, $log_level, $tipo_donde ".self::$_SECTION_TIPO['tipo']); return null;


		// DEBUG : Time
			if(SHOW_DEBUG===true) {
				$start_time = start_time();
				global$TIMER;$TIMER[get_called_class().'_IN_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
			}


		// SECTION RECORD . Create the components directly into the current format without create real components.
			$main_components_obj  = new stdClass();
			$relations 			  = [];

				# IP ADDRESS (user source ip) #############################################################
					$ip_address	= 'unknow';
					if (isset($_SERVER['REMOTE_ADDR']))
					$ip_address	= $_SERVER["REMOTE_ADDR"];
					if($ip_address==='::1') $ip_address = 'localhost';

					$component_tipo = self::$_COMPONENT_IP['tipo'];
					$component_obj  = self::build_component_activity_object($ip_address);
					$main_components_obj->$component_tipo = $component_obj;



				# WHO (store user section id_matrix and calculate name on view) ###########################
					$user_id = isset($_SESSION['dedalo4']['auth']['user_id']) ? $_SESSION['dedalo4']['auth']['user_id'] : '-666';
					$locator_user_id = new locator();
						$locator_user_id->set_section_id($user_id);
						$locator_user_id->set_section_tipo(DEDALO_SECTION_USERS_TIPO);

					$component_tipo = self::$_COMPONENT_QUIEN['tipo'];

					# Switch data version
					$locator_user_id->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator_user_id->set_from_component_tipo($component_tipo);
					$relations[] = $locator_user_id; // Direct to relations container


				# WHAT (msg) # Message ###########################################################################
					$message 	= str_replace("\t", ' ', $message);
					$message 	= str_replace("\n", ' ', $message);
					$message 	= trim($message);

					
					if (isset(self::$what[$message])) {
						$what_section_id = self::$what[$message];
					}
					if (empty($what_section_id)) {
						throw new Exception("locator_what (from log message) is empty", 1);
					}
					$locator_what = new locator();
						$locator_what->set_section_id($what_section_id);
						$locator_what->set_section_tipo('dd42');
						$locator_what->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator_what->set_from_component_tipo('dd545');

					$relations[] = $locator_what;


				# WHERE (tipo) ##################################################################################
					$donde 		= $tipo_donde;
					if(!strlen($tipo_donde)) $donde = 'unknow';

					$component_tipo = self::$_COMPONENT_DONDE['tipo'];
					$component_obj  = self::build_component_activity_object($tipo_donde);
					$main_components_obj->$component_tipo = $component_obj;
				

				# WHEN (Time. timestamp formated) #############################################################
					$current_time		= component_date::get_date_now();
					
					$time = new stdClass();
						$time->start 	= $current_time;
					$component_tipo = self::$_COMPONENT_CUANDO['tipo'];
					$component_obj  = self::build_component_activity_object($time);
					$main_components_obj->$component_tipo = $component_obj;


				# PROJECTS (param 'datos' + url's ...)	#########################################################
					if ( !empty($user_id) && $user_id!=='unknow' ) {
						$projects_dato = filter::get_user_projects($user_id);
						$project_relations = [];
						if (!empty($projects_dato)) {

							foreach ((array)$projects_dato as $project_locator) {
								if (isset($project_locator->from_component_tipo)) {
									# Override from_component_tipo
									$project_locator_safe = clone $project_locator;
									$project_locator_safe->from_component_tipo = self::$_COMPONENT_PROYECTOS['tipo'];
									$project_relations[] = $project_locator_safe;
								}
							}
							# Add to relations container
							$relations = array_merge($relations, $project_relations);
						}
					}

				# DATA (param 'datos' + url's ...)	#############################################################
					if (!is_array($datos)) {
						$dato_array = array($datos);
					}else{
						$dato_array = $datos;
					}

					# When msg is load, include datos of urls
					if (strpos($message, 'LOAD')!==false) {
						# URL
						$url 			= 'unknow';
						if (isset($_SERVER['REQUEST_URI'])) {
							$request_uri= safe_xss($_SERVER['REQUEST_URI']);
							# Remove possible attack chars like: ', %27, ;
							$request_uri= str_replace(array('\'','%27',';'), '', $request_uri);
							$request_uri= pg_escape_string($request_uri);
							$url 		= urldecode( DEDALO_PROTOCOL . $_SERVER['HTTP_HOST'] . $request_uri );
						}
						$dato_array['url'] = tools::build_link($url, array('url'=>$url,'css'=>'list_link'));
						# Referrer
						$referrer 		= 'unknow';
						if (isset($_SERVER['HTTP_REFERER'])) {
							$referrer 	= safe_xss($_SERVER['HTTP_REFERER']);
							$referrer 	= str_replace('\'', '', $referrer);
						}
						$dato_array['ref'] = tools::build_link($referrer, array('url'=>$referrer,'css'=>'list_link'));
					}

					$component_tipo = self::$_COMPONENT_DATOS['tipo'];
					$component_obj  = self::build_component_activity_object($dato_array);
					$main_components_obj->$component_tipo = $component_obj;


				# SECTION #############################################################
					$section = section::get_instance(null, DEDALO_ACTIVITY_SECTION_TIPO, 'edit');

					$save_options = new stdClass();
						$save_options->main_components_obj 	= $main_components_obj;
						$save_options->main_relations 		= $relations;
							#dump($save_options,"save_options");die();

					# Save. Returns created section_id (auto created by table sequence 'matrix_activity_section_id_seq')
					$id_section = $section->Save( $save_options );

					#
					# POST SAVE ACTIONS
						if (!empty($project_relations)) {

							# (!) Note that here no relations are written to relations table automatically, we need launch action manually
							# without pass by component
							$relation_options = new stdClass();
								$relation_options->section_tipo 		= DEDALO_ACTIVITY_SECTION_TIPO;
								$relation_options->section_id 			= $id_section;
								$relation_options->from_component_tipo 	= self::$_COMPONENT_PROYECTOS['tipo'];
								$relation_options->ar_locators 			= $project_relations;
							$propagate_response = search::propagate_component_dato_to_relations_table($relation_options);
						}



					if(SHOW_DEBUG===true) {
						#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, 'logger_backend_activity '.$id_section);
						$TIMER[get_called_class().'_OUT_'.$tipo_donde.'_'.microtime(1)]=microtime(1);
					}

		return $id_section;
	}//end log_message



}//end class
