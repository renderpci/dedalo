<?php
/**
* DD_UTILS_API
* Manage API RESP data with Dédalo
*
*/
class dd_utils_api {



	/**
	* GET_MENU (Moved to unified call to read->get-data !)
	* @return object $response
	*/
		// public static function get_menu($request_options=null) {
		// 	global $start_time;

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
		// 				$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
		// 				$debug->request_options	= $request_options;
		// 			$response->debug = $debug;
		// 		}

		// 	return $response;
		// }//end get_menu



	/**
	* GET_LOGIN (!) No longer used. Login now only need context, no data to render
	* @return object $response
	*/
		// public static function get_login($request_options=null) {
		// 	global $start_time;

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

		// 	$login = new login();

		// 	// login json
		// 		$get_json_options = new stdClass();
		// 			$get_json_options->get_context	= true;
		// 			$get_json_options->get_data		= true;
		// 		$login_json = $login->get_json($get_json_options);

		// 	$response->msg		= 'Ok. Request done';
		// 	$response->result	= $login_json;

		// 	// Debug
		// 		if(SHOW_DEBUG===true) {
		// 			$debug = new stdClass();
		// 				$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
		// 				$debug->request_options	= $request_options;
		// 			$response->debug = $debug;
		// 		}

		// 	return $response;
		// }//end get_login



	/**
	* DEDALO_VERSION
	* @return object $response
	*/
	public static function dedalo_version(object $request_options=null) : object {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = (object)[
			'version' 	=>	DEDALO_VERSION,
			'build'		=>	DEDALO_BUILD
		];
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end dedalo_version



	/**
	* DATABASE_INFO
	* @return object $response
	*/
	public static function database_info(object $request_options=null) : object {
		global $start_time;

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$info			= pg_version(DBi::_getConnection());
		$info['host']	= to_string(DEDALO_HOSTNAME_CONN);

		$response->result	= $info;
		$response->msg		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

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
		global $start_time;

		// ssession_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= backup::make_backup();
		$response->msg		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end make_backup



	/**
	* UPDATE_STRUCTURE
	* @return object $response
	*/
	public static function update_structure(object $request_options=null) : object {
		global $start_time;

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
				$check_status_exec_time = exec_time_unit($start_time,'ms')." ms";
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
				$export_exec_time	= exec_time_unit($start_time,'ms')." ms";
				$prev_time			= start_time();
			}

		# IMPORT
			$res_import_structure = backup::import_structure($db_name='dedalo4_development_str.custom', $check_server=true, $ar_dedalo_prefix_tipos);

			if ($res_import_structure->result===false) {
				$response->msg	.= $res_import_structure->msg;
				return $response;
			}else{
				$response->msg	.= $res_import_structure->msg;
				# Exec time
				$import_exec_time = exec_time_unit($prev_time,'ms')." ms";
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
				file_put_contents( DEDALO_CORE_PATH.$label_path, 'const get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
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


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}


		return $response;
	}//end update_structure



	/**
	* STRUCTURE_TO_JSON
	* @return object $response
	*/
	public static function structure_to_json(object $request_options=null) : object {
		global $start_time;

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


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}


		return $response;
	}//end structure_to_json



	/**
	* IMPORT_STRUCTURE_FROM_JSON
	* @return object $response
	*/
	public static function import_structure_from_json(object $request_options=null) : object {
		global $start_time;

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


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options = $request_options;
				$response->debug = $debug;
			}


		return $response;
	}//end import_structure_from_json



	/**
	* REGISTER_TOOLS
	* @return object $response
	*/
	public static function register_tools(object $request_options=null) : object {
		global $start_time;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= tools_register::import_tools();
		$response->msg		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end register_tools



	/**
	* BUILD_STRUCTURE_CSS
	* @return object $response
	*/
	public static function build_structure_css(object $request_options=null) : object {
		global $start_time;

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= css::build_structure_css();
		$response->msg		= 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end build_structure_css



	/**
	* UPDATE_VERSION
	* @return object $response
	*/
	public static function update_version(object $request_options=null) : object {
		global $start_time;

		// session_write_close();

		include(DEDALO_CORE_PATH . '/base/update/class.update.php');

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result = update::update_version();
		$response->msg 	  = 'Ok. Request done';

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end update_version



	/**
	* CONVERT_SEARCH_OBJECT_TO_SQL_QUERY
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query(object $request_options=null) : object {
		global $start_time;

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


		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end convert_search_object_to_sql_query



	/**
	* CHANGE_LANG
	* @return object $response
	*/
	public static function change_lang(object $request_options) : object {
		global $start_time;

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

		// Debug
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$debug->options		= $options;
			$response->debug = $debug;

		debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);


		return $response;
	}//end change_lang



	/**
	* LOGIN
	* @return object $response
	*/
	public static function login(object $request_options) : object {
		global $start_time;

		$options = new stdClass();
			$options->username	= $request_options->options->username;
			$options->password	= $request_options->options->auth;

		$response = (object)login::Login( $options );

		// force to calculate user permissions useful for menu etc.
			// $ar_permisions_areas	= security::get_ar_authorized_areas_for_user();
			// $areas					= area::get_areas();
			// $ar_label				= label::get_ar_label();

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}

		return $response;
	}//end login



	/**
	* QUIT
	* @return object $response
	*/
	public static function quit(object $request_options) : object {
		global $start_time;

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

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";

				$response->debug = $debug;
			}


		return $response;
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



	/**
	* REGENERATE_RELATIONS
	* @return object $response
	*/
	public static function regenerate_relations(object $request_options) : object {
		global $start_time;

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

		// Debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
					$debug->request_options	= $request_options;
				$response->debug = $debug;
			}

		return $response;
	}//end regenerate_relations



	/**
	* UPLOAD
	* Manages given upload file
	* Sample expected $json_data:
	* {
	*	"action": "upload",
	* 	"fileToUpload": {
	*        "name": "exported_plantillas-web_-1-dd477.csv",
	*        "full_path": "exported_plantillas-web_-1-dd477.csv",
	*        "type": "text/csv",
	*        "tmp_name": "/private/var/tmp/phpQ02UUO",
	*        "error": 0,
	*        "size": 29892
	*    }
	*	"prevent_lock": true
	* }
	* @return object $response
	*/
	public static function upload(object $request_options) : object {
		global $start_time;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. '.label::get_label('error_al_subir_el_archivo');

		// debug
			debug_log(__METHOD__." --> received request_options: ".to_string($request_options), logger::DEBUG);

		// short vars
			$fileToUpload	= $request_options->fileToUpload;	// Added from PHP input '$_FILES'
			$resource_type	= $request_options->resource_type; // like 'tool_upload'

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

			// DO NOT TRUST $fileToUpload['mime'] VALUE !!
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
					// debug_log(__METHOD__." Warning. Accepted upload unknow file mime type: ".to_string($file_mime).' - name: '.to_string($fileToUpload['tmp_name']), logger::ERROR);
					$msg = ' upload: Invalid file format. (mime: '.$file_mime.')';
					error_log($msg);
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
					// if (!in_array($file_data->extension, $allowed_extensions)) {
					// 	debug_log(__METHOD__." Error. Invalid file extension ".$file_data->extension, logger::ERROR);
					// 	$response->msg .= "Error. Invalid file extension ".$file_data->extension;
					// 	return $response;
					// }

			// manage uploaded file
				if (!defined('DEDALO_UPLOAD_TMP_DIR')) {
					debug_log(__METHOD__." DEDALO_UPLOAD_TMP_DIR is not defined. Please, define constatnt 'DEDALO_UPLOAD_TMP_DIR' in config file. (Using fallback value instead: DEDALO_MEDIA_PATH . '/import/file') ".to_string(), logger::ERROR);
					$response->msg .= " Config constant 'DEDALO_UPLOAD_TMP_DIR' is mandatory!";
					return $response;
				}
				$dir = DEDALO_UPLOAD_TMP_DIR . '/' . $resource_type;
				if (!empty($dir)) {
					// Check the target_dir, if it's not created will be make to be used.
						# Target folder exists test
						if( !is_dir($dir) ) {
							if(!mkdir($dir, 0775,true)) {
								$response->msg .= trim(" Error on read or create media DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH default directory. Permission denied ");
								return $response;
							}
							debug_log(__METHOD__." CREATED DIR: $dir  ".to_string(), logger::DEBUG);
						}
					// move file to target path
					$name			= basename($fileToUpload["tmp_name"]);
					$target_path	= $dir . '/' . $name;
					$moved			= move_uploaded_file($fileToUpload["tmp_name"], $target_path);
				}
				if (!isset($moved) || $moved!==true) {
					debug_log(__METHOD__." Error on get/move to target_dir ". to_string($target_dir), logger::ERROR);
					$response->msg .= "Uploaded file Error on get/move to target_dir. ".to_string($target_dir->value);
					return $response;
				}

				// file_data. post file (sent across $_FILES)
				// Example of received data:
				// "name": "montaje3.jpg",
				// "type": "image/jpeg",
				// "tmp_name": "/private/var/tmp/php6nd4A2",
				// "error": 0,
				// "size": 132898
				$file_data = new stdClass();
					$file_data->name			= $fileToUpload['name']; // like 'My Picture 1.jpg'
					$file_data->type			= $fileToUpload['type']; // like 'image\/jpeg'
					// $file_data->tmp_name		= $target_path;
					$file_data->tmp_dir			= 'DEDALO_UPLOAD_TMP_DIR'; // like DEDALO_MEDIA_PATH . '/upload/service_upload/tmp'
					$file_data->resource_type	= $resource_type; // like 'tool_upload'
					$file_data->tmp_name		= $name; // like 'phpv75h2K'
					$file_data->error			= $fileToUpload['error']; // like 0
					$file_data->size			= $fileToUpload['size']; // like 878860 (bytes)
					$file_data->extension		= strtolower(pathinfo($fileToUpload['name'], PATHINFO_EXTENSION));
						// dump($file_data, ' file_data ++++++++++++++++++++++++++++++++++++++ '.to_string());


			// all is OK response
				$response->result		= true;
				$response->file_data	= $file_data ?? null;
				$response->msg			= 'OK. '.label::get_label('fichero_subido_con_exito');

			// debug
				if(SHOW_DEBUG===true) {

					$debug = new stdClass();
						$debug->exec_time		= exec_time_unit($start_time,'ms')." ms";
						$debug->request_options	= $request_options;

					$response->debug = $debug;
				}


		} catch (RuntimeException $e) {

			$response->msg .= ' Request failed: '. $e->getMessage();
		}
		// dump($response, ' response ++ '.to_string());


		return $response;
	}//end upload




	// private methods ///////////////////////////////////



	/**
	* ERROR_NUMBER_TO_TEXT
	* @param int $f_error_number
	* @return string $f_error_text
	*/
	private static function error_number_to_text(int $f_error_number) : string {

		if( $f_error_number===0 ) {
						# all is ok
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
