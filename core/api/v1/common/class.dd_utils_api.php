<?php
/**
* DD_UTILS_API
* Manage API RESP data with Dédalo
*
*/
class dd_utils_api {



	/**
	* DEDALO_VERSION
	* @return object $response
	*/
	public static function dedalo_version($request_options=null) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = (object)[
			'version' 	=>	DEDALO_VERSION,
			'build'		=>	DEDALO_BUILD
		];
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end dedalo_version



	/**
	* DATABASE_INFO
	* @return object $response
	*/
	public static function database_info($request_options=null) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		$info 			= pg_version(DBi::_getConnection());
		$info['host'] 	= to_string(DEDALO_HOSTNAME_CONN);

		$response->result = $info;
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end database_info



	/**
	* MAKE_BACKUP
	* @return object $response
	*/
	public static function make_backup($request_options=null) {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = backup::make_backup();
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end make_backup



	/**
	* UPDATE_STRUCTURE
	* @return object $response
	*/
	public static function update_structure($request_options=null) {
		global $start_time;

		// session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		# Remote server case
		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

			# Check remote server status before begins
			$remote_server_status = (object)backup::check_remote_server();
			if ($remote_server_status->result===true) {
				$response->msg 		.= $remote_server_status->msg;
			}else{
				$response->msg 		.= $remote_server_status->msg;
				$response->result 	= false;
				return (object)$response;
			}
		}

		# EXPORT. Before import, EXPORT ;-)
			$db_name = 'dedalo4_development_str_'.date("Y-m-d_Hi").'.custom';
			$res_export_structure = (object)backup::export_structure($db_name, $exclude_tables=false);	// Full backup
			if ($res_export_structure->result===false) {
				$response->msg = $res_export_structure->msg;
				return $response;
			}else{
				# Append msg
				$response->msg .= $res_export_structure->msg;
				# Exec time
				$export_exec_time	= exec_time_unit($start_time,'ms')." ms";
				$prev_time 			= microtime(1);
			}

		# IMPORT
			$res_import_structure = backup::import_structure();

			if ($res_import_structure->result===false) {
				$response->msg .= $res_import_structure->msg;
				return $response;
			}else{
				$response->msg .= $res_import_structure->msg;
				# Exec time
				$import_exec_time = exec_time_unit($prev_time,'ms')." ms";
			}

		// optimize tables
			backup::optimize_tables(['jer_dd','matrix_descriptors_dd','matrix_dd','matrix_list']);


		# Delete session config (force to recalculate)
		#unset($_SESSION['dedalo']['config']);

		# Delete session permissions table (force to recalculate)
		#unset($_SESSION['dedalo']['auth']['permissions_table']);

		# Delete all session data except auth
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key==='auth') continue;
				unset($_SESSION['dedalo'][$key]);
			}


		#
		# UPDATE JAVASCRIPT LABELS
			$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
			foreach ($ar_langs as $lang => $label) {
				$label_path  = '/common/js/lang/' . $lang . '.js';
				$ar_label 	 = label::get_ar_label($lang); // Get all properties
					#dump($ar_label, ' ar_label');

				file_put_contents( DEDALO_CORE_PATH.$label_path, 'var get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
				debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);
			}

		#
		# UPDATE STRUCTURE CSS
			$build_structure_css_response = (object)css::build_structure_css();
			if ($build_structure_css_response->result===false) {
				debug_log(__METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response), logger::ERROR);

				$response->result 	= false;
				$response->msg 		= __METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response);
				return $response;
			}


		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}


		return (object)$response;
	}//end update_structure



	/**
	* REGISTER_TOOLS
	* @return object $response
	*/
	public static function register_tools($request_options=null) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = tools_register::import_tools();
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end register_tools



	/**
	* BUILD_STRUCTURE_CSS
	* @return object $response
	*/
	public static function build_structure_css($request_options=null) {
		global $start_time;

		// session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = css::build_structure_css();
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end build_structure_css



	/**
	* UPDATE_VERSION
	* @return object $response
	*/
	public static function update_version($request_options=null) {
		global $start_time;

		// session_write_close();

		include(DEDALO_CORE_PATH . '/base/update/class.update.php');

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = update::update_version();
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end update_version



	/**
	* CONVERT_SEARCH_OBJECT_TO_SQL_QUERY
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query($request_options=null) {
		global $start_time;

		// session_write_close();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


		set_time_limit ( 259200 );  // 3 days

		if($search_query_object = json_decode($request_options->options)) {

			$search = search::get_instance($search_query_object);

			// search exec
				$rows = $search->search();

			// sql string query
				$sql_query = $rows->strQuery;

				$ar_lines = explode(PHP_EOL, $sql_query);
				$ar_final = array_map(function($line){
					$line = trim($line);
					if (strpos($line, '--')===0) {
						$line = '<span class="notes">'.$line.'</span>';
					}
					return $line;
				}, $ar_lines);
				$sql_query = implode(PHP_EOL, $ar_final);
				$sql_query = "<pre style=\"font-size:12px\">".$sql_query."</pre>";

			$response->result 	= true;
			$response->msg 		= $sql_query;
			$response->rows 	= $rows;
		}


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return (object)$response;
	}//end convert_search_object_to_sql_query



	/**
	* CHANGE_LANG
	* @return object $response
	*/
	public static function change_lang($request_options) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__METHOD__.']';

		// options
			$options 				= $request_options->options;
			$dedalo_data_lang 		= $options->dedalo_data_lang ?? null;
			$dedalo_application_lang= $options->dedalo_application_lang ?? null;

		// dedalo_data_lang
			if (!empty($dedalo_data_lang)) {
				$dedalo_data_lang = trim( safe_xss($dedalo_data_lang) );
				# Save in session
				$_SESSION['dedalo']['config']['dedalo_data_lang'] = $dedalo_data_lang;

				$response->msg .= ' Changed dedalo_data_lang to '.$dedalo_data_lang;
			}

		// dedalo_application_lang
			if (!empty($dedalo_application_lang)) {
				$dedalo_application_lang = trim( safe_xss($dedalo_application_lang) );
				# Save in session
				$_SESSION['dedalo']['config']['dedalo_application_lang'] = $dedalo_application_lang;

				$response->msg .= ' Changed dedalo_application_lang to '.$dedalo_application_lang;
			}

		session_write_close();

		// Debug
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$debug->options		= $options;
			$response->debug = $debug;

		debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);

		return (object)$response;
	}//end change_lang



	/**
	* LOGIN
	* @return object $response
	*/
	public static function login($request_options) {
		global $start_time;

		$options = new stdClass();
			$options->username = $request_options->options->username;
			$options->password = $request_options->options->auth;

		$response = (object)login::Login( $options );

		// Close script session
			session_write_close();

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}

		return (object)$response;
	}//end login



	/**
	* QUIT
	* @return object $response
	*/
	public static function quit($request_options) {
		global $start_time;

		$response = new stdClass();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__METHOD__.']';

		// Login type . Get before unset session
			$login_type = isset($_SESSION['dedalo']['auth']['login_type']) ? $_SESSION['dedalo']['auth']['login_type'] : 'default';

		// Quit action
			$result = login::Quit( $request_options->options );

		// Close script session
			session_write_close();

		// Response
			$response->result 	= $result;
			$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

			// saml logout
				if ($login_type==='saml' && defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
					$response->saml_redirect = SAML_CONFIG['logout_url'];
				}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}


		return (object)$response;
	}//end quit



	// /**
	// * GET_TIME_MACHILE_LIST
	// * Return an array of records of current section
	// * @return
	// */
	// public function get_time_machile_list($request_options=null) {

	// 	$options = new stdClass();
	// 		$options->section_tipo = null;
	// 		foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}



	// }//end get_time_machile_list




}//end dd_utils_api
