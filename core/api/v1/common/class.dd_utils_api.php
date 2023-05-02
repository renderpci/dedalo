<?php
/**
* DD_UTILS_API
* Manage API REST data with Dédalo
*
*/
final class dd_utils_api {



	/**
	* GET_LOGIN_CONTEXT
	* This function is not used in normal login behavior (login is called directly in start API).
	* It could be called when the instance of the login has been build with autoload in true.
	* This function could be called by external processes as install to get the context of the login
	* and to create the login instance
	* Login only need context, it not needed data to render.
	* @param object $rqo
	* {
	*	action	: 'get_login_context',
	*	dd_api	: 'dd_utils_api',
	*	source	: source
	* }
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
	* @param object $rqo
	* {
	*	action	: 'get_install_context',
	*	dd_api	: 'dd_utils_api',
	*	source	: source
	*  }
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
	* DEDALO_VERSION (UNUSED !)
	* Use environment page_globals instead !
	* @param object $rqo
	* @return object $response
	*/
		// public static function dedalo_version(object $rqo) : object {

		// 	session_write_close();

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		// 	$response->result = (object)[
		// 		'version' 	=>	DEDALO_VERSION,
		// 		'build'		=>	DEDALO_BUILD
		// 	];
		// 	$response->msg 	  = 'OK. Request done';


		// 	return $response;
		// }//end dedalo_version



	/**
	* DATABASE_INFO
	* @param object $rqo
	* @return object $response
	*/
	public static function database_info(object $rqo) : object {

		session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		$info			= pg_version(DBi::_getConnection());
		$info['host']	= to_string(DEDALO_HOSTNAME_CONN);

		$response->result	= (object)$info;
		$response->msg		= 'OK. Request done';


		return $response;
	}//end database_info


	/**
	* GET_SYSTEM_INFO
	* @param object $rqo
	* @return object response
	*/
	public static function get_system_info(object $rqo) : object {

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
				$system_info->max_size_bytes				= file_upload_max_size();
				$system_info->sys_get_temp_dir				= sys_get_temp_dir();
				$system_info->upload_tmp_dir				= $upload_tmp_dir;
				$system_info->upload_tmp_perms				= fileperms($upload_tmp_dir);
				$system_info->session_cache_expire			= (int)ini_get('session.cache_expire');
				$system_info->upload_service_chunk_files	= DEDALO_UPLOAD_SERVICE_CHUNK_FILES;


		// response
			$response->result 	= $system_info;
			$response->msg 		= 'OK. Request done';

		return $response;
	}//end get_system_info



	/**
	* MAKE_BACKUP
	* @param object $rqo
	* @return object $response
	*/
	public static function make_backup(object $rqo) : object {

		// session_write_close();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= backup::make_backup();
		$response->msg		= 'OK. Request done';


		return $response;
	}//end make_backup



	/**
	* UPDATE_ONTOLOGY
	* @param object $rqo
	* @return object $response
	*/
	public static function update_ontology(object $rqo) : object {

		session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));
			if (empty($ar_dedalo_prefix_tipos)) {
				// error
				$response->msg .= ' - Empty dedalo_prefix_tipos value!';
				return $response;
			}

		$response = backup::update_ontology( $ar_dedalo_prefix_tipos );


		return $response;
	}//end update_ontology



	/**
	* STRUCTURE_TO_JSON
	* @param object $rqo
	* @return object $response
	*/
	public static function structure_to_json(object $rqo) : object {

		// session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
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
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR) . '/' . $file_name;

		if(!file_put_contents($file_path, json_encode($json_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX)) {
			// write error occurred
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']. Impossible to write json file';
			return $response;
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end structure_to_json



	/**
	* IMPORT_STRUCTURE_FROM_JSON
	* @param object $rqo
	* @return object $response
	*/
	public static function import_structure_from_json(object $rqo) : object {

		// session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));


		$ar_tld	= empty($ar_dedalo_prefix_tipos) ? [] : $ar_dedalo_prefix_tipos;

		$file_name	= 'structure.json';
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR) . '/' . $file_name;

		$data		= json_decode( file_get_contents($file_path) );
		$response	= backup::import_structure_json_data($data, $ar_tld);

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end import_structure_from_json



	/**
	* REGISTER_TOOLS
	* @param object $rqo
	* @return object $response
	*/
	public static function register_tools(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		$response->result	= tools_register::import_tools();
		$response->msg		= 'OK. Request done';


		return $response;
	}//end register_tools



	/**
	* BUILD_STRUCTURE_CSS **** DEPRECATED ! ****
	* @param object $rqo
	* @return object $response
	*/
		// public static function build_structure_css(object $rqo) : object {

		// 	// session_write_close();

		// 	$response = new stdClass();
		// 		$response->result	= false;
		// 		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';


		// 	$response->result	= css::build_structure_css();
		// 	$response->msg		= 'OK. Request done';


		// 	return $response;
		// }//end build_structure_css



	/**
	* BUILD_INSTALL_VERSION
	* @param object $rqo
	* @return object $response
	*/
	public static function build_install_version(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// build
			$response->result	= install::build_install_version();
			$response->msg		= 'OK. Request done';


		return $response;
	}//end build_install_version



	/**
	* UPDATE_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	* Triggered by Area Development button 'UPDATE DATA'
	* Sample: Current data version: 5.8.2 -----> 6.0.0
	* @param object $rqo
	* @return object $response
	*/
	public static function update_version(object $rqo) : object {

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
	* @param object $rqo
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query(object $rqo) : object {

		// session_write_close();

		set_time_limit ( 259200 );  // 3 days

		// options
			$options	= $rqo->options ?? null;
			$sqo		= is_string($options)
				? json_handler::decode($options)
				: $options;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// search if not empty
			if (!empty($sqo)) {

				// search exec
					$search	= search::get_instance($sqo);
					$rows	= $search->search();

				// SQL string query decorator
					$sql_query = $rows->strQuery ?? '';

					$ar_lines = explode(PHP_EOL, $sql_query);
					$ar_final = array_map(function($line){
						$line = trim($line);
						// if (strpos($line, '--')===0) {
						// 	$line = '<span class="notes">'.$line.'</span>';
						// }
						return $line;
					}, $ar_lines);
					$sql_query = implode(PHP_EOL, $ar_final);
					// $sql_query = '<pre>'.$sql_query.'</pre>';

				$response->result	= true;
				$response->msg		= $sql_query;
				$response->rows		= $rows;
			}


		return $response;
	}//end convert_search_object_to_sql_query



	/**
	* CHANGE_LANG
	* @param object $rqo
	* {
	*	action	: 'change_lang',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		dedalo_data_lang		: lang,
	*		dedalo_application_lang	: lang
	*	}
	*  }
	* @return object $response
	*/
	public static function change_lang(object $rqo) : object {

		// options
			$options					= $rqo->options;
			$dedalo_data_lang			= $options->dedalo_data_lang ?? null;
			$dedalo_application_lang	= $options->dedalo_application_lang ?? null;

		// response
			$response = new stdClass();
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.']';

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
	* @param object $rqo
	* {
	*	action	: 'login',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		username	: username,
	*		auth		: auth
	*	}
	* }
	* @return object $response
	*/
	public static function login(object $rqo) : object {

		// options
			$options = $rqo->options;

		// login
			$response = (object)login::Login((object)[
				'username' => $options->username,
				'password' => $options->auth
			]);


		return $response;
	}//end login



	/**
	* QUIT
	* @param object $rqo
	* {
	*	action	: 'quit',
	*	dd_api	: 'dd_utils_api',
	*	options	: {}
	* }
	* @return object $response
	*/
	public static function quit(object $rqo) : object {

		// options
			$options = $rqo->options;

		// response
			$response = new stdClass();
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.']';

		// Login type . Get before unset session
			$login_type = isset($_SESSION['dedalo']['auth']['login_type'])
				? $_SESSION['dedalo']['auth']['login_type']
				: 'default';

		// Quit action
			$result = login::Quit( $options );

		// Close script session after log out
			session_write_close();

		// Response
			$response->result	= $result;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';

			// saml logout
				if ($login_type==='saml' && defined('SAML_CONFIG') && SAML_CONFIG['active']===true && isset(SAML_CONFIG['logout_url'])) {
					$response->saml_redirect = SAML_CONFIG['logout_url'];
				}


		return $response;
	}//end quit



	/**
	* INSTALL
	* Control the install process calls to be re-direct to the correct actions
	* @param object $rqo
	* {
	*	action	: 'install',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		action : 'to_update'
	*	}
	* }
	* @return object $response
	*/
	public static function install(object $rqo) : object {

		// options
			$options	= $rqo->options;
			$action		= $options->action;

		// response
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

			case 'to_update':

				//exec
					$response = (object)install::to_update();
				break;

			case 'install_hierarchies':

				// check login for security
					if (login::is_logged()!==true) {
						$response->msg = 'Error. You are not logged in';
						return $response;
					}

				$install_hierarchies_options = $options;

				// exec
					$response = (object)install::install_hierarchies( $install_hierarchies_options );

				break;
			case 'set_root_pw':

				//exec
					$response = (object)install::set_root_pw($options);
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



	/**
	* REGENERATE_RELATIONS
	* @param object $rqo
	* @return object $response
	*/
	public static function regenerate_relations(object $rqo) : object {

		session_write_close();

		// options
			$options = $rqo->options;

		// response
			$response = new stdClass();
				$response->result	= true;
				$response->msg		= 'Ok. Request done ['.__METHOD__.']';

		// tables value
			$item_tables = array_find($options, function($item){
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
	* 	"options": {
	*		"file_to_upload": { 	(assoc array)
	*			"name"			: "exported_plantillas-web_-1-dd477.csv",
	*			"full_path"		: "exported_plantillas-web_-1-dd477.csv",
	*			"type"			: "text/csv",
	*			"tmp_name"		: "/private/var/tmp/phpQ02UUO",
	*			"error"			: 0,
	*			"size"			: 29892
	*		},
	* 		"chunked": false,
	* 	}
	* }
	* @param object $rqo
	* @return object $response
	*/
	public static function upload(object $rqo) : object {

		session_write_close();

		// options
			$options		= $rqo->options;
			$file_to_upload	= $options->file_to_upload ?? $options->file ?? $options->upload;	// assoc array Added from PHP input '$_FILES'
			$key_dir	= $options->key_dir; // string like 'tool_upload'
			$chunked		= isset($options->chunked) // received as string 'true'|'false'
				? (bool)json_decode($options->chunked)
				: false;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. '.label::get_label('error_on_upload_file');

		// check for upload issues
		try {

			// Undefined | Multiple Files | $_FILES Corruption Attack
			// If this request falls under any of them, treat it invalid.
				if (
					!isset($file_to_upload['error']) ||
					is_array($file_to_upload['error'])
				) {
					// throw new RuntimeException('Invalid parameters. (1)');
					$msg = ' upload: Invalid parameters. (1)';
					debug_log(__METHOD__
						." $msg " .PHP_EOL
						. to_string($rqo)
						, logger::ERROR
					);
					$response->msg .= $msg;
					return $response;
				}

			// Check $file_to_upload['error'] value.
				switch ($file_to_upload['error']) {
					case UPLOAD_ERR_OK:
						break;

					case UPLOAD_ERR_NO_FILE:
						$msg = ' upload: No file sent.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error:' .to_string($file_to_upload['error'])
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					case UPLOAD_ERR_INI_SIZE:
					case UPLOAD_ERR_FORM_SIZE:
						$msg = ' upload: Exceeded filesize limit.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error:' .to_string($file_to_upload['error'])
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					default:
						$msg = ' upload: Unknown errors.';
						debug_log(__METHOD__
							." $msg " .PHP_EOL
							. ' file_to_upload error:' .to_string($file_to_upload['error'])
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;
				}

			// You should also check filesize here.
				// if ($file_to_upload['size'] > 1000000) {
				// 	throw new RuntimeException('Exceeded filesize limit.');
				// }


			// chunked
				// $chunked	= json_decode($options->chunked);

				// filename
				$file_name		= $file_to_upload['name'];
				$file_tmp_name	= $file_to_upload['tmp_name'];
				$file_type 		= $file_to_upload['type'];

				// extension
				$extension	= strtolower( pathinfo($file_name, PATHINFO_EXTENSION) );

				// Do not trust $file_to_upload['mime'] VALUE !!
				// Check MIME Type by yourself.

				$finfo		= new finfo(FILEINFO_MIME_TYPE);
				$file_mime	= $finfo->file($file_tmp_name); // ex. string 'text/plain'

			// name
				$name = $file_name;
				if($chunked){
					$file_name		= $options->file_name;
					$total_chunks	= $options->total_chunks;
					$chunk_index	= $options->chunk_index;
					$tmp_name 		= basename($file_tmp_name);
					$extension		= 'blob';
					$name			= "{$chunk_index}-{$tmp_name}.{$extension}";
					$file_mime		= 'application/octet-stream';
				}

			// CHECKING
				// Check MIME
					$known_mime_types = self::get_known_mime_types();
					if (false===array_search(
						$file_mime,
						$known_mime_types,
						true
						)) {
						// throw new RuntimeException('Invalid file format.');
						debug_log(__METHOD__
							." Error. Stopped upload unknown file mime type." . PHP_EOL
							. ' file_mime: ' . to_string($file_mime) . PHP_EOL
							. ' file_tmp_name: ' . to_string($file_tmp_name)
							, logger::ERROR
						);
						$msg = ' upload: Invalid file format. (mime: '.$file_mime.')';
						$response->msg .= $msg;
						return $response;
					}

				// check for upload server errors
					$uploaded_file_error		= $file_to_upload['error'];
					$uploaded_file_error_text	= self::error_number_to_text($uploaded_file_error);
					if ($uploaded_file_error!==0) {
						$response->msg .= ' - '.$uploaded_file_error_text;
						return $response;
					}

				// check file is available in temp dir
					if(!file_exists($file_tmp_name)) {
						debug_log(__METHOD__
							. " Error on locate temporary file ". PHP_EOL
							. ' file_tmp_name' .to_string($file_tmp_name)
							, logger::ERROR
						);
						$response->msg .= "Uploaded file not found in temporary folder";
						return $response;
					}

				// check extension
					$allowed_extensions	= array_keys($known_mime_types);
					if (!empty($extension) && !in_array($extension, $allowed_extensions)) {
						$response->msg .= " Error. Invalid file extension [1]: ".to_string($extension);
						debug_log(__METHOD__
							.' ' . $response->msg .PHP_EOL
							. 'extension: ' . to_string($extension) .PHP_EOL
							. 'allowed_extensions: ' .to_string($allowed_extensions)
							, logger::ERROR
						);
						return $response;
					}

			// Manage uploaded file
				// check tmp upload dir
					if (!defined('DEDALO_UPLOAD_TMP_DIR')) {
						debug_log(__METHOD__
							." DEDALO_UPLOAD_TMP_DIR is not defined. Please, define constant 'DEDALO_UPLOAD_TMP_DIR' in config file." .PHP_EOL
							." (Using fallback value instead: DEDALO_MEDIA_PATH . '/import/file')" .PHP_EOL
							." Config constant 'DEDALO_UPLOAD_TMP_DIR' is mandatory!"
							, logger::ERROR
						);
						$response->msg .= " Config constant 'DEDALO_UPLOAD_TMP_DIR' is mandatory!";
						return $response;
					}
				// user_id. Currently logged user
					$user_id = navigator::get_user_id();
					$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

				// Check the target_dir, if it's not created will be make to be used.
					// Target folder exists test
					if( !is_dir($tmp_dir) ) {
						if(!mkdir($tmp_dir, 0700, true)) {
							$response->msg .= ' Error on read or create UPLOAD_TMP_DIR directory. Permission denied';
							debug_log(__METHOD__.PHP_EOL
								. " $response->msg"
								, logger::ERROR
							);
							return $response;
						}
						debug_log(__METHOD__." CREATED DIR: $tmp_dir  ".to_string(), logger::DEBUG);
					}
				// move file to target path
					$target_path	= $tmp_dir . '/' . $name;
					$moved			= move_uploaded_file($file_tmp_name, $target_path);
					// verify move file is successful
					if ($moved!==true) {
						debug_log(__METHOD__.PHP_EOL
							.'Error on get/move temp file to target_path '.PHP_EOL
							.'source: '.$file_tmp_name.PHP_EOL
							.'target: '.$target_path
							, logger::ERROR
						);
						$response->msg .= 'Uploaded file Error on get/move to target_path.';
						return $response;
					}

					// thumbnail file
					if(!$chunked){
						$thumb_options = new stdClass();
							$thumb_options->tmp_dir			= $tmp_dir;
							$thumb_options->name			= $name;
							$thumb_options->target_path		= $target_path;
							$thumb_options->key_dir	= $key_dir;
							$thumb_options->user_id			= $user_id;

						$thumbnail_url = dd_utils_api::create_thumbnail($thumb_options);
					}



			// file_data to client. POST file (sent across $_FILES) info and some additions
				// Example of received data:
				// "file_to_upload": {
				//		"name": "exported_plantillas-web_-1-dd477.csv",
				//		"full_path": "exported_plantillas-web_-1-dd477.csv",
				//		"type": "text/csv",
				//		"tmp_name": "/private/var/tmp/phpQ02UUO",
				//		"error": 0,
				//		"size": 29892
				// }
				$file_data = new stdClass();
					$file_data->name			= $file_name; // like 'My Picture 1.jpg'
					$file_data->type			= $file_to_upload['type']; // like 'image\/jpeg'
					// $file_data->tmp_name		= $target_path; // do not include for safety
					$file_data->tmp_dir			= 'DEDALO_UPLOAD_TMP_DIR'; // like DEDALO_MEDIA_PATH . '/upload/service_upload/tmp'
					$file_data->key_dir	= $key_dir; // like 'tool_upload'
					$file_data->tmp_name		= $name; // like 'phpv75h2K'
					$file_data->error			= $file_to_upload['error']; // like 0
					$file_data->size			= $file_to_upload['size']; // like 878860 (bytes)
					$file_data->extension		= $extension;
					$file_data->chunked			= $chunked;
					$file_data->thumbnail_url 	= $thumbnail_url ?? null;

					if($chunked) {
						$file_data->total_chunks	= $total_chunks;
						$file_data->chunk_index		= $chunk_index;
					}

			// key_dir cases response
				switch ($key_dir) {

					case 'web': // uploading images from text editor
						$safe_file_name	= sanitize_file_name($file_name); // clean file name
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
						$response->msg			= 'OK. '.label::get_label('file_uploaded_successfully');
						break;
				}

		}catch (RuntimeException $e) {

			$response->msg .= ' Request failed: '. $e->getMessage();
			debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
		}


		return $response;
	}//end upload



	/**
	* GET_SYSTEM_INFO
	* @param object $rqo
	*
	*	dd_api	: 'dd_utils_api',
	*	action	: 'join_chunked_files_uploaded',
	*	options	: {
	*		file_data		: file_data,
	*		files_chunked	: files_chunked
	*	}
	* }
	* @return object response
	*/
	public static function join_chunked_files_uploaded(object $rqo) : object {

		// options
			$options		= $rqo->options;
			$files_chunked	= $options->files_chunked;
			$file_data		= $options->file_data;
			$key_dir 		= $file_data->key_dir;

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed';

		// file_path
			$user_id = navigator::get_user_id();
			$file_path = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

		// tmp_joined_file
			$tmp_joined_file = 'tmp_'.$file_data->name;

		// target path of the final file joined
			$target_path = $file_path .'/'.$tmp_joined_file;

		// loop through temp files and grab the content
			foreach ($files_chunked as $chunk_filename) {

				// copy chunk
				$temp_file_path	= "{$file_path}/{$chunk_filename}";
				$chunk			= file_get_contents($temp_file_path);
				if ( empty($chunk) ){
					$response->msg = "Chunks are uploading as empty strings.";
					debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
					return $response;
				}

				// add chunk to main file
				file_put_contents($target_path, $chunk, FILE_APPEND | LOCK_EX);

				// delete chunk
				unlink($temp_file_path);
				if ( file_exists($temp_file_path) ) {
					$response->msg = "Your temp files could not be deleted.";
					debug_log(__METHOD__.PHP_EOL.$response->msg, logger::ERROR);
					return $response;
				}
			}

		// extension
			$extension = strtolower( pathinfo($tmp_joined_file, PATHINFO_EXTENSION) );

		// check extension
			$known_mime_types	= self::get_known_mime_types();
			$allowed_extensions	= array_keys($known_mime_types);
			if (!in_array($extension, $allowed_extensions)) {
				$response->msg .= "Error. Invalid file extension [2] ".$extension;
				debug_log(__METHOD__
					. ' '.$response->msg .PHP_EOL
					. ' extension: '. to_string($extension) .PHP_EOL
					. ' allowed_extensions: ' .to_string($allowed_extensions)
					, logger::ERROR
				);
				return $response;
			}

		// thumbnail
			$thumb_options = new stdClass();
				$thumb_options->tmp_dir			= $file_path;
				$thumb_options->name			= $tmp_joined_file;
				$thumb_options->target_path		= $target_path;
				$thumb_options->key_dir	= $key_dir;
				$thumb_options->user_id			= $user_id;
			$thumbnail_url = dd_utils_api::create_thumbnail($thumb_options);

		// set the file values
			$file_data->tmp_name		= $tmp_joined_file; // like 'phpv75h2K'
			$file_data->extension		= $extension;
			$file_data->thumbnail_url	= $thumbnail_url ?? null;

		// response. All is OK response
			$response->result		= true;
			$response->file_data	= $file_data;
			$response->msg			= 'OK. '.label::get_label('file_uploaded_successfully');


		return $response;
	}//end get_system_info



	/**
	* LIST_UPLOADED_FILES
	* Used by the upload lib (Dropzone) to get the list of already uploaded files on server
	* @param object $rqo
	* 	Object with only the key_dir name like { key_dir: 'oh1_4' }
	* @return object $response
	* 	response->result:
	* 	Array of objects like: [{
	* 		url : server generated thumbnail url,
	* 		name : file name like 'my_photo51.jpg',
	* 		size : informative file size in bytes like 6528743 (from original file, not from the thumb)
	* 	}]
	*/
	public static function list_uploaded_files(object $rqo) : object {

		// unlock session
			session_write_close();
			ignore_user_abort();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options
			$key_dir		= $rqo->options->key_dir ?? null;

		// dir
			$user_id = navigator::get_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;
			$tmp_url = DEDALO_UPLOAD_TMP_URL . '/'. $user_id . '/' . $key_dir;

		// read files dir
			$files		= [];
			$files_raw	= scandir($tmp_dir);
			foreach ($files_raw as $file_name) {
				$file_path = $tmp_dir . '/' . $file_name;

				if (strlen($file_name) > 0 && $file_name[0]!=='.' && is_file($file_path)) {

					$info		= pathinfo($file_name);
					$basemane	= basename($file_name,'.'.$info['extension']);

					$files[] = (object)[
						'url'	=> $tmp_url .'/thumbnail/'. $basemane . '.jpg',
						'name'	=> $file_name,
						'size'	=> filesize($file_path)
					];
				}
			}

		// response
			$response->result	= $files;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end list_uploaded_files



	/**
	* DELETE_UPLOADED_FILE
	* Used by the upload lib (Dropzone) to delete already uploaded files on server
	* @param object $rqo
	* 	Object like { file_name: 'my_photo_452.jpg', key_dir: 'rsc29_rsc176' }
	* @return object $response
	* 	response->result
	* 	Returns false if file do not exists or the unlink call do not return true
	*/
	public static function delete_uploaded_file(object $rqo) : object {

		// unlock session
			session_write_close();
			ignore_user_abort();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		$options = $rqo->options;

		// short vars
			$file_names	= is_array($options->file_name) ? $options->file_name : [$options->file_name];
			$key_dir	= $options->key_dir; // key_dir. Contraction of tipo + section_tipo, like: 'rsc29_rsc176'

		// dir
			$user_id = navigator::get_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

		// delete each file
			foreach ($file_names as $file_name) {

				// file_path
					$file_path = $tmp_dir . '/' . $file_name;

				// delete file
					if (!file_exists($file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete file (the file do not exists): ".to_string($file_path);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}
					if (!unlink($file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete file (unable to unlink file): ".to_string($file_path);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}

				// path thumb
					$info				= pathinfo($file_name);
					$basemane			= basename($file_name,'.'.$info['extension']);
					$file_path_thumb	= $tmp_dir . '/thumbnail/' . $basemane . '.jpg';

				// delete thumb
					if (file_exists($file_path_thumb) && !unlink($file_path_thumb)) {
						$response->result	= false;
						$response->msg		= "Error on delete thumb file (unable to unlink file): ".to_string($file_path_thumb);
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}
			}//end foreach ($file_names as $file_name)

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end delete_uploaded_file






	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* Connects to database and updates user lock components state
	* on focus or blur user actions
	* @param object $rqo
	* 	Sample:
	* 	{
	*	    "dd_api": "dd_utils_api",
	*	    "action": "update_lock_components_state",
	*	    "options": {
	*	        "component_tipo": "hierarchy24",
	*	        "section_tipo": "sv1",
	*	        "section_id": "1",
	*	        "action": "focus"
	*	    }
	*	}
	* @return object $response
	*/
	public static function update_lock_components_state(object $rqo) : object {

		// session unlock
		session_write_close();

		// Ignore user abort action
		ignore_user_abort(true);

		// options
			$options		= $rqo->options;
			$section_id		= $options->section_id;
			$section_tipo	= $options->section_tipo;
			$component_tipo	= $options->component_tipo ?? null;
			$action			= $options->action; // delete_user_section_locks | blur | focus
			$user_id		= (int)navigator::get_user_id();
			$full_username	= ($user_id<0)
				? 'Debug user'
				: ($_SESSION['dedalo']['auth']['full_username'] ?? 'Unknown');

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
	* @param object $rqo
	* @return object $response
	*/
	public static function get_dedalo_files(object $rqo) : object {

		// session unlock
		session_write_close();

		// response
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
	* @param object $rqo
	* @return object $response
	*/
	public static function create_test_record(object $rqo) : object {

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



	/**
	* UPDATE_CODE
	* Download code in zip format file from the GIT repository defined in config
	* @param object $rqo
	* @return object $response
	*/
	public static function update_code(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		try {

			$result = new stdClass();

			debug_log(__METHOD__." Start downloading file ".DEDALO_SOURCE_VERSION_URL, logger::DEBUG);

			// Download zip file from server (master) curl mode (unified with download_remote_structure_file)
				// data
				$data_string = "data=" . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> DEDALO_SOURCE_VERSION_URL,
					'post'				=> true,
					'postfields'		=> $data_string,
					'returntransfer'	=> 1,
					'followlocation'	=> true,
					'header'			=> false, // bool add header to result
					'ssl_verifypeer'	=> false,
					'timeout'			=> 300, // int seconds
					'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
						? SERVER_PROXY // from Dédalo config file
						: false // default case
				]);
				$contents = $curl_response->result;
				// check contents
				if ($contents===false) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to download from: '.DEDALO_SOURCE_VERSION_URL;
					debug_log(__METHOD__." $response->msg", logger::ERROR);
					return $response;
				}
				$result->download_file = [
					'Downloaded file: ' . DEDALO_SOURCE_VERSION_URL,
					'Time: ' . exec_time_unit($start_time,'secs') . ' secs'
				];
				debug_log(__METHOD__." Downloaded file (".DEDALO_SOURCE_VERSION_URL.") in ".exec_time_unit($start_time,'secs'), logger::DEBUG);

			// Save contents to local dir
				if (!is_dir(DEDALO_SOURCE_VERSION_LOCAL_DIR)) {
					if( !mkdir(DEDALO_SOURCE_VERSION_LOCAL_DIR,  0775) ) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Unable to create dir: '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
						debug_log(__METHOD__." $response->msg", logger::ERROR);
						return $response;
					}
				}
				$file_name		= 'dedalo6_code.zip';
				$target_file	= DEDALO_SOURCE_VERSION_LOCAL_DIR . '/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to write on : '.$target_file;
					debug_log(__METHOD__." $response->msg", logger::ERROR);
					return $response;
				}
				$result->write_file = [
					"Written file: ". $target_file,
					"File size: "	. format_size_units( filesize($target_file) )
				];

			// extract files from zip. (!) Note that 'ZipArchive' need to be installed in PHP to allow work
				$zip = new ZipArchive;
				$res = $zip->open($target_file);
				if ($res!==true) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. ERROR ON ZIP file extraction to '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__." $response->msg", logger::ERROR);
					return $response;
				}
				$zip->extractTo(DEDALO_SOURCE_VERSION_LOCAL_DIR);
				$zip->close();
				$result->extract = [
					"Extracted ZIP file to: " . DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
				debug_log(__METHOD__." ZIP file extracted successfully to ".DEDALO_SOURCE_VERSION_LOCAL_DIR, logger::DEBUG);

			// rsync
				$source		= (strpos(DEDALO_SOURCE_VERSION_URL, 'github.com'))
					? DEDALO_SOURCE_VERSION_LOCAL_DIR .'/dedalo-master' // like 'dedalo-master'
					: DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. pathinfo($file_name)['filename']; // like 'dedalo6_code' from 'dedalo6_code.zip'
				$target		= DEDALO_ROOT_PATH;
				$exclude	= ' --exclude="*/config*" --exclude="media" ';
				$aditional 	= ''; // $is_preview===true ? ' --dry-run ' : '';
				$command	= 'rsync -avui --no-owner --no-group --no-perms --progress '. $exclude . $aditional . $source.'/ ' . $target.'/';
				$output		= shell_exec($command);
				$result->rsync = [
					"command: " . $command,
					"output: "  . str_replace(["\n","\r"], '<br>', $output),
				];
				debug_log(__METHOD__." RSYNC command done ". PHP_EOL .to_string($command), logger::DEBUG);

			// remove temp used files and folders
				$command_rm_dir		= "rm -R -f $source";
				$output_rm_dir		= shell_exec($command_rm_dir);
				$result->remove_dir	= [
					"command_rm_dir: " . $command_rm_dir,
					"output_rm_dir: "  . $output_rm_dir
				];
				$command_rm_file 	= "rm $target_file";
				$output_rm_file		= shell_exec($command_rm_file);
				$result->remove_file= [
					"command_rm_file: " . $command_rm_file,
					"output_rm_file: "  . $output_rm_file
				];
				debug_log(__METHOD__." Removed temp used files and folders ".to_string(), logger::DEBUG);

			// update javascript labels
				$ar_langs = DEDALO_APPLICATION_LANGS;
				foreach ($ar_langs as $lang => $label) {
					backup::write_lang_file($lang);
				}

			// response OK
				$response->result	= $result;
				$response->msg		= 'OK. Request done ['.__FUNCTION__.']';

				debug_log(__METHOD__." Updated Dédalo code successfully ".to_string(), logger::DEBUG);


		} catch (Exception $e) {

			$response->msg = $e->getMessage();
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done '.__METHOD__;


		return $response;
	}//end update_code



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
	private static function get_dir_files(string $dir, array $ext, callable $format) : array {

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
						 // all is OK
						 $f_error_text = label::get_label('file_uploaded_successfully');
		}else{
			switch($f_error_number) {
						 // Error by number
				case 1 : $f_error_text = label::get_label('uploaded_file_exceeds_the_directive');	break;
				case 2 : $f_error_text = label::get_label('uploaded_file_exceeds_the_maximum_size');	break;
				case 3 : $f_error_text = label::get_label('uploaded_file_was_only_partially_uploaded');	break;
				case 4 : $f_error_text = label::get_label('no_file_was_uploaded');	break;
				case 6 : $f_error_text = label::get_label('temp_dir_not_accessible');	break;
				case 7 : $f_error_text = label::get_label('failed_to_write_file_to_disk');	break;
				case 8 : $f_error_text = label::get_label('php_extension_stopped_the_upload_file');	break;
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
			'blob' 	=> 'application/octet-stream',
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

			// 3d @see https://github.com/KhronosGroup/glTF/blob/main/specification/1.0/README.md#mimetypes
			'glb'	=> 'application/octet-stream',
			'gltf'	=> 'model/gltf+json',
			'glsl'	=> 'text/plain'
		);

		return $mime_types;
	}//end get_known_mime_types


	/**
	* CREATE_THUMBNAIL
	* @param object $options
	* @return sting | null, url of the thumbnail file
	*/
	private static function create_thumbnail(object $options) : ?string {

		$tmp_dir		= $options->tmp_dir;
		$name			= $options->name;
		$target_path	= $options->target_path;
		$key_dir		= $options->key_dir;
		$user_id		= $options->user_id;

		$file_type		= mime_content_type($target_path);

		$pathinfo	= pathinfo($name);
		$filename = $pathinfo['filename'];
		$thumbnail_file	= $tmp_dir. '/thumbnail/' . $filename . '.jpg';
		switch ($file_type) {
		 	case 'application/pdf':
		 		$thumb_pdf_options = new stdClass();
		 			$thumb_pdf_options->source_file = $target_path;
		 			$thumb_pdf_options->ar_layers = [0];
		 			$thumb_pdf_options->target_file = $thumbnail_file;
					$thumb_pdf_options->density	= 150;
					$thumb_pdf_options->antialias	= true;
					$thumb_pdf_options->quality	= 75;
					$thumb_pdf_options->resize	= '12.5%';

		 		ImageMagick::convert($thumb_pdf_options);
		 		break;

		 	case 'image/jpeg':
		 	default:
		 	$thumb_image_options = new stdClass();
				$thumb_image_options->source_file = $target_path;
				$thumb_image_options->target_file = $thumbnail_file;
				$thumb_image_options->thumbnail = true;

				ImageMagick::convert($thumb_image_options);
				break;
		 }

		$thumbnail_url = DEDALO_UPLOAD_TMP_URL.'/'. $user_id . '/' . $key_dir . '/thumbnail/' . $filename . '.jpg';

		return $thumbnail_url;
	}//end create_thumbnail



}//end dd_utils_api
