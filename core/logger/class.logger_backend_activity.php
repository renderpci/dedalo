<?php
/**
* LOGGER BACKEND ACTIVITY CLASS
* Manages activity records write to matrix_activity table
*/
class logger_backend_activity extends logger_backend {



	// private $log_level;
	// private $h_conn;
	// private static $activity_matrix_table = 'matrix_activity';



	/**
	* @var
	*/
		// what var
		static $what = [
			'LOG IN'			=>	1,	// dd696 login module
			'LOG OUT'			=>	2,	// dd697 login module
			'NEW'				=>	3, 	// dd695 section
			'DELETE'			=>	4,	// dd698 section
			'SAVE'				=>	5,	// dd700 component
			'LOAD EDIT'			=>	6,	// dd694 page
			'LOAD LIST'			=>	7,	// dd693 page
			'SEARCH'			=>	8,	// dd699 component
			'UPLOAD'			=>	9, 	// dd1090 upload file by tool upload
			'DOWNLOAD'			=>	10, // dd1080 download file by tool av / image / pdf
			'UPLOAD COMPLETE'	=>	11, // dd1094 upload file by tool upload
			'DELETE FILE'		=>	12, // dd1095 delete file by tool
			'RECOVER SECTION'	=>	13, // dd1092 recuperar sección
			'RECOVER COMPONENT'	=>	14, // dd1091 recuperar componente
			'STATS'				=>	15, // dd1098 estadisticas
			'NEW VERSION'		=>	16  // dd1081 new version file
		];

		// tipos
		static $_SECTION_TIPO = [
			'tipo'			=>'dd542',
			'model_name'	=>'section'
		];
		static $_COMPONENT_IP = [
			'tipo'			=>'dd544', // (v5 former component_ip)
			'model_name'	=>'component_input_text'
		];
		static $_COMPONENT_WHO = [
			'tipo'			=>'dd543',
			'model_name'	=>'component_autocomplete'
		];
		static $_COMPONENT_WHAT = [
			'tipo'			=> 'dd545',
			'model_name'	=> 'component_select' // (v5 former component_input_text)
		];
		static $_COMPONENT_WHERE = [
			'tipo'			=>'dd546', // (v5 former component_autocomplete_ts)
			'model_name'	=>'component_input_text'
		];
		static $_COMPONENT_WHEN	= [
			'tipo'			=>'dd547',
			'model_name'	=>'component_date'
		];
		static $_COMPONENT_PROJECTS	= [
			'tipo'			=>'dd550',
			'model_name'	=>'component_filter'
		];
		static $_COMPONENT_DATOS = [
			'tipo'			=>'dd551',
			'model_name'	=>'component_json' // (v5 former component_input_text)
			// in Ontology appears as component_input_text fro v5 compatibility, but mapped to component_json in 'get_modelo_name()'
		];

		// ar_elements_activity_tipo
		static $ar_elements_activity_tipo;

		// enable_log static
		public static $enable_log = true;



	/**
	* __CONSTRUCT
	* Require url_data string like: 'mysql://user:password@host/database?table=matrix_activity' for compatibility
	* @param array|null $url_data
	*/
	public function __construct(?array $url_data) {

		// FIX ARRAY ar_elements_activity_tipo
		logger_backend_activity::$ar_elements_activity_tipo = [
			self::$_SECTION_TIPO['tipo'],
			self::$_COMPONENT_IP['tipo'],
			self::$_COMPONENT_WHO['tipo'],
			self::$_COMPONENT_WHAT['tipo'],
			self::$_COMPONENT_WHERE['tipo'],
			self::$_COMPONENT_WHEN['tipo'],
			self::$_COMPONENT_PROJECTS['tipo'],
			self::$_COMPONENT_DATOS['tipo']
		];
	}//end __construct



	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS
	*	IP_ADDRESS 	QUIEN 	QUE 	DONDE 	CUANDO 	DATOS
	*	QUE(like 'LOAD EDIT'), LOGLEVEL(INFO), TIPO(like 'dd120'), DATOS(array of related info)
	*
	* @param string $message
	* 	sample: 'SAVE'
	* @param int $log_level = logger::INFO
	* 	sample: 75
	* @param string|null $tipo_where = null
	* 	sample: 'oh32'
	* @param string|null $operations = null
	* 	sample: null
	* @param array|null $datos = null
	* 	sample: [
		*		"msg"				=> "Saved component data",
		*		"tipo"				=> "oh32",
		*		"section_id"		=> "1",
		*		"lang"				=> "lg-nolan",
		*		"top_id"			=> "1",
		*		"top_tipo"			=> "oh1",
		*		"component_name"	=> "component_publication",
		*		"table"				=> "matrix",
		*		"section_tipo"		=> "oh1"
		*	]
	* @return int|null section_id
	*/
	public function log_message(
		string $message,
		int $log_level=logger::INFO,
		string $tipo_where=null,
		string $operations=null,
		array $datos=null
	) : ?int {

		// check values

			// disable log
				if(logger_backend_activity::$enable_log===false) {
					return null;
				}

			// if tipo of activity is not senT is not possible generate log
				if (empty($tipo_where)) {
					debug_log(__METHOD__." Error on log_message (var 'tipo_donde' is empty) ".to_string(), logger::ERROR);
					return null;
				}

			// auto-log stop. Prevent infinite loop saving self
				if (in_array($tipo_where, self::$ar_elements_activity_tipo)) {
					debug_log(__METHOD__." Error on log_message (infinite loop stopped) ".to_string(), logger::ERROR);
					return null;
				}

		// debug
			if(SHOW_DEBUG===true) {
				// $start_time = start_time();
			}

		// section record. Create the components directly into the current format without create real components.
			$components	= new stdClass();
			$relations	= [];

		// IP ADDRESS (user source IP) ##############################################################
			$component_tipo = self::$_COMPONENT_IP['tipo']; // dd544 component_input_text (for now)

			// value
				$ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
				// normalize localhost
				if($ip_address==='::1') {
					$ip_address = 'localhost';
				}
			// add value
				$components->{$component_tipo} = (object)[
					'dato' => (object)[
						DEDALO_DATA_NOLAN => [$ip_address]
					]
				];

		// WHO (store user section id_matrix and calculate name on view) ############################
			$component_tipo = self::$_COMPONENT_WHO['tipo']; // dd543 component_autocomplete

			// value
				$user_id = logged_user_id() ?? '-666';
				$locator_user_id = new locator();
					$locator_user_id->set_section_id($user_id);
					$locator_user_id->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator_user_id->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator_user_id->set_from_component_tipo($component_tipo);
			// add value
				$relations[] = $locator_user_id;

		// WHAT (msg) # Message #####################################################################
			$component_tipo = self::$_COMPONENT_WHAT['tipo']; // dd545 component_select

			// value
				$message 	= str_replace("\t", ' ', $message);
				$message 	= str_replace("\n", ' ', $message);
				$message 	= trim($message);
				if (isset(self::$what[$message])) {
					$what_section_id = self::$what[$message];
				}
				if (empty($what_section_id)) {
					// throw new Exception("locator_what (from log message) is empty", 1);
					debug_log(__METHOD__.
						PHP_EOL.'ACTIVITY LOG ERROR'.
						" Unable to resolve locator_what from log message. what_section_id is empty. What info will NOT be saved!".
						PHP_EOL.'message: '.to_string($message),
						logger::ERROR
					);
				}else{
					$locator_what = new locator();
						$locator_what->set_section_id($what_section_id);
						$locator_what->set_section_tipo('dd42');
						$locator_what->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator_what->set_from_component_tipo($component_tipo);
					// add value
						$relations[] = $locator_what;
				}

		// WHERE (tipo) #############################################################################
			$component_tipo = self::$_COMPONENT_WHERE['tipo']; // dd546 component_input_text

			// value
				if(!strlen($tipo_where)) {
					$tipo_where = 'unknown';
				}
			// add value
				$components->{$component_tipo} = (object)[
					'dato' => (object)[
						DEDALO_DATA_NOLAN => [$tipo_where]
					]
				];

		// WHEN (Time. timestamp formatted) #########################################################
			$component_tipo = self::$_COMPONENT_WHEN['tipo']; // dd547 component_date

			// value
				$time_value = new stdClass();
					$time_value->start = component_date::get_date_now();
			// add value
				$components->{$component_tipo} = (object)[
					'dato' => (object)[
						DEDALO_DATA_NOLAN => [$time_value]
					]
				];

		// PROJECTS #################################################################################
			$component_tipo = self::$_COMPONENT_PROJECTS['tipo']; // dd550 component_filter
			if ( !empty($user_id) && $user_id!=='unknown' ) {
				// value
				$projects_dato = filter::get_user_projects($user_id);
				if (!empty($projects_dato)) {
					foreach ($projects_dato as $project_locator) {
						if (isset($project_locator->from_component_tipo)) {
							// Override from_component_tipo
							$project_locator_safe = clone $project_locator;
							$project_locator_safe->from_component_tipo = $component_tipo;

							// add to section->relations array
							$relations[] = $project_locator_safe;
						}
					}
				}
			}

		// DATA (param 'datos' + URL's ...)	#########################################################
			$component_tipo = self::$_COMPONENT_DATOS['tipo']; // dd551 component_input_text
			// value. Expected assoc array as ['msg'=> 'Upload file complete','data'=>'{string data...}']
				$dato_array = !is_array($datos)
					? [$datos]
					: $datos;
				// When msg is load, include datos of url
					// if (strpos($message, 'LOAD')!==false) {
					// 	// URL
					// 	$url = 'unknown';
					// 	if (isset($_SERVER['REQUEST_URI'])) {
					// 		$request_uri = safe_xss($_SERVER['REQUEST_URI']);
					// 		// Remove possible attack chars like: ', %27, ;
					// 		$request_uri = str_replace(array('\'','%27',';'), '', $request_uri);
					// 		$request_uri = pg_escape_string(DBi::_getConnection(), $request_uri);
					// 		$url 		 = urldecode( DEDALO_PROTOCOL . $_SERVER['HTTP_HOST'] . $request_uri );
					// 	}
					// 	$dato_array['url'] = build_link($url, ['url'=>$url,'css'=>'list_link']);
					// 	// Referrer
					// 	$referrer = 'unknown';
					// 	if (isset($_SERVER['HTTP_REFERER'])) {
					// 		$referrer 	= safe_xss($_SERVER['HTTP_REFERER']);
					// 		$referrer 	= str_replace('\'', '', $referrer);
					// 	}
					// 	$dato_array['ref'] = build_link($referrer, ['url'=>$referrer,'css'=>'list_link']);
					// }
			// add value
				$components->{$component_tipo} = (object)[
					'dato' => (object)[
						DEDALO_DATA_NOLAN => [$dato_array]
					]
				];

		// SECTION ##################################################################################
			$section = section::get_instance(
				null,
				DEDALO_ACTIVITY_SECTION_TIPO,
				'edit', // string mode
				false // bool cache
			);

			// save options
				$save_options = new stdClass();
					$save_options->main_components_obj	= $components;
					$save_options->main_relations		= $relations;

			// Save. Returns created section_id (auto created by table sequence 'matrix_activity_section_id_seq')
				$id_section = $section->Save( $save_options );

		// debug
			if(SHOW_DEBUG===true) {
				// $total_time = exec_time_unit($start_time,'ms').' ms';
				// debug_log(__METHOD__.
				// 	' Activity log total time:  '.
				// 	exec_time_unit($start_time,'ms').' ms',
				// 	logger::DEBUG
				// );
			}


		return $id_section;
	}//end log_message



}//end class logger_backend_activity
