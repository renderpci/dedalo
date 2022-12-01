<?php
/**
* DD_UTILS_API
* Manage API REST data with Dédalo
*
*/
final class dd_utils_api {



	/**
	* GET_MENU (Moved to unified call to read->get-data !)
	* @return object $response
	*/
		// public static function get_menu($request_options=null) {
		// 	$start_time = start_time();

		// 	// session_write_close();

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// 	$menu = new menu();

		// 	// menu json
		// 		$get_json_options = new stdClass();
		// 			$get_json_options->get_context	= true;
		// 			$get_json_options->get_data		= true;
		// 		$menu_json = $menu->get_json($get_json_options);

		// 	$response->msg		= 'Ok. Request done';
		// 	$response->result	= $menu_json;

		// 	// Debug
		// 		if(SHOW_DEBUG===true) {
		// 			$debug = new stdClass();
		// 				$debug->exec_time		= exec_time_unit($start_time,'ms').' ms';
		// 				$debug->request_options	= $request_options;
		// 			$response->debug = $debug;
		// 		}

		// 	return $response;
		// }//end get_menu



	/**
	* GET_LOGIN_CONTEXT
	* This function is not used in normal login behavior (login is called directly in start API).
	* It could be called when the instance of the login has been build with autoload in true.
	* This function could be caller by external processes as install to get the context of the login to create the login instance
	* Login only need context, it not need data to be render.
	* @param object $rqo
	* @return object $response
	*/
	public static function get_login_context(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$login = new login();

		// login JSON
			$get_json_options = new stdClass();
				$get_json_options->get_context	= true;
				$get_json_options->get_data		= false;
			$login_json = $login->get_json($get_json_options);

		// context add
			$context = $login_json->context;

		// response
			$response->result	= $context;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end get_login_context



	/**
	* GET_INSTALL_CONTEXT
	* This function is an alias of get_element_context and does not need to login before
	* @param object $request_options
	* @return object $response
	*/
	public static function get_install_context(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$install = new install();

		// install JSON
			$get_json_options = new stdClass();
				$get_json_options->get_context	= true;
				$get_json_options->get_data		= false;
			$install_json = $install->get_json($get_json_options);

		// context add
			$context = $install_json->context;

		// response
			$response->result	= $context;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end get_install_context



	/**
	* DEDALO_VERSION
	* @return object $response
	*/
	public static function dedalo_version(object $request_options=null) : object {
		$start_time = start_time();

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = (object)[
			'version' 	=>	DEDALO_VERSION,
			'build'		=>	DEDALO_BUILD
		];
		$response->msg 	  = 'Ok. Request done';


		return $response;
	}//end dedalo_version



	/**
	* DATABASE_INFO
	* @return object $response
	*/
	public static function database_info(object $request_options=null) : object {
		$start_time = start_time();

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$info			= pg_version(DBi::_getConnection());
		$info['host']	= to_string(DEDALO_HOSTNAME_CONN);

		$response->result	= $info;
		$response->msg		= 'Ok. Request done';


		return $response;
	}//end database_info


	/**
	* GET_SYSTEM_INFO
	* @return object response
	*/
	public static function get_system_info(object $request_options=null) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// Returns a file size limit in bytes based on the PHP upload_max_filesize
		// and post_max_size
		function file_upload_max_size() {
		  static $max_size = -1;

		  if ($max_size < 0) {
			// Start with post_max_size.
			$post_max_size = parse_size(ini_get('post_max_size'));
			if ($post_max_size > 0) {
			  $max_size = $post_max_size;
			}

			// If upload_max_size is less, then reduce. Except if upload_max_size is
			// zero, which indicates no limit.
			$upload_max = parse_size(ini_get('upload_max_filesize'));
			if ($upload_max > 0 && $upload_max < $max_size) {
			  $max_size = $upload_max;
			}
		  }
		  return $max_size;
		}

		function parse_size($size) {
		  $unit = preg_replace('/[^bkmgtpezy]/i', '', $size); // Remove the non-unit characters from the size.
		  $size = preg_replace('/[^0-9\.]/', '', $size); // Remove the non-numeric characters from the size.
		  if ($unit) {
			// Find the position of the unit in the ordered string which is the power of magnitude to multiply a kilobyte by.
			return round($size * pow(1024, stripos('bkmgtpezy', $unit[0])));
		  }
		  else {
			return round($size);
		  }
		}

		$upload_tmp_dir = ini_get('upload_tmp_dir');

		// system_info
			$system_info = new stdClass();
				$system_info->max_size_bytes 		= file_upload_max_size();
				$system_info->sys_get_temp_dir 		= sys_get_temp_dir();
				$system_info->upload_tmp_dir 		= $upload_tmp_dir;
				$system_info->upload_tmp_perms 		= fileperms($upload_tmp_dir);
				$system_info->session_cache_expire  = (int)ini_get('session.cache_expire');


		// response
			$response->result 	= $system_info;
			$response->msg 		= 'OK. Request done';

		return $response;
	}//end get_system_info



	/**
	* MAKE_BACKUP
	* @return object $response
	*/
	public static function make_backup(object $request_options=null) : object {
		$start_time = start_time();

		// ssession_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= backup::make_backup();
		$response->msg		= 'Ok. Request done';


		return $response;
	}//end make_backup



	/**
	* UPDATE_ONTOLOGY
	* @return object $response
	*/
	public static function update_ontology(object $request_options=null) : object {
		$start_time = start_time();

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$request_options->options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value;
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));
			if (empty($ar_dedalo_prefix_tipos)) {
				$response->msg .= ' - Empty dedalo_prefix_tipos value!';
				return $response;
			}

		# Remote server case
		if(defined('STRUCTURE_FROM_SERVER') && STRUCTURE_FROM_SERVER===true) {

			debug_log(__METHOD__." Checking remote_server status. Expected header code 200 .... ".to_string(), logger::DEBUG);

			# Check remote server status before begins
			$remote_server_response = (object)backup::check_remote_server();

			if(SHOW_DEBUG===true) {
				$check_status_exec_time = exec_time_unit($start_time,'ms').' ms';
				debug_log(__METHOD__." REMOTE_SERVER_STATUS ($check_status_exec_time): ".to_string($remote_server_response), logger::DEBUG);
			}

			if (	$remote_server_response->result!==false
				 && $remote_server_response->code===200
				 && $remote_server_response->error===false) {
				$response->msg		.= $remote_server_response->msg;
			}else{
				$response->msg		.= $remote_server_response->msg;
				$response->result	= false;
				return $response;
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
				$response->msg	.= $res_export_structure->msg;
				# Exec time
				$export_exec_time	= exec_time_unit($start_time,'ms').' ms';
				$prev_time			= start_time();
			}

		# IMPORT
			$import_structure_response = backup::import_structure(
				'dedalo4_development_str.custom', // string db_name
				true, // bool check_server
				$ar_dedalo_prefix_tipos
			);
			if ($import_structure_response->result===false) {
				$response->msg	.= $import_structure_response->msg;
				return $response;
			}else{
				$response->msg	.= $import_structure_response->msg;
				# Exec time
				$import_exec_time = exec_time_unit($prev_time,'ms').' ms';
			}

		// optimize tables
			$ar_tables = ['jer_dd','matrix_descriptors_dd','matrix_dd','matrix_list'];
			backup::optimize_tables($ar_tables);


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
			$ar_langs = DEDALO_APPLICATION_LANGS;
			foreach ($ar_langs as $lang => $label) {
				$label_path	= '/common/js/lang/' . $lang . '.js';
				$ar_label	= label::get_ar_label($lang); // Get all properties
				file_put_contents( DEDALO_CORE_PATH.$label_path, json_encode($ar_label, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
				debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);
			}

		#
		# UPDATE STRUCTURE CSS
			$build_structure_css_response = (object)css::build_structure_css();
			if ($build_structure_css_response->result===false) {
				debug_log(__METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response), logger::ERROR);

				$response->result	= false;
				$response->msg		= __METHOD__." Error on build_structure_css: ".to_string($build_structure_css_response);
				return $response;
			}


		$response->result	= true;
		$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';


		return $response;
	}//end update_ontology



	/**
	* STRUCTURE_TO_JSON
	* @return object $response
	*/
	public static function structure_to_json(object $request_options=null) : object {
		$start_time = start_time();

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$request_options->options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value;
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));
			if (empty($ar_dedalo_prefix_tipos)) {
				$response->msg .= ' - Empty dedalo_prefix_tipos value!';
				return $response;
			}


		$ar_tld		= $ar_dedalo_prefix_tipos;
		$json_data	= backup::structure_to_json($ar_tld);

		$file_name	= 'structure.json';
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : STRUCTURE_DOWNLOAD_DIR) . '/' . $file_name;

		if(!file_put_contents($file_path, json_encode($json_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX)) {
			// write error occurred
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']. Impossible to write json file';
			return $response;
		}

		$response->result	= true;
		$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';


		return $response;
	}//end structure_to_json



	/**
	* IMPORT_STRUCTURE_FROM_JSON
	* @return object $response
	*/
	public static function import_structure_from_json(object $request_options=null) : object {
		$start_time = start_time();

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$request_options->options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value;
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));


		$ar_tld	= empty($ar_dedalo_prefix_tipos) ? [] : $ar_dedalo_prefix_tipos;

		$file_name	= 'structure.json';
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : STRUCTURE_DOWNLOAD_DIR) . '/' . $file_name;

		$data		= json_decode( file_get_contents($file_path) );
		$response	= backup::import_structure_json_data($data, $ar_tld);

		$response->result	= true;
		$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';


		return $response;
	}//end import_structure_from_json



	/**
	* REGISTER_TOOLS
	* @return object $response
	*/
	public static function register_tools(object $request_options=null) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= tools_register::import_tools();
		$response->msg		= 'Ok. Request done';


		return $response;
	}//end register_tools



	/**
	* BUILD_STRUCTURE_CSS *DEPERECATED*
	* @return object $response
	*/
	public static function build_structure_css(object $request_options=null) : object {
		$start_time = start_time();

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= css::build_structure_css();
		$response->msg		= 'Ok. Request done';


		return $response;
	}//end build_structure_css



	/**
	* BUILD_INSTALL_VERSION
	* @return object $response
	*/
	public static function build_install_version(object $request_options=null) : object {

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= install::build_install_version();
		$response->msg		= 'OK. Request done';


		return $response;
	}//end build_install_version



	/**
	* UPDATE_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	* Triggered by Area Development button 'UPADTE DATA'
	* Sample: Current data version: 5.8.2 -----> 6.0.0
	* @param object@null $request_options
	* @return object $response
	*/
	public static function update_version(object $request_options=null) : object {
		$start_time = start_time();

		// set time limit
			set_time_limit ( 259200 );  // 3 days

		include(DEDALO_CORE_PATH . '/base/update/class.update.php');

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// exec update_version. return object response
			$update_version_response = update::update_version();

		$response->result	= $update_version_response->result ?? false;
		$response->msg		= $update_version_response->msg ?? 'Error. Request failed ['.__FUNCTION__.']';


		return $response;
	}//end update_version



	/**
	* CONVERT_SEARCH_OBJECT_TO_SQL_QUERY
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query(object $request_options=null) : object {
		$start_time = start_time();

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


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

			$response->result	= true;
			$response->msg		= $sql_query;
			$response->rows		= $rows;
		}


		return $response;
	}//end convert_search_object_to_sql_query



	/**
	* CHANGE_LANG
	* @return object $response
	*/
	public static function change_lang(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'Ok. Request done ['.__METHOD__.']';

		// options
			$options					= $request_options->options;
			$dedalo_data_lang			= $options->dedalo_data_lang ?? null;
			$dedalo_application_lang	= $options->dedalo_application_lang ?? null;

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

		// debug
			debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);


		return $response;
	}//end change_lang



	/**
	* LOGIN
	* @return object $response
	*/
	public static function login(object $request_options) : object {
		$start_time = start_time();

		$options = new stdClass();
			$options->username	= $request_options->options->username;
			$options->password	= $request_options->options->auth;

		$response = (object)login::Login( $options );

		// force to calculate user permissions useful for menu etc.
			// $ar_permisions_areas	= security::get_ar_authorized_areas_for_user();
			// $areas					= area::get_areas();
			// $ar_label				= label::get_ar_label();


		return $response;
	}//end login



	/**
	* QUIT
	* @return object $response
	*/
	public static function quit(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'Ok. Request done ['.__METHOD__.']';

		// Login type . Get before unset session
			$login_type = isset($_SESSION['dedalo']['auth']['login_type']) ? $_SESSION['dedalo']['auth']['login_type'] : 'default';

		// Quit action
			$result = login::Quit( $request_options->options );

		// Close script session
			session_write_close();

		// Response
			$response->result	= $result;
			$response->msg		= 'Ok. Request done ['.__FUNCTION__.']';

			// saml logout
				if ($login_type==='saml' && defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
					$response->saml_redirect = SAML_CONFIG['logout_url'];
				}


		return $response;
	}//end quit



	/**
	* INSTALL
	* Control the install process calls to be re-direct to the correct actions
	* @param object $request_options
	* @return object $response
	*/
	public static function install(object $request_options) : object {

		$action	= $request_options->options->action;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// check the dedalo install status (config_auto.php)
		// When install is finished, it will be set automatically to 'installed'
		if(
			defined('DEDALO_INSTALL_STATUS')
			&& DEDALO_INSTALL_STATUS==='installed'
			&& $action!=='install_hierarchies'
		){
			$response->msg		= 'Error. Request not valid, Dédalo was installed';
			return $response;
		}

		switch ($action) {
			case 'install_db_from_default_file':

				// check db is already imported for security
					$db_tables		= backup::get_tables(); // returns array empty if not is imported
					$db_is_imported	= (bool)in_array('matrix_users', $db_tables);
					if ($db_is_imported===true) {
						$response->msg  = 'Error. Current database is not empty: ' . DEDALO_DATABASE_CONN .'. ';
						$response->msg .= "Maybe your DEDALO_INSTALL_STATUS var it's not set as 'installed'";
						return $response;
					}

				// exec
					$response = (object)install::install_db_from_default_file();

				break;
			case 'install_hierarchies':

				// check login for security
					if (login::is_logged()!==true) {
						$response->msg = 'Error. You are not logged in';
						return $response;
					}

				$install_hierarchies_options = $request_options->options;

				// exec
					$response = (object)install::install_hierarchies( $install_hierarchies_options );

				break;
			case 'set_root_pw':

				//exec
					$response = (object)install::set_root_pw($request_options->options);
				break;

			case 'install_finish':

				//exec
					$response = (object)install::set_install_status('installed');
				break;
			default:
				$response->msg		= 'Error. Request not valid';
				break;
		}


		return $response;
	}//end install



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



	/**
	* REGENERATE_RELATIONS
	* @return object $response
	*/
	public static function regenerate_relations(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'Ok. Request done ['.__METHOD__.']';

		session_write_close();

		// tables value
			$item_tables = array_find($request_options->options, function($item){
				return $item->name==='tables';
			});

			$tables = $item_tables->value;
			if (empty($tables) || !is_string($tables)) {
				return $response;
			}

		// generate_relations_table_data
		$response = area_development::generate_relations_table_data($tables);


		return $response;
	}//end regenerate_relations



	/**
	* UPLOAD
	* Manages given upload file
	* Sample expected $json_data:
	* {
	*	"action": "upload",
	*	"fileToUpload": { 	(assoc array)
	*		"name"			: "exported_plantillas-web_-1-dd477.csv",
	*		"full_path"		: "exported_plantillas-web_-1-dd477.csv",
	*		"type"			: "text/csv",
	*		"tmp_name"		: "/private/var/tmp/phpQ02UUO",
	*		"error"			: 0,
	*		"size"			: 29892
	*	}
	*	"prevent_lock": true
	* }
	* @return object $response
	*/
	public static function upload(object $request_options) : object {
		$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. '.label::get_label('error_al_subir_el_archivo');

		// debug
			debug_log(__METHOD__." --> received request_options: ".to_string($request_options), logger::DEBUG);

		// request_options
			$fileToUpload	= $request_options->fileToUpload ?? $request_options->upload;	// assoc array Added from PHP input '$_FILES'
			$resource_type	= $request_options->resource_type; // string like 'tool_upload'

		// check for upload issues
		try {

			// Undefined | Multiple Files | $_FILES Corruption Attack
			// If this request falls under any of them, treat it invalid.
				if (
					!isset($fileToUpload['error']) ||
					is_array($fileToUpload['error'])
				) {
					// throw new RuntimeException('Invalid parameters. (1)');
					$msg = ' upload: Invalid parameters. (1)';
					error_log($msg);
					$response->msg .= $msg;
					return $response;
				}

			// Check $fileToUpload['error'] value.
				switch ($fileToUpload['error']) {
					case UPLOAD_ERR_OK:
						break;
					case UPLOAD_ERR_NO_FILE:
						// throw new RuntimeException('No file sent.');
						$msg = ' upload: No file sent.';
						error_log($msg);
						$response->msg .= $msg;
						return $response;
						break;
					case UPLOAD_ERR_INI_SIZE:
					case UPLOAD_ERR_FORM_SIZE:
						// throw new RuntimeException('Exceeded filesize limit.');
						$msg = ' upload: Exceeded filesize limit.';
						error_log($msg);
						$response->msg .= $msg;
						return $response;
						break;
					default:
						// throw new RuntimeException('Unknown errors.');
						$msg = ' upload: Unknown errors.';
						error_log($msg);
						$response->msg .= $msg;
						return $response;
						break;
				}

			// You should also check filesize here.
				// if ($fileToUpload['size'] > 1000000) {
				// 	throw new RuntimeException('Exceeded filesize limit.');
				// }

			// Do not trust $fileToUpload['mime'] VALUE !!
			// Check MIME Type by yourself.
				$finfo				= new finfo(FILEINFO_MIME_TYPE);
				$file_mime			= $finfo->file($fileToUpload['tmp_name']); // ex. string 'text/plain'
				$known_mime_types	= self::get_known_mime_types();
				if (false===array_search(
					$file_mime,
					$known_mime_types,
					true
					)) {
					// throw new RuntimeException('Invalid file format.');
					debug_log(__METHOD__." Error. Stopped upload unknown file mime type: ".to_string($file_mime).' - name: '.to_string($fileToUpload['tmp_name']), logger::ERROR);
					$msg = ' upload: Invalid file format. (mime: '.$file_mime.')';
					$response->msg .= $msg;
					return $response;
				}

				// check for upload server errors
					$uploaded_file_error		= $fileToUpload['error'];
					$uploaded_file_error_text	= self::error_number_to_text($uploaded_file_error);
					if ($uploaded_file_error!==0) {
						$response->msg .= ' - '.$uploaded_file_error_text;
						return $response;
					}

				// check file is available in temp dir
					if(!file_exists($fileToUpload['tmp_name'])) {
						debug_log(__METHOD__." Error on locate temporary file ".$fileToUpload['tmp_name'], logger::ERROR);
						$response->msg .= "Uploaded file not found in temporary folder";
						return $response;
					}

				// check extension
					$extension			= strtolower( pathinfo($fileToUpload['name'], PATHINFO_EXTENSION) );
					$allowed_extensions	= array_keys($known_mime_types);
					if (!in_array($extension, $allowed_extensions)) {
						$response->msg .= "Error. Invalid file extension ".$extension;
						debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
						return $response;
					}

			// manage uploaded file
				if (!defined('DEDALO_UPLOAD_TMP_DIR')) {
					debug_log(__METHOD__." DEDALO_UPLOAD_TMP_DIR is not defined. Please, define constant 'DEDALO_UPLOAD_TMP_DIR' in config file. (Using fallback value instead: DEDALO_MEDIA_PATH . '/import/file') ".to_string(), logger::ERROR);
					$response->msg .= " Config constant 'DEDALO_UPLOAD_TMP_DIR' is mandatory!";
					return $response;
				}
				$dir = DEDALO_UPLOAD_TMP_DIR . '/' . $resource_type;

				// Check the target_dir, if it's not created will be make to be used.
					// Target folder exists test
					if( !is_dir($dir) ) {
						if(!mkdir($dir, 0700, true)) {
							$response->msg .= ' Error on read or create UPLOAD_TMP_DIR directory. Permission denied';
							return $response;
						}
						debug_log(__METHOD__." CREATED DIR: $dir  ".to_string(), logger::DEBUG);
					}
				// move file to target path
					$name			= basename($fileToUpload['tmp_name']);
					$target_path	= $dir . '/' . $name;
					$moved			= move_uploaded_file($fileToUpload['tmp_name'], $target_path);
					// verify move file is successful
					if ($moved!==true) {
						debug_log(__METHOD__.PHP_EOL
							.'Error on get/move temp file to target_path '.PHP_EOL
							.'source: '.$fileToUpload['tmp_name'].PHP_EOL
							.'target: '.$target_path,
							 logger::ERROR
						);
						$response->msg .= 'Uploaded file Error on get/move to target_path.';
						return $response;
					}

			// file_data to client. POST file (sent across $_FILES) info and some additions
				// Example of received data:
				// "fileToUpload": {
				//		"name": "exported_plantillas-web_-1-dd477.csv",
				//		"full_path": "exported_plantillas-web_-1-dd477.csv",
				//		"type": "text/csv",
				//		"tmp_name": "/private/var/tmp/phpQ02UUO",
				//		"error": 0,
				//		"size": 29892
				// }
				$file_data = new stdClass();
					$file_data->name			= $fileToUpload['name']; // like 'My Picture 1.jpg'
					$file_data->type			= $fileToUpload['type']; // like 'image\/jpeg'
					// $file_data->tmp_name		= $target_path; // do not include for safety
					$file_data->tmp_dir			= 'DEDALO_UPLOAD_TMP_DIR'; // like DEDALO_MEDIA_PATH . '/upload/service_upload/tmp'
					$file_data->resource_type	= $resource_type; // like 'tool_upload'
					$file_data->tmp_name		= $name; // like 'phpv75h2K'
					$file_data->error			= $fileToUpload['error']; // like 0
					$file_data->size			= $fileToUpload['size']; // like 878860 (bytes)
					$file_data->extension		= $extension;

			// resource_type cases response
				switch ($resource_type) {

					case 'web': // uploading images from text editor
						$safe_file_name	= sanitize_file_name($fileToUpload['name']); // clean file name
						$file_path		= DEDALO_MEDIA_PATH . '/image' . DEDALO_IMAGE_WEB_FOLDER . '/' . $safe_file_name;
						$file_url		= DEDALO_MEDIA_URL  . '/image' . DEDALO_IMAGE_WEB_FOLDER . '/' . $safe_file_name;
						$current_path	= $target_path;
						$response		= rename($current_path, $file_path)
							? (object)['url' => $file_url]
							: (object)['error' => 'Error moving file'];
						// debug
							debug_log(__METHOD__." --> saved file as : ".$file_path, logger::DEBUG);
						break;

					default:
						// all is OK response
						$response->result		= true;
						$response->file_data	= $file_data;
						$response->msg			= 'OK. '.label::get_label('fichero_subido_con_exito');
						break;
				}

		}catch (RuntimeException $e) {

			$response->msg .= ' Request failed: '. $e->getMessage();
			debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
		}


		return $response;
	}//end upload



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* Connects to database and updates user lock components state
	* on focus or blur user actions
	* @return object $response
	*/
	public static function update_lock_components_state(object $request_options) : object {

		// Ignore user abort load page
		ignore_user_abort(true);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// short vars
			$section_id		= $request_options->section_id;
			$section_tipo	= $request_options->section_tipo;
			$component_tipo	= $request_options->component_tipo;
			$action			= $request_options->action;
			$user_id		= (int)navigator::get_user_id();
			$full_username	= ($user_id<0)
				? 'Debug user'
				: $_SESSION['dedalo']['auth']['full_username'];

		// event_element
			$event_element = new stdClass();
				$event_element->section_id		= $section_id;
				$event_element->section_tipo	= $section_tipo;
				$event_element->component_tipo	= $component_tipo;
				$event_element->action			= $action;
				$event_element->user_id			= $user_id;
				$event_element->full_username	= $full_username;
				$event_element->date			= date("Y-m-d H:i:s");

		// response
			$response = (object)lock_components::update_lock_components_state( $event_element );


		return $response;
	}//end update_lock_components_state



	/**
	* GET_DEDALO_FILES
	* Connects to database and updates user lock components state
	* on focus or blur user actions
	* @return object $response
	*/
	public static function get_dedalo_files(object $request_options=null) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// get files
			$files = [];
			// css
			$files[] = (object)[
				'type'	=> 'css',
				'url'	=>  DEDALO_CORE_URL . '/page/css/main.css'
			];
			// js
			$core_js_files	= self::get_dir_files(DEDALO_CORE_PATH, ['js'], function($el) {
				// remove self base directory from file path
				$file = str_replace(DEDALO_CORE_PATH, '', $el);
				if ( stripos($file, '/acc/')!==false || stripos($file, '/old/')!==false) {
					return null; // item does not will be added to the result
				}
				return DEDALO_CORE_URL . '' . $file;
			});
			foreach ($core_js_files as $url) {
				$files[] = (object)[
					'type'	=> 'js',
					'url'	=>  $url
				];
			}
			$tools_js_files	= self::get_dir_files(DEDALO_TOOLS_PATH, ['js','css'], function(string $el) : ?string {
				// remove self base directory from file path
				$file = str_replace(DEDALO_TOOLS_PATH, '', $el);
				if ( stripos($file, '/acc/')!==false || stripos($file, '/old/')!==false) {
					return null; // item does not will be added to the result
				}
				return DEDALO_TOOLS_URL . '' . $file;
			});
			foreach ($tools_js_files as $file_url) {
				$files[] = (object)[
					'type'	=> 'js',
					'url'	=>  $file_url
				];
			}

		// response
			$response->result = $files;
			$response->msg = 'OK. Request done successfully';


		return $response;
	}//end get_dedalo_files



	/**
	* CREATE_TEST_RECORD
	* This record it's necessary to run unit_test checks
	* Table 'matrix_test' must to exists
	* @return object $response
	*/
	public static function create_test_record(object $request_options=null) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		// short vars
			$db_conn		= DBi::_getConnection();
			$section_tipo	= 'test3';
			$table			= 'matrix_test';

		$dato = trim('
			{
			  "relations": [],
			  "components": {},
			  "modified_date": "2022-10-07 11:16:43",
			  "diffusion_info": null,
			  "modified_by_userID": 1
			}
		');
		$sql = '
			TRUNCATE "'.$table.'";
			ALTER SEQUENCE '.$table.'_id_seq RESTART WITH 1;
			INSERT INTO "'.$table.'" ("section_id", "section_tipo", "datos") VALUES (\'1\', \''.$section_tipo.'\', \''.$dato.'\');
		';
		debug_log(__METHOD__." Executing DB query ".to_string($sql), logger::WARNING);
		$result   = pg_query($db_conn, $sql);
		if (!$result) {
			$msg = " Error on db execution (matrix_counter): ".pg_last_error(DBi::_getConnection());
			debug_log(__METHOD__.$msg, logger::ERROR);
			$response->msg = $msg;
			return $response;
		}


		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end create_test_record



	// private methods ///////////////////////////////////



	/**
	* GET_DIR_FILES
	* Get directory files recursively
	* @param string $dir
	* @param array $ext
	* @param callable $format
	*
	* @return array $files
	*/
	private static function get_dir_files( string $dir, array $ext, callable $format ) : array {

		$rii = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $dir )
		);

		$files = array();
		foreach ($rii as $file) {

			if ($file->isDir()){
				continue;
			}

			$file_ext = $file->getExtension();
			if (!in_array($file_ext, $ext)) {
				continue;
			}

			$file_path		= $file->getPathname();
			$file_base_name	= $format($file_path);

			if (!empty($file_base_name)) {
				$files[] = $file_base_name;
			}
		}

		return $files;
	}//end get_dir_files



	/**
	* ERROR_NUMBER_TO_TEXT
	* @param int $f_error_number
	* @return string $f_error_text
	*/
	private static function error_number_to_text(int $f_error_number) : string {

		if( $f_error_number===0 ) {
						 # all is OK
						 $f_error_text = label::get_label('archivo_subido_con_exito');
		}else{
			switch($f_error_number) {
						 # Error by number
				case 1 : $f_error_text = label::get_label('el_archivo_subido_excede_de_la_directiva');	break;
				case 2 : $f_error_text = label::get_label('el_archivo_subido_excede_el_tamano_maximo');	break;
				case 3 : $f_error_text = label::get_label('el_archivo_subido_fue_solo_parcialmente_cargado');	break;
				case 4 : $f_error_text = label::get_label('ningun_archivo_fue_subido');	break;
				case 6 : $f_error_text = label::get_label('carpeta_temporal_no_accesible');	break;
				case 7 : $f_error_text = label::get_label('no_se_pudo_escribir_el_archivo_en_el_disco');	break;
				case 8 : $f_error_text = label::get_label('una_extension_de_php_detuvo_la_carga_de_archivos');	break;
			}
		}

		return $f_error_text;
	}//end error_number_to_text



	/**
	* GET_KNOWN_MIME_TYPES
	* @return array $mime_types
	*/
	private static function get_known_mime_types() : array {

		$mime_types = array(

			'txt'	=> 'text/plain',
			'htm'	=> 'text/html',
			'html'	=> 'text/html',
			'php'	=> 'text/html',
			'css'	=> 'text/css',
			'csv'	=> 'text/csv',
			'js'	=> 'application/javascript',
			'json'	=> 'application/json',
			'xml'	=> 'application/xml',
			'swf'	=> 'application/x-shockwave-flash',
			'flv'	=> 'video/x-flv',

			// images
			'png'	=> 'image/png',
			'jpe'	=> 'image/jpeg',
			'jpeg'	=> 'image/jpeg',
			'jpg'	=> 'image/jpeg',
			'gif'	=> 'image/gif',
			'bmp'	=> 'image/bmp',
			'ico'	=> 'image/vnd.microsoft.icon',
			'tiff'	=> 'image/tiff',
			'tif'	=> 'image/tiff',
			'svg'	=> 'image/svg+xml',
			'svgz'	=> 'image/svg+xml',
			'heic'	=> 'image/heic',

			// archives
			'zip'	=> 'application/zip',
			'rar'	=> 'application/x-rar-compressed',
			'exe'	=> 'application/x-msdownload',
			'msi'	=> 'application/x-msdownload',
			'cab'	=> 'application/vnd.ms-cab-compressed',

			// audio/video
			'mp3'	=> 'audio/mpeg',
			'mp4'	=> 'video/mp4',
			'qt'	=> 'video/quicktime',
			'mov'	=> 'video/quicktime',

			// 3d
			'glb'	=> 'model/gltf-binary',
			'gltf'	=> 'model/gltf+json',
			'obj'	=> 'model/obj',
			'fbx'	=> 'application/octet-stream',
			'dae'	=> 'model/vnd.collada+xml',

			// adobe
			'pdf'	=> 'application/pdf',
			'psd'	=> 'image/vnd.adobe.photoshop',
			'ai'	=> 'application/postscript',
			'eps'	=> 'application/postscript',
			'ps'	=> 'application/postscript',

			// ms office
			'doc'	=> 'application/msword',
			'rtf'	=> 'application/rtf',
			'xls'	=> 'application/vnd.ms-excel',
			'ppt'	=> 'application/vnd.ms-powerpoint',

			// open office
			'odt'	=> 'application/vnd.oasis.opendocument.text',
			'ods'	=> 'application/vnd.oasis.opendocument.spreadsheet',
		);

		return $mime_types;
	}//end get_known_mime_types



}//end dd_utils_api
