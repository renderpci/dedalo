<?php declare(strict_types=1);
/**
* LOGGER BACKEND ACTIVITY CLASS
* Manages activity records write to matrix_activity table
*/
class logger_backend_activity extends logger_backend {



	/**
	* @var
	*/
		// what var
		// @see $what_map for statistics in diffusion_section_stats::build_what()
		static $what = [
			'LOG IN'			=>	1,	// dd696 login module
			'LOG OUT'			=>	2,	// dd697 login module
			'NEW'				=>	3, 	// dd695 section
			'DELETE'			=>	4,	// dd729 delete section
			'SAVE'				=>	5,	// dd700 component
			'LOAD EDIT'			=>	6,	// dd694 page
			'LOAD LIST'			=>	7,	// dd693 page
			'SEARCH'			=>	8,	// dd699 component
			'UPLOAD'			=>	9, 	// dd1090 upload file by tool upload
			'DOWNLOAD'			=>	10, // dd1080 download file by tool av / image / pdf
			'UPLOAD COMPLETE'	=>	11, // dd1094 upload file by tool upload
			'DELETE FILE'		=>	12, // dd1095 delete file by tool
			'RECOVER SECTION'	=>	13, // dd1092 recover section
			'RECOVER COMPONENT'	=>	14, // dd1091 recover component
			'STATS'				=>	15, // dd1098 statistics
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
			'model_name'	=>'component_portal' //component_autocomplete
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
		static $_COMPONENT_DATA = [
			'tipo'			=>'dd551',
			'model_name'	=>'component_json' // (v5 former component_input_text)
			// in Ontology appears as component_input_text fro v5 compatibility, but mapped to component_json in 'get_model()'
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
	public function __construct( ?array $url_data ) {

		// FIX ARRAY ar_elements_activity_tipo
		logger_backend_activity::$ar_elements_activity_tipo = [
			self::$_SECTION_TIPO['tipo'],
			self::$_COMPONENT_IP['tipo'],
			self::$_COMPONENT_WHO['tipo'],
			self::$_COMPONENT_WHAT['tipo'],
			self::$_COMPONENT_WHERE['tipo'],
			self::$_COMPONENT_WHEN['tipo'],
			// self::$_COMPONENT_PROJECTS['tipo'],
			self::$_COMPONENT_DATA['tipo']
		];
	}//end __construct



	/**
	* LOG_MESSAGE_DEFER
	* Write record in database activity section
	* @param object $options
	* @return void
	*/
	public function log_message_defer( object $options ) : void {

		// options
			$message	= $options->message;
			$tipo_where	= $options->tipo_where;
			$log_data	= $options->log_data;
			$user_id	= $options->user_id;

		// check values

			// if the type of activity is not sent, it is not possible to generate log
				if (empty($tipo_where)) {
					debug_log(__METHOD__
						. " Error on log_message (var 'tipo_where' is empty) " . PHP_EOL
						. ' options: ' . to_string($options)
						, logger::ERROR
					);
					return;
				}

			// auto-log stop. Prevent infinite loop saving self
				if (in_array($tipo_where, self::$ar_elements_activity_tipo)) {
					debug_log(__METHOD__
						." Error on log_message (infinite loop stopped) "
						, logger::ERROR
					);
					return;
				}

		// debug
			if(SHOW_DEBUG===true) {
				// $start_time = start_time();
			}

		// section record data. Create the components directly into the current format without create real components.
			$data = new stdClass();
				$data->relation	= new stdClass();
				$data->string	= new stdClass();
				$data->date		= new stdClass();
				$data->misc		= new stdClass();

		// IP ADDRESS (user source IP) ##############################################################
			$component_tipo	= self::$_COMPONENT_IP['tipo']; // dd544 component_input_text (for now)
			$model			= self::$_COMPONENT_IP['model_name'];
			$column_name	= section_record_data::get_column_name( $model );

			// value
				$ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
				// normalize localhost
				if($ip_address==='::1') {
					$ip_address = 'localhost';
				}
			// add value
				$value = (object)[
					'value' => [$ip_address],
					'lang' => DEDALO_DATA_NOLAN
				];
				$data->$column_name->$component_tipo = [ $value ];

		// WHO (store user section id_matrix and calculate name on view) ############################
			$component_tipo = self::$_COMPONENT_WHO['tipo']; // dd543 component_autocomplete
			$model			= self::$_COMPONENT_WHO['model_name'];
			$column_name	= section_record_data::get_column_name( $model );

			// value
				$user_id = $user_id ?? logged_user_id() ?? '-666';
				$locator_user_id = new locator();
					$locator_user_id->set_section_id($user_id);
					$locator_user_id->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator_user_id->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator_user_id->set_from_component_tipo($component_tipo);
			// add value
				$data->$column_name->$component_tipo = [$locator_user_id ];

		// WHAT (msg) # Message #####################################################################
			$component_tipo = self::$_COMPONENT_WHAT['tipo']; // dd545 component_select
			$model			= self::$_COMPONENT_WHAT['model_name'];
			$column_name	= section_record_data::get_column_name( $model );

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
					if(SHOW_DEBUG===true) {
						$bt = debug_backtrace();
						dump($bt, ' bt ++ '.to_string());
					}

				}else{
					$locator_what = new locator();
						$locator_what->set_section_id($what_section_id);
						$locator_what->set_section_tipo('dd42');
						$locator_what->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator_what->set_from_component_tipo($component_tipo);
					// add value
				$data->$column_name->$component_tipo = [ $locator_what ];
				}

		// WHERE (tipo) #############################################################################
			$component_tipo = self::$_COMPONENT_WHERE['tipo']; // dd546 component_input_text
			$model			= self::$_COMPONENT_WHERE['model_name'];
			$column_name	= section_record_data::get_column_name( $model );

			// value
				if(!strlen($tipo_where)) {
					$tipo_where = 'unknown';
				}
			// add value
				$value = (object)[
					'value' => [$tipo_where],
					'lang' => DEDALO_DATA_NOLAN
				];
				$data->$column_name->$component_tipo = [ $value ];

		// WHEN (Time. timestamp formatted) #########################################################
			$component_tipo = self::$_COMPONENT_WHEN['tipo']; // dd547 component_date
			$model			= self::$_COMPONENT_WHEN['model_name'];
			$column_name	= section_record_data::get_column_name( $model );

			// value
				$time_value = new stdClass();
					$time_value->start = component_date::get_date_now();
			// add value
				$data->$column_name->$component_tipo = [ $time_value ];

		// PROJECTS #################################################################################
			// $component_tipo = self::$_COMPONENT_PROJECTS['tipo']; // dd550 component_filter
			// $model			= self::$_COMPONENT_PROJECTS['model_name'];
			// $column_name	= section_record_data::get_column_name( $model );


			// if ( !empty($user_id) && $user_id!=='unknown' ) {
			// 	// value
			// 	$projects_dato = filter::get_user_projects( (int)$user_id );
			// 	if (!empty($projects_dato)) {
			// 		foreach ($projects_dato as $project_locator) {
			// 			if (isset($project_locator->from_component_tipo)) {
			// 				// Override from_component_tipo
			// 				$project_locator_safe = clone $project_locator;
			// 				$project_locator_safe->from_component_tipo = $component_tipo;

			// 				// add to section->relations array
			// 				$data[$column_name][$component_tipo][] = $project_locator_safe;
			// 			}
			// 		}
			// 	}
			// }

		// DATA (param 'log_data' + URL's ...)	#########################################################
			$component_tipo = self::$_COMPONENT_DATA['tipo']; // dd551 component_input_text
			$model			= self::$_COMPONENT_DATA['model_name'];

			$column_name	= section_record_data::get_column_name( $model );
			// value. Expected assoc array as ['msg'=> 'Upload file complete','data'=>'{string data...}']
				$dato_array = !is_array($log_data)
					? [$log_data]
					: $log_data;

			// add value
				$value = (object)[

					'value' => [$dato_array],
					'lang' => DEDALO_DATA_NOLAN

				];
				$data->$column_name->$component_tipo = [ $value ];

		// SECTION ##################################################################################
			matrix_activity_db_manager::create(
				'matrix_activity',
				DEDALO_ACTIVITY_SECTION_TIPO,
				$data
			);

		// debug
			if(SHOW_DEBUG===true) {
				// $total_time = exec_time_unit($start_time,'ms');
				// debug_log(__METHOD__.
				// 	' Activity log total time:  '.
				// 	$total_time.' ms',
				// 	logger::DEBUG
				// );
			}
	}//end log_message



	/**
	* LOG MESSAGES
	* 	LINE:
	*	MODULE  TIME  USER  IP  REFERRER  MESSAGE  SEVERITY_LEVEL  OPERATIONS
	*	IP_ADDRESS	WHO		WHAT	WHERE	WHEN	log_data
	*	QUE(like 'LOAD EDIT'), LOGLEVEL(INFO), TIPO(like 'dd120'), log_data(array of related info)
	*
	* @param string $message
	* 	sample: 'SAVE'
	* @param int $log_level = logger::INFO
	* 	sample: 75
	* @param string|null $tipo_where = null
	* 	sample: 'oh32'
	* @param string|null $operations = null
	* 	sample: null
	* @param array|null $log_data = null
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
	* @param int|null $user_id
	* @return void
	*/
	public function log_message(
		string $message,
		int $log_level=logger::INFO,
		?string $tipo_where=null,
		?string $operations=null,
		?array $log_data=null,
		?int $user_id=null
		) : void {

		// disable log
			if(logger_backend_activity::$enable_log===false) {
				return;
			}

		$options = (object)[
			'message'		=> $message,
			'log_level'		=> $log_level,
			'tipo_where'	=> $tipo_where,
			'operations'	=> $operations,
			'log_data'		=> $log_data,
			'user_id'		=> $user_id
		];

		register_shutdown_function([logger::$obj['activity'],'log_message_defer'], $options);
	}//end log_message



}//end class logger_backend_activity
