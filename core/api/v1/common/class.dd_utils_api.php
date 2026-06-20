<?php declare(strict_types=1);
/**
* CLASS DD_UTILS_API
* Cross-cutting REST API handler for Dédalo infrastructure and utility operations.
*
* Acts as the single entry point for all API calls that do not belong to a
* specific domain (sections, components, tools). Responsibilities include:
*
* - Session lifecycle: login, logout, language switching
* - Initial context delivery: login page context, install wizard context
* - File management: upload (single + chunked), chunk-join, listing, deletion
* - Background-process monitoring: SSE stream (get_process_status),
*   polling (get_process_status_poll), and stop
* - Installation and upgrade bootstrapping (wraps class install)
* - Collaborative lock management (component focus/blur notifications)
* - Distributed update infrastructure: code-server and ontology-server
*   readiness checks and version metadata queries
* - Diagnostic helpers: system info, SQL debug of a raw SQO
*
* All methods are declared `public static` and dispatched through the API
* router (core/api/v1/json/index.php). Only methods listed in API_ACTIONS
* are reachable as remote calls (SEC-024 allowlist).
*
* This class has no instance state; all data flows through the $rqo
* (request-query object) parameter and the returned $response object.
*
* @package Dédalo
* @subpackage Core
*/
final class dd_utils_api {



	/**
	* Explicit allowlist of methods callable as remote API actions (SEC-024).
	* Adding a new public-static method does NOT automatically make it reachable
	* from the network — the method must also be listed here. The API router
	* (core/api/v1/json/index.php) validates the requested action against this
	* constant before dispatching, so omitting an entry is a hard block.
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'get_login_context',
		'get_install_context',
		'get_system_info',
		'convert_search_object_to_sql_query',
		'change_lang',
		'login',
		'quit',
		'request_password_reset',
		'confirm_password_reset',
		'install',
		'upload',
		'join_chunked_files_uploaded',
		'list_uploaded_files',
		'delete_uploaded_file',
		'update_lock_components_state',
		'get_dedalo_files',
		'get_process_status',
		'get_process_status_poll',
		'stop_process',
		'get_server_ready_status',
		'get_ontology_update_info',
		'get_code_update_info'
	];



	/**
	* GET_LOGIN_CONTEXT
	* Builds and returns the login component's rendering context (no data payload).
	*
	* Not called during the normal login flow — the API start handler calls
	* class login directly. This method exists for two secondary cases:
	*   1. External processes (e.g. the install wizard) that need to instantiate
	*      the login UI without going through the standard session startup.
	*   2. Autoload=true configurations where the client triggers a context-only
	*      fetch before credentials are available.
	*
	* Before building the login instance, this method runs a v6→v7 database
	* migration preflight (checks for dd_ontology table; runs v6_to_v7::pre_update
	* if missing). If pre_update fails the method returns immediately with an error
	* response so the install wizard can surface the problem.
	*
	* @param object $rqo
	* {
	*	action	: 'get_login_context',
	*	dd_api	: 'dd_utils_api',
	*	source	: source
	* }
	* @return object $response
	* - result: object|false  Login component context on success, false on error
	* - msg:    string        Human-readable status or error message
	* - errors: array         Populated with error strings on failure
	*/
	public static function get_login_context(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// v6 to v7 migration check
		// Check if table dd_ontology exists
		if (!DBi::check_table_exists('dd_ontology')) {
			// run pre_update_version
			try {
				require_once DEDALO_CORE_PATH .'/base/upgrade/class.v6_to_v7.php';
				$pre_update_response = method_exists('v6_to_v7', 'pre_update')
					? call_user_func(['v6_to_v7', 'pre_update'])
					: (object)[
						'result' => false,
					];
				if ($pre_update_response->result === false) {
					debug_log(__METHOD__
						. " Error on v6_to_v7 pre_update" . PHP_EOL
						, logger::ERROR
					);
					$response->msg = 'Error on run v6_to_v7 pre_update';
					$response->errors[] = 'Error on run v6_to_v7 pre_update';

					return $response;
				}
			} catch (Exception $e) {
				debug_log(__METHOD__
					. " Error (exception) on v6_to_v7 pre_update" . PHP_EOL
					. ' Caught exception: ' . $e->getMessage()
					, logger::ERROR
				);
				$response->msg = 'Error. Exception running v6_to_v7 pre_update';
				$response->errors[] = 'Error. Exception running v6_to_v7 pre_update';
				return $response;
			}
		}

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
	* Returns the install component's rendering context without requiring authentication.
	*
	* The install wizard runs before any user session exists, so this endpoint is
	* intentionally unauthenticated. It mirrors the pattern of get_login_context
	* but for class install — building the context-only JSON of the install UI.
	*
	* @param object $rqo
	* {
	*	action	: 'get_install_context',
	*	dd_api	: 'dd_utils_api',
	*	source	: source
	* }
	* @return object $response
	* - result: object|false  Install component context on success, false on error
	* - msg:    string        Human-readable status or error message
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
	* DEDALO_VERSION (UNUSED — dead/commented-out code)
	* Use environment page_globals instead.
	* This method was removed from API_ACTIONS and commented out; it is kept
	* here only for historical reference. Callers should read DEDALO_VERSION
	* from the page_globals object delivered during the initial page load.
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
	* GET_SYSTEM_INFO
	* Returns PHP-side system configuration values used by the upload and
	* maintenance UIs to validate client-side behaviour.
	*
	* The returned object includes the effective maximum upload size (the
	* smaller of post_max_size and upload_max_filesize), the temp-directory
	* paths, session cache expiry, the chunk-upload flag, and whether a PDF
	* OCR engine is configured.
	*
	* No authentication guard is enforced here; the API router's session check
	* already requires a valid login before any API_ACTIONS method is reached.
	*
	* @param object $rqo
	* @return object $response
	* - result: object  System info payload with the fields described above
	* - msg:    string  Status message
	*/
	public static function get_system_info(object $rqo) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$upload_tmp_dir = ini_get('upload_tmp_dir');

		// system_info
			$system_info = new stdClass();
				$system_info->max_size_bytes				= self::file_upload_max_size();
				$system_info->sys_get_temp_dir				= sys_get_temp_dir();
				$system_info->upload_tmp_dir				= $upload_tmp_dir;
				$system_info->upload_tmp_perms				= fileperms($upload_tmp_dir);
				$system_info->session_cache_expire			= (int)ini_get('session.cache_expire');
				$system_info->upload_service_chunk_files	= DEDALO_UPLOAD_SERVICE_CHUNK_FILES;
				$system_info->pdf_ocr_engine				= defined('PDF_OCR_ENGINE') ? true : false;

		// response
			$response->result 	= $system_info;
			$response->msg 		= 'OK. Request done';

		return $response;
	}//end get_system_info




	/**
	* BUILD_STRUCTURE_CSS (DEPRECATED — dead/commented-out code)
	* Was used to trigger a server-side rebuild of the LESS-compiled structure
	* CSS. Removed as part of the v7 build pipeline refactor; CSS is now
	* compiled offline. The method body is kept commented out for reference.
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
	* CONVERT_SEARCH_OBJECT_TO_SQL_QUERY
	* Diagnostic tool: executes a raw SQO (search query object) and returns the
	* generated SQL together with the matched section_id list.
	*
	* Restricted to global-admin users. Useful during development to verify that
	* a client-built SQO produces the expected PostgreSQL query without running
	* a full section render cycle.
	*
	* The $rqo->options field carries the SQO, either as a JSON string or as a
	* pre-decoded object. Because this endpoint receives the SQO via options
	* (not the standard $rqo->sqo path), it is not automatically scrubbed by
	* the API ingress handler in index.php — this method applies
	* search_query_object::sanitize_client_sqo() explicitly before passing the
	* object to the search pipeline.
	*
	* Response on success includes:
	*   - result:        true
	*   - msg:           Resolved SQL with substituted placeholders (for human reading)
	*   - sql:           Raw SQL with positional placeholders ($1, $2, …)
	*   - ar_section_id: Deduplicated list of matching section IDs
	*   - db_data:       Full raw row array from the database result
	*
	* @param object $rqo
	* @return object $response
	*/
	public static function convert_search_object_to_sql_query(object $rqo) : object {

		// session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// only super admin users can do it
			if( security::is_global_admin(logged_user_id()) !== true ){
				$response->msg .= PHP_EOL . 'Invalid user. Only global admin users can do it. Current user id: ' . logged_user_id();
				return $response;
			}

		// options
			$options	= $rqo->options ?? null;
			$sqo		= is_string($options)
				? json_handler::decode($options)
				: $options;

		// SQO security scrub. This endpoint takes the SQO from $rqo->options (not $rqo->sqo),
		// so it is not covered by the API ingress scrub in index.php. Strip server-only fields
		// before the client SQO reaches the search pipeline. @see search_query_object::sanitize_client_sqo
			$sqo = search_query_object::sanitize_client_sqo($sqo);

		// search if not empty
			if (!empty($sqo)) {

				// search exec
				$search	= search::get_instance($sqo);
				$db_result = $search->search();

				// SQL string query with placeholders
				$sql_query_unresolved = clean_sql( $search->get_sql_query() );

				// sql_query_resolved (uses `debug_prepared_statement()` to substitute `$1`, `$2`, etc. placeholders)
				$sql_query_resolved = $search->get_sql_query_resolved();

				// db records as array
				$db_data_array = $db_result->fetch_all();

				// db records as array of section ids
				$ar_section_id = array_map(fn($el) => $el->section_id ?? null, $db_data_array);

				$response->result			= true;
				$response->msg				= $sql_query_resolved;
				$response->sql				= $sql_query_unresolved;
				$response->ar_section_id	= array_values(array_unique($ar_section_id));
				$response->db_data			= $db_data_array;
			}


		return $response;
	}//end convert_search_object_to_sql_query



	/**
	* CHANGE_LANG
	* Updates the active data and/or application language for the current session
	* and (optionally) triggers a background rebuild of the security-access cache
	* for the new language.
	*
	* Language values are XSS-sanitized before being written to $_SESSION. When
	* the DEDALO_DATA_LANG_SYNC constant is true the two languages are kept in
	* sync: whichever is supplied drives the other.
	*
	* If the DEDALO_CACHE_MANAGER constant is configured and the user is logged
	* in, the method checks whether a pre-computed security-access tree exists
	* for the target application language. If not found, it spawns a background
	* process (dd_cache::process_and_cache_to_file with wait=false) so that the
	* next page load can serve the cached tree instead of rebuilding it inline.
	*
	* @param object $rqo
	* {
	*	action	: 'change_lang',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		dedalo_data_lang        : string  BCP-47 language tag, e.g. 'es-ES'
	*		dedalo_application_lang : string  BCP-47 language tag, e.g. 'es-ES'
	*	}
	* }
	* @return object $response
	* - result: true
	* - msg:    string  Confirmation message including which languages changed
	*/
	public static function change_lang(object $rqo) : object {

		// options
			$options					= $rqo->options;
			$dedalo_data_lang			= $options->dedalo_data_lang ?? null; // DEDALO_DATA_LANG;
			$dedalo_application_lang	= $options->dedalo_application_lang ?? null; // DEDALO_APPLICATION_LANG;

		// response
			$response = new stdClass();
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.']';

		// dedalo_data_lang_sync
			if (defined('DEDALO_DATA_LANG_SYNC') && DEDALO_DATA_LANG_SYNC===true) {
				if (!empty($dedalo_application_lang)) {
					// data_lang from application_lang
					$dedalo_data_lang = $dedalo_application_lang;
				}else if (!empty($dedalo_data_lang)) {
					// application_lang from data_lang
					$dedalo_application_lang = $dedalo_data_lang;
				}
			}

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
				# Save in session dedalo_application_lang
				$_SESSION['dedalo']['config']['dedalo_application_lang'] = $dedalo_application_lang;

				$response->msg .= ' Changed dedalo_application_lang to '.$dedalo_application_lang;
			}

		// cache update
			// precalculate profiles datalist security access in background
			// This file is generated on every user login, launching the process in background
			// or, when current lang is not cached yet (on user change data lang in menu)
			// cache_file_name. Like 'cache_tree_'.DEDALO_DATA_LANG.'.php'
			if (defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path']) && login::is_logged()===true) {
				$cache_file_name = component_security_access::get_cache_tree_file_name(
					$dedalo_application_lang ?? DEDALO_APPLICATION_LANG
				);
				// check if cache file already exists
				$cache_file_exists = dd_cache::cache_file_exists((object)[
					'file_name' => $cache_file_name
				]);
				if ($cache_file_exists===false) {
					// cache do not exists. Create a new one
					debug_log(__METHOD__
						." Generating security access datalist in background... " . PHP_EOL
						.' cache_file_name: ' . $cache_file_name
						, logger::DEBUG
					);
					dd_cache::process_and_cache_to_file((object)[
						'process_file'	=> DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
						'data'			=> (object)[
							'session_id'	=> session_id(),
							'user_id'		=> logged_user_id(),
							'lang'			=> $dedalo_application_lang ?? DEDALO_APPLICATION_LANG
						],
						'file_name'		=> $cache_file_name,
						'wait'			=> false
					]);
				}
			}

		// debug
			debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);


		return $response;
	}//end change_lang



	/**
	* LOGIN
	* Thin adapter that forwards credentials from the $rqo to login::Login().
	*
	* The raw password is passed as $options->auth; login::Login() handles
	* hashing, session initialisation, and profile loading. All error handling
	* (invalid credentials, locked accounts, SAML redirects) is performed
	* inside login::Login and surfaced through its returned object.
	*
	* @param object $rqo
	* {
	*	action	: 'login',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		username : string  Plain-text username
	*		auth     : string  Plain-text password (hashed inside login::Login)
	*	}
	* }
	* @return object $response  Forwarded from login::Login; shape is documented there
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
	* REQUEST_PASSWORD_RESET
	* Step 1 of the self-service password recovery flow. Thin adapter that forwards
	* an identifier (username or email) to password_reset::request(), which emails a
	* one-time code and returns an opaque reset_id.
	*
	* Intentionally unauthenticated and CSRF-exempt (whitelisted in dd_manager,
	* same as 'login'): the login screen has no session or CSRF token yet. The
	* endpoint is rate-limited inside password_reset and is anti-enumeration safe —
	* it always returns the same generic response whether or not an account matches.
	*
	* @param object $rqo
	* {
	*	action	: 'request_password_reset',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		identifier : string  username OR email address
	*	}
	* }
	* @return object $response  Forwarded from password_reset::request
	* - result   : true        always
	* - msg      : string       generic confirmation
	* - reset_id : string       opaque token passed back to confirm_password_reset
	*/
	public static function request_password_reset(object $rqo) : object {

		$options	= $rqo->options ?? new stdClass();
		$identifier	= (string)($options->identifier ?? '');

		return password_reset::request($identifier);
	}//end request_password_reset



	/**
	* CONFIRM_PASSWORD_RESET
	* Step 2 of the password recovery flow. Thin adapter that forwards the reset_id,
	* the emailed code and the new password to password_reset::confirm(), which
	* verifies the code and writes the new password (Argon2id) on success.
	*
	* Unauthenticated and CSRF-exempt (whitelisted in dd_manager). A successful
	* reset does NOT establish a session — the user logs in normally afterwards.
	*
	* @param object $rqo
	* {
	*	action	: 'confirm_password_reset',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		reset_id     : string  opaque token from request_password_reset
	*		code         : string  6-digit code received by email
	*		new_password : string  the new plain-text password
	*	}
	* }
	* @return object $response  Forwarded from password_reset::confirm
	* - result : bool
	* - msg    : string
	* - errors : array  e.g. ['invalid_or_expired'|'too_many_attempts'|'weak_password']
	*/
	public static function confirm_password_reset(object $rqo) : object {

		$options		= $rqo->options ?? new stdClass();
		$reset_id		= (string)($options->reset_id ?? '');
		$code			= (string)($options->code ?? '');
		$new_password	= (string)($options->new_password ?? '');

		return password_reset::confirm($reset_id, $code, $new_password);
	}//end confirm_password_reset



	/**
	* QUIT
	* Logs the current user out, destroys the session, and optionally returns
	* a SAML single-logout redirect URL.
	*
	* The login_type is read from $_SESSION before the session is destroyed so
	* the SAML redirect can still be generated after logout. After login::Quit()
	* completes, session_write_close() is called to release the session lock
	* and prevent stale session data from persisting.
	*
	* When SAML is active (SAML_CONFIG['active'] === true) and a logout URL is
	* configured, the response carries a `saml_redirect` field that the client
	* must follow to complete the SAML single-logout flow.
	*
	* @param object $rqo
	* {
	*	action	: 'quit',
	*	dd_api	: 'dd_utils_api',
	*	options	: {}
	* }
	* @return object $response
	* - result:        bool    true when logout succeeded
	* - msg:           string  Status message
	* - saml_redirect: string  (only present when SAML is active) IdP logout URL
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
				if ($login_type==='saml' && defined('SAML_CONFIG') && is_array(SAML_CONFIG) && (SAML_CONFIG['active'] ?? false) === true && isset(SAML_CONFIG['logout_url'])) {
					$response->saml_redirect = SAML_CONFIG['logout_url'];
				}


		return $response;
	}//end quit



	/**
	* INSTALL
	* Dispatcher for the install-wizard sub-actions. Routes $options->action to
	* the matching install:: class method, enforcing the following guards:
	*
	* - When DEDALO_INSTALL_STATUS === 'installed', all sub-actions are blocked
	*   EXCEPT 'install_hierarchies' (which may run post-install to add new
	*   ontology hierarchies and requires an active session).
	* - 'install_db_from_default_file' additionally checks that the target
	*   database is empty (no matrix_users table) before importing, preventing
	*   data loss on an already-initialized database.
	* - 'install_hierarchies' requires login::is_logged() === true.
	*
	* Supported sub-actions and their delegates:
	*   install_db_from_default_file → install::install_db_from_default_file()
	*   to_update                    → install::to_update()
	*   install_hierarchies          → install::install_hierarchies()
	*   set_root_pw                  → install::set_root_pw()
	*   install_finish               → install::set_install_status('installed')
	*
	* @param object $rqo
	* {
	*	action	: 'install',
	*	dd_api	: 'dd_utils_api',
	*	options	: {
	*		action : string  One of the sub-actions listed above
	*		...              Additional fields consumed by the delegate method
	*	}
	* }
	* @return object $response  Shape varies by sub-action; always has result and msg
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
			$response->msg = 'Error. Request not valid, Dédalo was installed';
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
	* UPLOAD
	* Validates and stores a single uploaded file (or one chunk of a chunked upload)
	* into the per-user upload staging area (DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>).
	*
	* Security model (applied in order):
	*   1. Permission gate: when $options->tipo is provided the caller must have
	*      at least write permission (level 2) on the target section type;
	*      tipo-less uploads (scratch / tool_upload) fall through to the
	*      historical logged-only check because they are unbound until a
	*      component's save flow consumes and validates them.
	*   2. PHP upload-error check: all UPLOAD_ERR_* codes are handled explicitly.
	*   3. MIME-type allowlist: finfo::file() is used to detect the real MIME
	*      type (not the client-supplied Content-Type). Unknown MIMEs are rejected.
	*   4. Extension allowlist: the extension extracted from the file name must
	*      appear in get_known_mime_types().
	*   5. MIME–extension cross-validation: the extension must belong to the same
	*      allowlist entry as the finfo-detected MIME (prevents e.g. uploading a
	*      PHP file renamed to .jpg).
	*   6. Path confinement: safe_upload_target() confines the destination path
	*      inside $tmp_dir using basename + realpath, rejecting path-traversal
	*      sequences (API-01).
	*   7. Move: supports both native PHP move_uploaded_file() and PSR-7
	*      UploadedFileInterface::moveTo() (for RoadRunner workers).
	*
	* For chunked uploads (options->chunked === 'true') each chunk is stored as
	*   "<chunk_index>-<tmp_name>.blob" and the MIME check uses
	*   'application/octet-stream', which always passes. The final assembled
	*   file is validated in join_chunked_files_uploaded (SEC-066).
	*
	* The 'web' key_dir is a special case for rich-text editor image uploads:
	* the file is moved directly to DEDALO_MEDIA_PATH/image/<WEB_FOLDER>/ and
	* the response carries a plain { url } object (not the standard envelope).
	*
	* Thumbnails are generated immediately for non-chunked images, videos, and
	* PDFs via create_thumbnail(). Chunked thumbnails are generated after
	* join_chunked_files_uploaded completes.
	*
	* (!) Activity logging for completed uploads is intentionally done inside
	*     tool_upload::process_uploaded_file, not here, because chunk order is
	*     non-deterministic and this method cannot reliably detect the last chunk.
	*
	* @param object $rqo
	* {
	*	action: 'upload',
	*	dd_api: 'dd_utils_api',
	*	options: {
	*		key_dir       : string  Upload category / component tipo contraction, e.g. 'av'
	*		file_name     : string  (chunked only) Final assembled file name
	*		chunked       : string  'true' | 'false'
	*		start         : string  (chunked) Byte offset of this chunk
	*		end           : string  (chunked) End byte of this chunk
	*		chunk_index   : string  (chunked) Zero-based chunk index
	*		total_chunks  : string  (chunked) Total number of chunks
	*		tipo          : string  (optional) Target component tipo for permission check
	*		file_to_upload: array   PHP $_FILES entry, optionally augmented with 'psr7' key
	*	}
	* }
	* @return object $response
	* - result:    bool
	* - msg:       string
	* - file_data: object  (on success) File metadata; shape varies by chunked/non-chunked
	*/
	public static function upload(object $rqo) : object {
		$start_time=start_time();

		session_write_close();

		// options
			$options		= $rqo->options;
			$file_to_upload	= $options->file_to_upload ?? $options->file ?? $options->upload;	// assoc array Added from PHP input '$_FILES'
			$key_dir		= sanitize_key_dir($options->key_dir ?? ''); // string like 'tool_upload'
			$tipo			= $options->tipo ?? null;
			$chunked		= isset($options->chunked) // received as string 'true'|'false'
				? (bool)json_decode($options->chunked)
				: false;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. '.label::get_label('error_on_upload_file');

		// SEC: when the upload targets a specific tipo, require write permission
			// on its section. If $tipo is empty (generic scratch / tool_upload
			// case) we fall back to the historical "logged-only + per-user
			// path scoping" behaviour because the file is unbound until the
			// component save flow consumes it (which is itself permission-gated).
			if (!empty($tipo) && safe_tipo($tipo)===true) {
				$target_section_tipo = ontology::map_tld_to_target_section_tipo(
					get_tld_from_tipo($tipo)
				);
				if (!empty($target_section_tipo)) {
					try {
						security::assert_section_permission($target_section_tipo, 2, __METHOD__);
					} catch (permission_exception $e) {
						$response->msg .= ' permissions_denied';
						$response->errors = $response->errors ?? [];
						$response->errors[] = 'permissions_denied';
						return $response;
					}
				}
			}

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
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					case UPLOAD_ERR_INI_SIZE:
					case UPLOAD_ERR_FORM_SIZE:
						$msg = ' upload: Exceeded filesize limit.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					case UPLOAD_ERR_PARTIAL:
						$msg = ' upload: The uploaded file was only partially uploaded.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					case UPLOAD_ERR_CANT_WRITE:
						$msg = ' upload: Failed to write file to disk.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					case UPLOAD_ERR_NO_TMP_DIR:
						$msg = ' upload: Missing a temporary folder.';
						debug_log(__METHOD__
							. " $msg " .PHP_EOL
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;

					default:
						$msg = ' upload: Unknown errors.';
						debug_log(__METHOD__
							." $msg " .PHP_EOL
							. ' file_to_upload error: ' .to_string($file_to_upload['error']) . PHP_EOL
							.' rqo: ' . to_string($rqo)
							, logger::ERROR
						);
						$response->msg .= $msg;
						return $response;
				}

			// You should also check filesize here.
				// if ($file_to_upload['size'] > 1000000) {
				// 	throw new RuntimeException('Exceeded filesize limit.');
				// }

				// filename
				$file_name		= $file_to_upload['name'];
				$file_tmp_name	= $file_to_upload['tmp_name']; // Like: '/tmp/php9ecci0m0mr3q9rJk8n2'
				$file_type 		= $file_to_upload['type']; // mime like 'image/tiff'

				// blob case (componen_3d posterframe auto-generated)
				if ($file_name==='blob' && isset($options->file_name)) {
					$file_name = $options->file_name;
				}

				// extension
				$extension= strtolower( pathinfo($file_name, PATHINFO_EXTENSION) );

				// Do not trust $file_to_upload['mime'] VALUE !!
				// Check MIME Type by yourself.

				$finfo		= new finfo(FILEINFO_MIME_TYPE);
				$file_mime	= $finfo->file($file_tmp_name); // ex. string 'text/plain'

			// name
				$name = $file_name;
				if($chunked===true) {
					$file_name		= $options->file_name;
					$total_chunks	= $options->total_chunks;
					$chunk_index	= $options->chunk_index;
					$tmp_name		= basename($file_tmp_name);
					$extension		= 'blob';
					$name			= "{$chunk_index}-{$tmp_name}.{$extension}";
					$file_mime		= 'application/octet-stream';
				}

			// Sanitize filename to match what add_file() will search for
			// This prevents mismatch when add_file() sanitizes tmp_name with sanitize_key_dir()
				$name = sanitize_key_dir($name);

			// CHECKING
				$known_mime_types = self::get_known_mime_types();
				// Check MIME type and find matching entry
					$mime_is_known = false;
					$matched_mime_entry = null;
					foreach ($known_mime_types as $current_mime) {
						if ($current_mime['mime']===$file_mime) {
							$mime_is_known = true;
							$matched_mime_entry = $current_mime;
							break;
						}
					}
					if ($mime_is_known===false) {
						// throw new RuntimeException('Invalid file format.');
						debug_log(__METHOD__
							." Error. Stopped upload unknown file mime type." . PHP_EOL
							. ' file_mime: ' . to_string($file_mime) . PHP_EOL
							. ' file_tmp_name: ' . to_string($file_tmp_name) . PHP_EOL
							. ' extension: ' . to_string($extension) . PHP_EOL
							. ' known_mime_types: ' . to_string($known_mime_types)
							, logger::ERROR
						);
						$msg = ' upload: Invalid file format. (mime: '.$file_mime.')';
						$response->msg .= $msg;
						return $response;
					}
				// check extension is in the whitelist at all
					$extension_is_allowed = false;
					foreach ($known_mime_types as $current_mime) {
						if (in_array($extension, $current_mime['extension'])) {
							$extension_is_allowed = true;
							break;
						}
					}
					if ($extension_is_allowed===false) {
						$response->msg .= "Error. Invalid file extension [2] ".$extension;
						debug_log(__METHOD__
							. ' '.$response->msg .PHP_EOL
							. ' extension from file_name: '. to_string($extension) .PHP_EOL
							. ' file_name: '. to_string($file_name) .PHP_EOL
							. ' file_to_upload: '. to_string($file_to_upload)
							, logger::ERROR
						);
						return $response;
					}
				// cross-validate: extension must belong to the same MIME type entry as the detected MIME
					if ($matched_mime_entry !== null && !in_array($extension, $matched_mime_entry['extension'])) {
						$response->msg .= "Error. Extension '".$extension."' does not match MIME type '".$file_mime."'";
						debug_log(__METHOD__
							. ' '.$response->msg .PHP_EOL
							. ' extension: '. to_string($extension) .PHP_EOL
							. ' file_mime: '. to_string($file_mime) .PHP_EOL
							. ' file_name: '. to_string($file_name)
							, logger::ERROR
						);
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
					$user_id = logged_user_id();
					$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

				// tmp_dir. Check the target_dir, if it is not created it will be created for use.
					if(!create_directory($tmp_dir, 0750)) {
						$response->msg .= ' Error on read or create tmp_dir directory. Permission denied';
						return $response;
					}

				// move file to target path
					// API-01: confine the client-supplied name to $tmp_dir (basename +
					// realpath confinement) before it reaches move_uploaded_file/moveTo.
					// sanitize=false preserves the exact (server-generated for chunks)
					// name so the chunk-join read-back still matches on disk.
					try {
						$target_path = safe_upload_target($tmp_dir, $name, false);
					} catch (\Throwable $e) {
						$response->msg .= ' Invalid upload file name.';
						debug_log(__METHOD__ . ' Rejected unsafe upload target: ' . $e->getMessage(), logger::ERROR);
						return $response;
					}
					// Handle move file.
					// If we are in RoadRunner, we use moveTo() from PSR-7 object
					if (isset($file_to_upload['psr7']) && $file_to_upload['psr7'] instanceof \Psr\Http\Message\UploadedFileInterface) {
						try {
							$file_to_upload['psr7']->moveTo($target_path);
							$moved = true;
						} catch (\Throwable $e) {
							$moved = false;
							debug_log(__METHOD__ . ' Error moving PSR-7 file: ' . $e->getMessage(), logger::ERROR);
						}
					} else {
						// Native PHP upload
						$moved = move_uploaded_file($file_tmp_name, $target_path);
					}
					// verify move file is successful
					if ($moved !== true) {
						$response->msg .= 'Error moving uploaded file.';
						debug_log(__METHOD__ . ' Error moving file to target path.', logger::ERROR);
						return $response;
					}else{
						debug_log(__METHOD__
							. " Moved file >>>>>>>>>>>>>> " . PHP_EOL
							. ' from file_tmp_name: '.$file_tmp_name . PHP_EOL
							. ' to target_path: '.$target_path
							, logger::WARNING
						);
					}

				// thumbnail file
					if(!$chunked===true) {
						$thumb_options = new stdClass();
							$thumb_options->tmp_dir		= $tmp_dir;
							$thumb_options->name		= $name;
							$thumb_options->target_path	= $target_path;
							$thumb_options->key_dir		= $key_dir;
							$thumb_options->user_id		= $user_id;

						$thumbnail_url = dd_utils_api::create_thumbnail($thumb_options);
					}

			// file_data to client. POST file (sent across $_FILES) info and some additions
				// Example of received data:
				// "file_to_upload": {
				//		"name": "exported_templates-web_-1-dd477.csv",
				//		"full_path": "exported_templates-web_-1-dd477.csv",
				//		"type": "text/csv",
				//		"tmp_name": "/private/var/tmp/phpQ02UUO",
				//		"error": 0,
				//		"size": 29892
				// }
				$file_data = new stdClass();
					$file_data->name			= $file_name; // like 'My Picture 1.jpg'
					$file_data->type			= $file_to_upload['type']; // like 'image\/jpeg'
					$file_data->tmp_dir			= 'DEDALO_UPLOAD_TMP_DIR'; // like DEDALO_MEDIA_PATH . '/upload/service_upload/tmp'
					$file_data->key_dir			= $key_dir; // like 'tool_upload'
					$file_data->tmp_name		= $name; // like 'phpv75h2K'
					$file_data->error			= $file_to_upload['error']; // like 0
					$file_data->size			= $file_to_upload['size']; // like 878860 (bytes)
					$file_data->time_sec		= exec_time_unit($start_time,'sec');
					$file_data->extension		= $extension;
					$file_data->thumbnail_url	= $thumbnail_url ?? null;
					$file_data->chunked			= $chunked;
					if($chunked===true) {
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

			// logger activity
			// (!) Don't use here because on chunk file, is not possible to know if current chunk is the last one (random upload order)
			// (!) Moved this activity log to class tool_upload::process_uploaded_file method
				// $finished = ($chunked===true)
				// 	? ($chunk_index === ($total_chunks - 1)) // is last chunk
				// 	: true;
				// if ($finished===true && !empty($tipo)) {
				// 	logger::$obj['activity']->log_message(
				// 		'UPLOAD COMPLETE',
				// 		logger::INFO,
				// 		$tipo,
				// 		NULL,
				// 		[
				// 			'msg'				=> 'Upload file complete',
				// 			'file_data'			=> json_encode($file_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
				// 			'file_name' 		=> $file_data->name,
				// 			'file_size' 		=> format_size_units($file_data->size),
				// 			'time_sec' 			=> $file_data->time_sec,
				// 			'f_error'			=> $file_data->error ?? null
				// 		]
				// 	);
				// }

		}catch (RuntimeException $e) {

			$response->msg .= ' Request failed: '. $e->getMessage();
			debug_log(__METHOD__
				. ' RuntimeException catch. msg: '.$response->msg
				, logger::ERROR
			);
		}


		return $response;
	}//end upload



	/**
	* JOIN_CHUNKED_FILES_UPLOADED
	* Assembles individual chunk files written by upload() into a single final file.
	*
	* After all chunks have been uploaded (each stored as
	* "<chunk_index>-<tmp_name>.blob" in the user's staging directory), the
	* client sends this request with the ordered list of chunk filenames in
	* $options->files_chunked. The method:
	*   1. Validates and confines each chunk path inside the upload tree (API-02)
	*      to prevent path-traversal on client-supplied chunk names.
	*   2. Appends each chunk's content to a temporary assembled file using
	*      FILE_APPEND | LOCK_EX.
	*   3. Deletes each chunk after appending.
	*   4. Validates the extension of the assembled file name against the MIME
	*      allowlist and rejects unknown extensions (with deletion of the
	*      assembled file, SEC-066).
	*   5. Runs finfo::file() on the fully assembled file and cross-validates
	*      the detected MIME type against the client-supplied extension —
	*      closing the attack window where a hostile payload is streamed as
	*      legitimate-extension chunks and the joined file escapes MIME
	*      validation (SEC-066).
	*   6. Generates a thumbnail via create_thumbnail().
	*   7. Returns the updated file_data object for the client to use in
	*      subsequent component-save calls.
	*
	* (!) The end-of-function comment label reads 'get_system_info' — that is a
	*     copy-paste error in the original source; this is join_chunked_files_uploaded.
	*
	* @param object $rqo
	* {
	*	dd_api : 'dd_utils_api',
	*	action : 'join_chunked_files_uploaded',
	*	options: {
	*		file_data     : object    Metadata from the upload() response (key_dir, name, …)
	*		files_chunked : string[]  Ordered list of chunk filenames to assemble
	*	}
	* }
	* @return object $response
	* - result:    bool
	* - msg:       string
	* - file_data: object  Updated file_data with tmp_name, extension, thumbnail_url
	*/
	public static function join_chunked_files_uploaded(object $rqo) : object {

		// options
			$options		= $rqo->options;
			$files_chunked	= $options->files_chunked;
			$file_data		= $options->file_data;
			$key_dir 	= sanitize_key_dir($file_data->key_dir ?? '');

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed';

		// file_path
			$user_id	= logged_user_id();
			$file_path	= DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

		// tmp_joined_file + target path of the final file joined.
		// API-02: confine the client-supplied name under $file_path before any
		// filesystem use; reject names that would escape the upload tree.
			try {
				$target_path	 = safe_upload_target($file_path, 'tmp_'.$file_data->name, false);
				$tmp_joined_file = basename($target_path);
			} catch (\Throwable $e) {
				$response->msg = 'Invalid joined file name.';
				debug_log(__METHOD__ .' Rejected unsafe joined target: '. $e->getMessage(), logger::ERROR);
				return $response;
			}

		// loop through temp files and grab the content
			foreach ($files_chunked as $chunk_filename) {

				// copy chunk
				// API-02: confine each client-supplied chunk name under $file_path
				// BEFORE read/unlink, so '../' cannot read or delete arbitrary files.
				try {
					$temp_file_path = safe_upload_target($file_path, (string)$chunk_filename, false);
				} catch (\Throwable $e) {
					$response->msg = 'Invalid chunk file name.';
					debug_log(__METHOD__ .' Rejected unsafe chunk: '. $e->getMessage(), logger::ERROR);
					return $response;
				}
				$chunk			= file_get_contents($temp_file_path);
				if ( empty($chunk) ){
					$response->msg = "Chunks are uploading as empty strings.";
					debug_log(__METHOD__
						.' Error: '.$response->msg
						, logger::ERROR
					);
					return $response;
				}

				// add chunk to main file
				file_put_contents($target_path, $chunk, FILE_APPEND | LOCK_EX);

				// delete chunk
				unlink($temp_file_path);
				if ( file_exists($temp_file_path) ) {
					$response->msg = "Your temp files could not be deleted.";
					debug_log(__METHOD__
						.' Error: '.$response->msg
						, logger::ERROR
					);
					return $response;
				}
			}

		// extension
			$extension = strtolower( pathinfo($tmp_joined_file, PATHINFO_EXTENSION) );

		// check extension
			$known_mime_types		= self::get_known_mime_types();
			$extension_is_allowed	= false;
			foreach ($known_mime_types as $current_mime) {
				if (in_array($extension, $current_mime['extension'])) {
					$extension_is_allowed = true;
					break;
				}
			}
			if ($extension_is_allowed===false) {
				$response->msg .= "Error. Invalid file extension [2] ".$extension;
				debug_log(__METHOD__
					. ' '.$response->msg .PHP_EOL
					. ' extension: '. to_string($extension) .PHP_EOL
					, logger::ERROR
				);
				// SEC-066: drop the assembled file when validation fails so a
				// hostile payload cannot persist under the upload tree even
				// if the operator never calls delete_uploaded_file().
				if (file_exists($target_path)) {
					@unlink($target_path);
				}
				return $response;
			}

		// SEC-066: content sniff at move-time. The non-chunked upload path
		// runs `finfo` on the temp file and cross-checks the detected MIME
		// against the extension. The chunked path historically skipped both
		// because each chunk's MIME is `application/octet-stream` — but the
		// final, ASSEMBLED file is what lands under the upload tree, and it
		// MUST be re-validated. Without this an attacker can stream a PHP /
		// SVG-with-script / HTML payload as `.jpg` chunks and have the
		// joined artefact (still named `.jpg`) sit on disk for any downstream
		// caller to pick up.
			$assembled_finfo = new finfo(FILEINFO_MIME_TYPE);
			$assembled_mime  = $assembled_finfo->file($target_path);
			$mime_entry = null;
			foreach ($known_mime_types as $current_mime) {
				if ($current_mime['mime'] === $assembled_mime) {
					$mime_entry = $current_mime;
					break;
				}
			}
			if ($mime_entry === null) {
				$response->msg .= ' Error. Assembled file mime not in allowlist: ' . $assembled_mime;
				debug_log(__METHOD__
					. ' SEC-066 unknown assembled MIME on chunk join.' . PHP_EOL
					. ' assembled_mime: ' . to_string($assembled_mime) . PHP_EOL
					. ' target_path: ' . to_string($target_path)
					, logger::ERROR
				);
				if (file_exists($target_path)) {
					@unlink($target_path);
				}
				return $response;
			}
			if (!in_array($extension, $mime_entry['extension'], true)) {
				$response->msg .= ' Error. Extension \'' . $extension
					. '\' does not match assembled MIME \'' . $assembled_mime . '\'';
				debug_log(__METHOD__
					. ' SEC-066 extension/MIME mismatch on chunk join.' . PHP_EOL
					. ' extension: ' . to_string($extension) . PHP_EOL
					. ' assembled_mime: ' . to_string($assembled_mime)
					, logger::ERROR
				);
				if (file_exists($target_path)) {
					@unlink($target_path);
				}
				return $response;
			}

		// thumbnail
			$thumb_options = new stdClass();
				$thumb_options->tmp_dir		= $file_path;
				$thumb_options->name		= $tmp_joined_file;
				$thumb_options->target_path	= $target_path;
				$thumb_options->key_dir		= $key_dir;
				$thumb_options->user_id		= $user_id;
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
	* Returns the list of files already staged in the current user's upload
	* directory for a given key_dir. Called by the Dropzone upload widget on
	* initial render to pre-populate the file list with previously uploaded
	* (but not yet saved) items.
	*
	* Only files owned by the currently logged-in user are visible: the path
	* is scoped to DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>. Dotfiles and
	* subdirectory entries are skipped.
	*
	* The session is explicitly unlocked (session_write_close) before scanning
	* the filesystem so that concurrent requests from the same session are not
	* blocked.
	*
	* @param object $rqo
	* {
	*	options: {
	*		key_dir: string  Upload category identifier, e.g. 'oh1_4'
	*	}
	* }
	* @return object $response
	* - result: array  Array of objects with shape:
	*   { url: string (thumbnail URL), name: string (file name), size: int (bytes) }
	* - msg:    string  Status message
	*/
	public static function list_uploaded_files(object $rqo) : object {

		// unlock session
			session_write_close();
			ignore_user_abort(true);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		// options
			$key_dir = sanitize_key_dir($rqo->options->key_dir ?? '');

		// dir
			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;
			$tmp_url = DEDALO_UPLOAD_TMP_URL . '/'. $user_id . '/' . $key_dir;

		// read files dir
			$files = [];
			if (is_dir($tmp_dir)) {
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
			}

		// response
			$response->result	= $files;
			$response->msg		= 'OK. Request done';

		return $response;
	}//end list_uploaded_files



	/**
	* DELETE_UPLOADED_FILE
	* Removes one or more staged uploaded files (and their thumbnails) from the
	* current user's upload staging directory. Called by the Dropzone widget when
	* the user removes a file from the upload queue before saving.
	*
	* Accepts a single file name or an array of names in $options->file_name.
	* Each name is sanitized with sanitize_file_name() before being used to
	* build the path, preventing path-traversal attacks via client-supplied names.
	* The corresponding thumbnail (thumbnail/<basename>.jpg) is also deleted
	* when it exists.
	*
	* The method sets result = false and appends to msg if any individual unlink
	* call fails, but continues processing the remaining names in the array.
	* The final response is result = true only when all deletions succeeded.
	*
	* @param object $rqo
	* {
	*	options: {
	*		file_name : string|string[]  One or more staged file names to delete
	*		key_dir   : string           Upload category identifier
	*	}
	* }
	* @return object $response
	* - result: bool    false if any unlink failed or file did not exist
	* - msg:    string  Status message (error detail on failure)
	*/
	public static function delete_uploaded_file(object $rqo) : object {

		// unlock session
			session_write_close();
			ignore_user_abort(true);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$options = $rqo->options;

		// short vars
			$file_names	= is_array($options->file_name) ? $options->file_name : [$options->file_name];
			$key_dir	= sanitize_key_dir($options->key_dir ?? ''); // key_dir. Contraction of tipo + section_tipo, like: 'rsc29_rsc176'

		// dir
			$user_id	= logged_user_id();
			$tmp_dir	= DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

		// delete each file
			foreach ($file_names as $file_name) {

				// sanitize file_name to prevent path traversal
					$file_name = sanitize_file_name($file_name);

				// file_path
					$file_path = $tmp_dir . '/' . $file_name;

				// delete file
					if (file_exists($file_path) && !unlink($file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete file (unable to unlink file): ".to_string($file_path);
						debug_log(__METHOD__
							." $response->msg"
							, logger::ERROR
						);
					}

				// thumb_path
					$info				= pathinfo($file_name);
					$basemane			= basename($file_name,'.'.$info['extension']);
					$thumb_file_path	= $tmp_dir . '/thumbnail/' . $basemane . '.jpg';

				// delete thumb
					if (file_exists($thumb_file_path) && !unlink($thumb_file_path)) {
						$response->result	= false;
						$response->msg		= "Error on delete thumb file (unable to unlink file): ".to_string($thumb_file_path);
						debug_log(__METHOD__
							." $response->msg"
							, logger::ERROR
						);
					}
			}//end foreach ($file_names as $file_name)

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end delete_uploaded_file



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* Records a component focus or blur event in the collaborative lock table,
	* then returns the current lock state so the UI can show/hide the "in use by
	* another user" indicator.
	*
	* Called on every focus/blur of an editable component. The session is
	* released immediately (session_write_close) so that concurrent lock-poll
	* requests from the same user session are not serialized.
	*
	* Security: the caller must have at least read permission (level 1) on the
	* target section_tipo. Without this check any logged-in user could fabricate
	* focus events on sections they are not authorized to view.
	*
	* The response also carries the current DEDALO_NOTIFICATION /
	* DEDALO_NOTIFICATION_CUSTOM value so the client can update any visible
	* maintenance banner in a single round-trip.
	*
	* @param object $rqo
	* {
	*	dd_api  : 'dd_utils_api',
	*	action  : 'update_lock_components_state',
	*	options : {
	*		component_tipo : string  Tipo of the focused component
	*		section_tipo   : string  Tipo of the parent section
	*		section_id     : string  Record ID within the section
	*		action         : string  'focus' | 'blur' | 'delete_user_section_locks'
	*	}
	* }
	* @return object $response
	* - result:              bool
	* - msg:                 string
	* - data:                array   Current lock entries (see lock_components::update_lock_components_state)
	* - in_use:              bool    true when another user currently holds a focus lock
	* - dedalo_notification: string|null  Current maintenance notification text
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
			$user_id		= logged_user_id();
			$full_username	= ($user_id<0)
				? 'Debug user'
				: (logged_user_full_username() ?? 'Unknown');

		// SEC: read permission on the section is required to participate in
			// its lock-components state. Prevents fabricating focus/blur events
			// on records the user has no access to.
			if (!empty($section_tipo)) {
				security::assert_section_permission($section_tipo, 1, __METHOD__);
			}

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
			$response = lock_components::update_lock_components_state( $event_element );

		// dedalo_notification (from config)
			$response->dedalo_notification = (defined('DEDALO_NOTIFICATION'))
				? DEDALO_NOTIFICATION
				: null;
			// DEDALO_NOTIFICATION_CUSTOM from area_maintenance (overwrites the default notification)
				if (defined('DEDALO_NOTIFICATION_CUSTOM') && !empty(DEDALO_NOTIFICATION_CUSTOM)) {
					$response->dedalo_notification = DEDALO_NOTIFICATION_CUSTOM;
				}


		return $response;
	}//end update_lock_components_state



	/**
	* GET_DEDALO_FILES
	* Returns a manifest of all Dédalo JS and CSS files (core + tools) that the
	* client service worker should pre-cache.
	*
	* The result is used by the service worker (worker_cache.js) to build its
	* cache on install or when a new DEDALO_VERSION is detected. The method
	* walks the filesystem rather than maintaining a static list so that newly
	* added files are automatically included.
	*
	* Filter rules applied to core JS files:
	*   - Only files inside a /js/ directory are included.
	*   - Excluded subtrees: /acc/, /themes/, /ontology/, /old/, /lib/,
	*     /test/, /plug-ins/, /fonts/, worker_cache.js, /sw.js.
	*
	* Filter rules for tool JS/CSS files:
	*   - Only files at depth <tool_dir>/js/ or <tool_dir>/css/ are included.
	*   - Excluded subtrees: /acc/, /old/, /lib/.
	*
	* The main.css file is added first (its path under /page/css/ does not
	* follow the /js/ pattern so it would otherwise be skipped).
	*
	* The response also includes the current DEDALO_VERSION so the client can
	* invalidate stale service-worker caches.
	*
	* @param object $rqo
	* @return object $response
	* - result:         array   Objects with { type: 'js'|'css', url: string }
	* - dedalo_version: string  Current DEDALO_VERSION constant
	* - msg:            string  Status message
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

			// CORE
				// css add 'main.css' to preserve coherence
				$files[] = (object)[
					'type'	=> 'css',
					'url'	=>  DEDALO_CORE_URL . '/page/css/main.css'
				];
				// js
				$core_js_files	= get_dir_files(DEDALO_CORE_PATH, ['js'], function($el) {
					// remove self base directory from file path
					$file = str_replace(DEDALO_CORE_PATH, '', $el);
					if ( stripos($file, '/acc/')!==false ||
						 strpos($file, '/themes/')!==false || // ignore themes directory
						 strpos($file, '/ontology/')!==false || // ignore old ontology files (no modules)
						 stripos($file, '/old/')!==false ||
						 stripos($file, '/lib/')!==false || // ignore libraries
						 strpos($file, '/test/')!==false || // ignore test
						 strpos($file, '/plug-ins/')!==false || // ignore test
						 strpos($file, '/fonts/')!==false || // ignore fonts
						 strpos($file, 'worker_cache.js')!==false ||
						 strpos($file, '/sw.js')!==false // ignore service worker
						) {
						return null; // item does not will be added to the result
					}
					// only js dirs
					if (strpos($file, '/js/')===false) {
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

			// TOOLS
				$tools_js_files	= get_dir_files(DEDALO_TOOLS_PATH, ['js','css'], function(string $el) : ?string {
					// remove self base directory from file path
					$file = str_replace(DEDALO_TOOLS_PATH, '', $el);

					if ( stripos($file, '/acc/')!==false ||
						 stripos($file, '/old/')!==false ||
						 stripos($file, '/lib/')!==false
						) {
						return null; // item does not will be added to the result
					}

					// tool first level dir
					// Sample:
					// [
					// 	"",
					// 	"tool_user_admin",
					// 	"js",
					// 	"render_tool_user_admin.js"
					// ]
					$ar_levels = explode('/', $file);
					if ($ar_levels[2]!=='js' && $ar_levels[2]!=='css') {
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
			// result: list of all Dédalo main files (JS/CSS) without the libraries
			$response->result = $files;
			// dedalo_version: used to set the cache version in worker
			$response->dedalo_version = DEDALO_VERSION;
			// msg: Success message for browser
			$response->msg = 'OK. Request done successfully';


		return $response;
	}//end get_dedalo_files



	/**
	* GET_PROCESS_STATUS
	* Opens a Server-Sent Events (SSE) stream that polls a background process
	* and pushes its current status to the client at a configurable interval.
	*
	* Under RoadRunner (DEDALO_RR_WORKER defined) this method immediately
	* delegates to get_process_status_stream(), which yields SSE chunks instead
	* of echoing directly, because RoadRunner's worker protocol requires a
	* generator to stream responses correctly.
	*
	* Under standard PHP-FPM the method:
	*   1. Sets max_execution_time to 10 hours so long processes are not cut off.
	*   2. Releases the session lock (session_write_close) to allow concurrent
	*      requests from the same session.
	*   3. Checks authentication — unauthenticated callers receive an error
	*      string via die() (the raw SSE stream has no JSON envelope at this
	*      point).
	*   4. Enforces ownership: the process entry must belong to the logged user
	*      (or the caller must be DEDALO_SUPERUSER) to prevent information
	*      leakage between users via guessed/leaked pid values.
	*   5. Emits SSE headers and enters an event loop:
	*      - reads is_running + data from the process file on each iteration,
	*      - pads the JSON payload to 4096 bytes on HTTP/1.1 to work around
	*        Apache's tendency to coalesce small chunks,
	*      - writes `data:\n{json}\n\n` frames,
	*      - breaks when is_running is false or the client disconnects.
	*   6. Calls processes::delete_process_item() and die() on loop exit.
	*
	* (!) This method does NOT return an object — it terminates via die().
	*     The @return annotation is kept as 'die()' for historical clarity.
	*
	* @param object $rqo
	* {
	*	options: {
	*		pid:   int|string  System process ID
	*		pfile: string      Process output file name (relative to process::get_process_path())
	*	}
	*	update_rate?: int  Polling interval in milliseconds (default 1000)
	* }
	* @return void  Terminates via die() after the SSE stream ends
	*/
	public static function get_process_status(object $rqo) {

		// Under RoadRunner the echo/flush/die() model breaks the worker protocol.
		// Delegate to the generator version which yields SSE chunks and lets
		// the worker loop stream them frame-by-frame via HttpWorker::respond().
		if (defined('DEDALO_RR_WORKER')) {
			return self::get_process_status_stream($rqo);
		}

		$start_time=start_time();

		// max_execution_time
			ini_set('max_execution_time', 36000); // seconds ( 3600 * 10 ) = 10 hours

		// session unlock
			session_write_close();

		// options
			$pfile	= $rqo->options->pfile;
			$pid	= $rqo->options->pid;

		// only logged users can access SSE events
			if(login::is_logged()!==true) {
				die('Authentication error: please login');
			}

		// SEC: ownership check. The pid/pfile must belong to the logged user
			// (or the logged user must be superuser). Prevents reading other
			// users' background process output by guessing/leaking pid.
			if (!empty($pid) && !empty($pfile)) {
				$logged_user_id	= logged_user_id();
				$is_superuser	= ((int)$logged_user_id === DEDALO_SUPERUSER);
				$entry			= processes::get_process_item((int)$pid, (string)$pfile);
				if ($entry === null || (!$is_superuser && (int)($entry->user_id ?? 0) !== (int)$logged_user_id)) {
					debug_log(__METHOD__
						. ' Denied process status read: process not owned by logged user' . PHP_EOL
						. ' pid: ' . to_string($pid) . PHP_EOL
						. ' logged_user_id: ' . to_string($logged_user_id)
						, logger::ERROR
					);
					die('Authentication error: process not owned by current user');
				}
			}

		// header print as event stream
			header("Content-Type: text/event-stream");
			header("Cache-Control: no-cache, must-revalidate");
			header('Connection: keep-alive');
			header("Access-Control-Allow-Origin: *");
			header('X-Accel-Buffering: no'); // nginx buffer control

		// mandatory vars
			if (empty($pfile) || empty($pid)) {
				$output = (object)[
					'pid'			=> $pid,
					'pfile'			=> $pfile,
					'is_running'	=> false,
					'data'			=> (object)[
						'msg' => 'Error: pfile and pid are mandatory'
					],
					'time'			=> date("Y-m-d H:i:s"),
					'errors'		=> ['Error: pfile and pid are mandatory']
				];
				echo json_handler::encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . PHP_EOL;
				die();
			}

		// process
			$process = new process();
				$process->setPid($pid);
				$process->setFile(process::get_process_path() .'/'. $pfile);

		// event loop
			// update rate (int milliseconds)
			$update_rate = $rqo->update_rate ?? 1000;
			while (1) {

				// process info updated on each loop
					$is_running	= $process->status(); // bool is running
					$array_data	= $process->read(); // array data
					// encode
					$value = isset($array_data[0])
						? (json_decode($array_data[0]) ?? $array_data[0])
						: '';

					$data = (!is_object($value))
						? (object)[
							'msg' => $value
						  ]
						: $value;

				// output JSON to client
					$output = (object)[
						'pid'			=> $pid,
						'pfile'			=> $pfile,
						'is_running'	=> $is_running,
						'data'			=> $data,
						'time'			=> date("Y-m-d H:i:s"),
						'total_time' 	=> exec_time_unit_auto($start_time),
						'update_rate'	=> $update_rate,
						'errors'		=> []
					];

				// debug
					if(SHOW_DEBUG===true) {
						error_log('process loop: is_running: '.to_string($is_running) . ' - pid: ' .$pid. ' - pfile: ' .$pfile);
					}

				// output the response JSON string
					$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
					if (!is_string($a)) {
						debug_log(__METHOD__
							. " Error. output value is no correctly JSON encoded ! " . PHP_EOL
							. to_string($a)
							, logger::ERROR
						);
						// force type string
						$a = to_string($a);
					}

					// fix Apache issue where small chunks are not sent correctly over HTTP 1.1
					// sometimes Apache server join some outputs into a message (merge).
					// this code helps but is not the full solution.
					// And is possible to change the Apache vhosts as:
					// 		ProxyPass fcgi://127.0.0.1:9000/dedalo/ enablereuse=on flushpackets=on max=10
					// to prevent this behavior, but the problem doesn't disappear completely.
					// With h2 protocol and SSL the problem disappear, but is necessary to be compatibles with http 1.1
					// if(DEDALO_PROTOCOL === 'http://'){
					if ($_SERVER['SERVER_PROTOCOL']==='HTTP/1.1') {
						$len = strlen($a);
						if ($len < 4096) {
							// re-create the output object and the final string
							$fill_length = 4096 - $len;
							$output->fill_buffer = $fill_length . str_pad(' ', $fill_length);
							$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
						}
					}
					// format the message to be analyzed in client side.
					// client side doesn't use the eventManager(), the event is sent by fetch(),
					// so the format is not relevant instead in the HTTP 1.1 cases, than Apache can join or split the message in chunks
					echo 'data:';
					echo "\n";
					echo $a;
					echo "\n\n";

				// debug log. Message printed in PHP error log
					debug_log(__METHOD__
						. ' ' . $a . PHP_EOL
						, logger::DEBUG
					);

				// flush the output buffer and send echoed messages to the browser
					while (ob_get_level() > 0) {
						ob_end_flush();
					}
					flush();

				// stop on finish
					if ($is_running===false) {
						// delete database info about current process
						processes::delete_process_item(
							$pid,
							logged_user_id()
						);
						break;
					}

				// break the loop if the client aborted the connection (closed the page)
					if ( connection_aborted() ) break;

				// sleep n milliseconds before running the loop again
					$ms = $update_rate; usleep( $ms * 1000 );
			}//end while

		die();
	}//end get_process_status



	/**
	* GET_PROCESS_STATUS_POLL
	* One-shot polling version of get_process_status.
	* Reads the process file once and returns a standard JSON response object,
	* making it compatible with both PHP-FPM and RoadRunner worker contexts.
	*
	* Unlike the SSE version (get_process_status), this method does NOT use
	* streaming, die(), or blocking loops. The client calls this endpoint
	* repeatedly via setInterval to achieve the same monitoring effect as SSE,
	* with a 1 s interval equivalent to the default update_rate.
	*
	* The same authentication and ownership checks as the SSE variant are
	* applied: the caller must be logged in, and the process entry must belong
	* to the logged user (or the caller must be DEDALO_SUPERUSER). When the
	* process finishes (is_running === false) the database entry is cleaned up
	* via processes::delete_process_item before returning.
	*
	* @param object $rqo
	* {
	*   options: {
	*     pid:   int|string  System process ID
	*     pfile: string      Process output file name
	*   }
	* }
	* @return object $response
	* - result:     bool
	* - pid:        int|string
	* - pfile:      string
	* - is_running: bool
	* - data:       object  Decoded last line of process output { msg, counter, total, … }
	* - time:       string  Current server timestamp (Y-m-d H:i:s)
	* - errors:     array   Empty on success
	*/
	public static function get_process_status_poll(object $rqo) : object {

		// session unlock
			session_write_close();

		// response
			$response = new stdClass();
				$response->result		= false;
				$response->msg			= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors		= [];

		// only logged users can access process status
			if (login::is_logged()!==true) {
				$response->msg = 'Authentication error: please login';
				$response->errors[] = 'Not logged';
				return $response;
			}

		// options
			$pfile	= $rqo->options->pfile ?? null;
			$pid	= $rqo->options->pid ?? null;

		// mandatory vars
			if (empty($pfile) || empty($pid)) {
				$response->msg = 'Error: pfile and pid are mandatory';
				$response->errors[] = 'Missing pfile or pid';
				return $response;
			}

		// SEC: ownership check. Same as get_process_status (SSE variant).
			$logged_user_id	= logged_user_id();
			$is_superuser	= ((int)$logged_user_id === DEDALO_SUPERUSER);
			$entry			= processes::get_process_item((int)$pid, (string)$pfile);
			if ($entry === null || (!$is_superuser && (int)($entry->user_id ?? 0) !== (int)$logged_user_id)) {
				debug_log(__METHOD__
					. ' Denied process status poll: process not owned by logged user' . PHP_EOL
					. ' pid: ' . to_string($pid) . PHP_EOL
					. ' logged_user_id: ' . to_string($logged_user_id)
					, logger::ERROR
				);
				$response->msg		= 'Authentication error: process not owned by current user';
				$response->errors[]	= 'process not owned by current user';
				return $response;
			}

		// process
			$process = new process();
				$process->setPid($pid);
				$process->setFile(process::get_process_path() .'/'. $pfile);

		// read process info (one shot)
			$is_running	= $process->status(); // bool
			$array_data	= $process->read(); // array

			// decode last line
			$value = isset($array_data[0])
				? (json_decode($array_data[0]) ?? $array_data[0])
				: '';

			$data = is_object($value)
				? $value
				: (object)['msg' => $value];

		// clean up finished process
			if ($is_running===false) {
				processes::delete_process_item(
					$pid,
					logged_user_id()
				);
			}

		// response
			$response->result		= true;
			$response->pid			= $pid;
			$response->pfile		= $pfile;
			$response->is_running	= $is_running;
			$response->data			= $data;
			$response->time			= date("Y-m-d H:i:s");
			$response->errors		= [];


		return $response;
	}//end get_process_status_poll



	/**
	* GET_PROCESS_STATUS_STREAM
	* RoadRunner-compatible generator version of get_process_status.
	*
	* Produces the same SSE event stream as get_process_status but uses PHP
	* generator syntax (yield) instead of echo + die(), so the RoadRunner
	* worker can forward yielded chunks frame-by-frame via
	* HttpWorker::respondStream() without blocking the worker slot.
	*
	* Key differences from the PHP-FPM SSE variant:
	*   - Never calls die() or echo; control returns to the caller between yields.
	*   - Includes a max-iteration guard (max_execution_time is ignored under the
	*     CLI SAPI used by RoadRunner; ~10-hour cap based on update_rate).
	*   - Catches \Spiral\RoadRunner\Http\Exception\StreamStoppedException so
	*     that a client disconnect triggers graceful cleanup instead of a fatal.
	*   - Skips the Apache HTTP/1.1 padding when DEDALO_RR_WORKER is defined
	*     because RoadRunner streams via its own binary framing protocol.
	*
	* Applies the same authentication and ownership checks as the FPM variant.
	*
	* This method is not listed in API_ACTIONS and is not called directly by
	* the router; it is invoked internally by get_process_status() when
	* DEDALO_RR_WORKER is defined.
	*
	* @param object $rqo
	* @return \Generator  Yields SSE-formatted strings "data:\n{json}\n\n"
	*/
	public static function get_process_status_stream(object $rqo) : \Generator {

		$start_time = start_time();

		// max_execution_time
			ini_set('max_execution_time', 36000); // seconds (3600 * 10) = 10 hours

		// session unlock
			session_write_close();

		// options
			$pfile	= $rqo->options->pfile;
			$pid	= $rqo->options->pid;

		// only logged users can access SSE events
			if(login::is_logged()!==true) {
				yield json_handler::encode((object)[
					'errors' => ['Authentication error: please login']
				]);
				return;
			}

		// SEC: ownership check
			if (!empty($pid) && !empty($pfile)) {
				$logged_user_id	= logged_user_id();
				$is_superuser	= ((int)$logged_user_id === DEDALO_SUPERUSER);
				$entry			= processes::get_process_item((int)$pid, (string)$pfile);
				if ($entry === null || (!$is_superuser && (int)($entry->user_id ?? 0) !== (int)$logged_user_id)) {
					debug_log(__METHOD__
						. ' Denied process status read: process not owned by logged user' . PHP_EOL
						. ' pid: ' . to_string($pid) . PHP_EOL
						. ' logged_user_id: ' . to_string($logged_user_id)
						, logger::ERROR
					);
					yield json_handler::encode((object)[
						'errors' => ['Authentication error: process not owned by current user']
					]);
					return;
				}
			}

		// header print as event stream
			header("Content-Type: text/event-stream");
			header("Cache-Control: no-cache, must-revalidate");
			header('Connection: keep-alive');
			header("Access-Control-Allow-Origin: *");
			header('X-Accel-Buffering: no');

		// mandatory vars
			if (empty($pfile) || empty($pid)) {
				$output = (object)[
					'pid'			=> $pid,
					'pfile'			=> $pfile,
					'is_running'	=> false,
					'data'			=> (object)[
						'msg' => 'Error: pfile and pid are mandatory'
					],
					'time'			=> date("Y-m-d H:i:s"),
					'errors'		=> ['Error: pfile and pid are mandatory']
				];
				yield json_handler::encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL . PHP_EOL;
				return;
			}

		// process
			$process = new process();
				$process->setPid($pid);
				$process->setFile(process::get_process_path() .'/'. $pfile);

		// event loop
			$update_rate = $rqo->update_rate ?? 1000;
			// Safety net: max_execution_time is ignored under CLI SAPI (RoadRunner).
			// Cap the loop to prevent a stuck process file from blocking a worker slot.
			$max_iterations = (int)(36000 / max(1, $update_rate / 1000)); // ~10h equivalent
			$iterations = 0;
			try {
				while (1) {

					// max-iteration guard
						if (++$iterations > $max_iterations) {
							debug_log(__METHOD__
								. ' Max iterations reached (' . $max_iterations . '). Breaking SSE loop.'
								. ' pid: ' . $pid . ' pfile: ' . $pfile
								, logger::WARNING
							);
							break;
						}

					// process info
						$is_running	= $process->status();
						$array_data	= $process->read();
						$value = isset($array_data[0])
							? (json_decode($array_data[0]) ?? $array_data[0])
							: '';

						$data = (!is_object($value))
							? (object)[ 'msg' => $value ]
							: $value;

					// output
						$output = (object)[
							'pid'			=> $pid,
							'pfile'			=> $pfile,
							'is_running'	=> $is_running,
							'data'			=> $data,
							'time'			=> date("Y-m-d H:i:s"),
							'total_time'	=> exec_time_unit_auto($start_time),
							'update_rate'	=> $update_rate,
							'errors'		=> []
						];

					// debug
						if(SHOW_DEBUG===true) {
							error_log('process loop: is_running: '.to_string($is_running) . ' - pid: ' .$pid. ' - pfile: ' .$pfile);
						}

					// encode
						$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
						if (!is_string($a)) {
							debug_log(__METHOD__
								. " Error. output value is no correctly JSON encoded ! " . PHP_EOL
								. to_string($a)
								, logger::ERROR
							);
							$a = to_string($a);
						}

						// Apache HTTP 1.1 buffer fix — only relevant for PHP-FPM behind Apache.
						// RR streams via its own binary protocol; padding just wastes bandwidth.
						if (!defined('DEDALO_RR_WORKER') && ($_SERVER['SERVER_PROTOCOL'] ?? 'HTTP/1.1')==='HTTP/1.1') {
							$len = strlen($a);
							if ($len < 4096) {
								$fill_length = 4096 - $len;
								$output->fill_buffer = $fill_length . str_pad(' ', $fill_length);
								$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
							}
						}

					// SSE format
						yield 'data:' . "\n" . $a . "\n\n";

					// debug log
						debug_log(__METHOD__
							. ' ' . $a . PHP_EOL
							, logger::DEBUG
						);

					// stop on finish
						if ($is_running===false) {
							processes::delete_process_item($pid, logged_user_id());
							break;
						}

					// sleep before next iteration
						$ms = $update_rate;
						usleep($ms * 1000);
				}//end while
			} catch (\Spiral\RoadRunner\Http\Exception\StreamStoppedException $e) {
				// Client disconnected; RoadRunner throws this into the generator.
				// Clean up gracefully so the process entry is removed.
				debug_log(__METHOD__
					. ' Client disconnected (StreamStoppedException)'
					. ' pid: ' . $pid . ' pfile: ' . $pfile
					, logger::DEBUG
				);
			}

		return;
	}//end get_process_status_stream



	/**
	* STOP_PROCESS
	* Sends a termination signal to a running background process.
	*
	* Delegates to processes::stop(), passing the integer PID and the user ID.
	* If $rqo->options->user_id is omitted the currently logged-in user's ID is
	* used, which is the normal case; the field exists to allow superuser tools
	* to stop processes on behalf of other users.
	*
	* When pid is null the method returns immediately with result = false, because
	* a null PID has no associated system process and kill(null) would be unsafe.
	*
	* @param object $rqo
	* {
	*	options: {
	*		pid:     int|null     System process ID to stop
	*		user_id: int|null     (optional) Override user ID; defaults to logged user
	*	}
	* }
	* @return object $response  Forwarded from processes::stop(); always has result and msg
	*/
	public static function stop_process(object $rqo) : object {

		// session unlock
			session_write_close();

		// options
			$pid		= $rqo->options->pid ?? null;
			$user_id	= $rqo->options->user_id ?? logged_user_id();

		// validate pid
			if ($pid === null) {
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Invalid PID: process does not have an associated system process';
				$response->errors = ['invalid pid: null'];
				return $response;
			}

		$response = processes::stop((int)$pid, $user_id);


		return $response;
	}//end stop_process



	// Open methods ///////////////////////////////////



	/**
	* GET_SERVER_READY_STATUS
	* Returns whether this Dédalo instance is configured to act as a specific
	* type of distribution server.
	*
	* Called by remote clients (other Dédalo instances) before attempting an
	* update to verify that the target server is ready to serve content:
	*   - 'ontology_server': checks IS_AN_ONTOLOGY_SERVER === true.
	*   - 'code_server':     checks IS_A_CODE_SERVER === true.
	*
	* If the relevant constant is not defined or is false, the method returns
	* result = false with a generic error message. This endpoint is intentionally
	* minimal and does not require authentication, so that remote Dédalo instances
	* can probe availability before opening an authenticated session.
	*
	* @param object $rqo
	* {
	*	options: {
	*		check: string  'ontology_server' | 'code_server'
	*	}
	* }
	* @return object $response
	* - result: bool    true when the requested server type is active
	* - msg:    string  Descriptive status or error text
	* - errors: array   Empty on success
	*/
	public static function get_server_ready_status( object $rqo ) : object {

		// session unlock
			session_write_close();

		// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. This is not an accessible Server';
			$response->errors	= [];

		//options
			$check = $rqo->options->check ?? null;


			switch ($check) {
				case 'ontology_server':
					// check constants
					// Ontology servers has a constant that able to use the server as ontology master.
						if ( defined('IS_AN_ONTOLOGY_SERVER') &&  IS_AN_ONTOLOGY_SERVER === true ) {
							$response->result	= true;
							$response->msg		= 'OK. Ontology server is ready';
							return $response;
						}
					break;

				case 'code_server':
					// check constants
					// Ontology servers has a constant that able to use the server as ontology master.
						if ( defined('IS_A_CODE_SERVER') &&  IS_A_CODE_SERVER === true ) {
							$response->result	= true;
							$response->msg		= 'OK. Code server is ready';
							return $response;
						}
					break;


			}

		return $response;
	}//end get_server_ready_status



	/**
	* GET_ONTOLOGY_UPDATE_INFO
	* Returns metadata about ontology files this server can distribute to the
	* requesting Dédalo client.
	*
	* This endpoint is called by remote Dédalo instances (clients) that want to
	* update their local ontology from a trusted ontology server. The server must
	* have IS_AN_ONTOLOGY_SERVER === true and ONTOLOGY_DATA_IO_URL defined.
	*
	* Authorization is code-based (no user session required):
	*   - The client sends a shared secret in $options->code.
	*   - The server validates it against ONTOLOGY_SERVER_CODE (preferred) or
	*     against the codes in ONTOLOGY_SERVERS array (fallback).
	*   - An invalid or missing code returns result = false immediately.
	*
	* Version validation:
	*   - The client sends its own DEDALO_VERSION as $options->version (e.g. '7.3.1').
	*   - The first two segments are validated as numeric. Non-numeric segments
	*     return an error response.
	*   - The parsed $ar_version is forwarded to ontology_data_io::get_ontology_update_info,
	*     which uses it to filter ontology files compatible with the caller's version.
	*
	* @param object $rqo
	* {
	*	options: {
	*		version : string  Client's DEDALO_VERSION, e.g. '7.3.1'
	*		code    : string  Shared secret authorizing access to this server's ontology
	*	}
	* }
	* @return object $response  Forwarded from ontology_data_io::get_ontology_update_info
	*/
	public static function get_ontology_update_info( object $rqo ) : object {

		// session unlock
			session_write_close();

		// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check if the server is ontology server, if not stop the process
		// Only ontology servers can provide his ontology files.
			if ( !defined('IS_AN_ONTOLOGY_SERVER') ||  IS_AN_ONTOLOGY_SERVER === false ) {
				$response->result	= false;
				$response->msg		= 'Error. Server is not an ontology server';
				return $response;
			}

		// RQO options
		// client will send his version and the code that able to get the ontology information
			$options = $rqo->options;

		// check configuration of the ontology constants
			if ( !defined('ONTOLOGY_DATA_IO_URL') ) {
				$response->msg		= 'Error. Dédalo is miss configured. Define ONTOLOGY_DATA_IO_URL as sample.config.php defines';
				$response->errors[]	= 'Error. Bad ONTOLOGY_DATA_IO_URL';
				return $response;
			}

		// Version
		// client needs to provide his own version of Dédalo
		// only compatible ontology files with the caller version will be provided
		// if the client doesn't send a valid version will be refuse the call.
			$string_version	= $options->version;
			$ar_version 	= explode( '.', $string_version );

			foreach($ar_version as $key => $version_number){
				if($key > 1){
					break;
				}
				$check = is_numeric( $version_number );
				if (!$check) {
					$response->msg		= 'Error. Invalid version number';
					$response->errors[]	= 'Invalid version number';
					return $response;
				}
			}

		// code
		// client needs to provide a valid code.
		// valid code is defined in config.php constant of ONTOLOGY_SERVERS
			$code = $options->code;

			// validate code comparing with config definitions
			if (defined('ONTOLOGY_SERVER_CODE')) {

				// first try from ONTOLOGY_SERVER_CODE

				$valid_code = ONTOLOGY_SERVER_CODE;

			}else{

				// second try from defined ONTOLOGY_SERVERS

				$ontology_servers = defined('ONTOLOGY_SERVERS') && !empty(ONTOLOGY_SERVERS)
					? ONTOLOGY_SERVERS
					: [];

				$valid_code = false;
				foreach ( $ontology_servers as $current_server_info ) {
					if( $current_server_info['code'] === $code ){
						$valid_code = true;
						break;
					}
				}
			}

			if( $valid_code === false ){
				$response->msg		= 'Error. Invalid code';
				$response->errors[]	= 'Invalid code';
				return $response;
			}

		// Client made a valid request.
		// get the information to be provided to client
			$response = ontology_data_io::get_ontology_update_info( $ar_version );


		return $response;
	}//end get_ontology_update_info




	/**
	* GET_CODE_UPDATE_INFO
	* Returns metadata about Dédalo code update packages this server can
	* distribute to the requesting Dédalo client.
	*
	* Mirrors get_ontology_update_info but for code (PHP/JS) updates rather
	* than ontology data. The server must have IS_A_CODE_SERVER === true and
	* DEDALO_CODE_FILES_DIR defined.
	*
	* Authorization is code-based via CODE_SERVERS array (no ONTOLOGY_SERVER_CODE
	* fallback — only the array-based lookup is used here).
	*
	* Version validation:
	*   - Three segments (major.minor.patch) are validated as numeric.
	*   - Segments beyond index 2 are ignored (break at key > 2).
	*   - Parsed integer segments are assembled into $client_version[0..2] and
	*     forwarded to update_code::get_code_update_info.
	*
	* (!) The end-of-function comment label reads 'get_ontology_update_info' —
	*     that is a copy-paste error in the original source; this method is
	*     get_code_update_info.
	*
	* @param object $rqo
	* {
	*	options: {
	*		version : string  Client's DEDALO_VERSION, e.g. '7.3.1'
	*		code    : string  Shared secret authorizing access to this server's code packages
	*	}
	* }
	* @return object $response  Forwarded from update_code::get_code_update_info
	*/
	public static function get_code_update_info( object $rqo ) : object {

		// session unlock
			session_write_close();

		// response
		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check if the server is ontology server, if not stop the process
		// Only ontology servers can provide his ontology files.
			if ( !defined('IS_A_CODE_SERVER') ||  IS_A_CODE_SERVER === false ) {
				$response->result	= false;
				$response->msg		= 'Error. Server is not an code server';
				return $response;
			}

		// include the widget class
			$widget_class_file = DEDALO_CORE_PATH . '/area_maintenance/widgets/update_code/class.update_code.php';
			if( !include_once $widget_class_file ) {
				$response->errors[] = 'Widget class file is unavailable';
				return $response;
			}

		// RQO options
		// client will send his version and the code that able to get the ontology information
			$options = $rqo->options;

		// check configuration of the ontology constants
			if ( !defined('DEDALO_CODE_FILES_DIR') ) {
				$response->msg		= 'Error. Dédalo is miss configured. Define DEDALO_CODE_FILES_DIR as sample.config.php defines';
				$response->errors[]	= 'Error. Bad DEDALO_CODE_FILES_DIR';
				return $response;
			}

		// Version
		// client needs to provide his own version of Dédalo
		// only compatible code files with the caller version will be provided
		// if the client doesn't send a valid version will be refuse the call.
			$string_version	= $options->version;
			$ar_version 	= explode( '.', $string_version );

			foreach($ar_version as $key => $version_number){
				if($key > 2){
					break;
				}
				$check = is_numeric( $version_number );
				if (!$check) {
					$response->msg		= 'Error. Invalid version number';
					$response->errors[]	= 'Invalid version number';
					return $response;
				}
			}

		// code
		// client needs to provide a valid code.
		// valid code is defined in config.php constant of CODE_SERVERS
			$code = $options->code;

			$code_servers = defined('CODE_SERVERS') && !empty(CODE_SERVERS)
				? CODE_SERVERS
				: [];

			$valid_code = false;
			foreach ( $code_servers as $current_server_info ) {
				if( $current_server_info['code'] === $code ){
					$valid_code = true;
					break;
				}
			}

			if( $valid_code === false ){
				$response->msg		= 'Error. Invalid code';
				$response->errors[]	= 'Invalid code';
				return $response;
			}

			$client_version = [];
				$client_version[0] = (int)$ar_version[0];
				$client_version[1] = (int)$ar_version[1];
				$client_version[2] = (int)$ar_version[2];

		// Client made a valid request.
		// get the information to be provided to client
			$response = update_code::get_code_update_info( $client_version );


		return $response;
	}//end get_ontology_update_info




	// private methods ///////////////////////////////////



	/**
	* ERROR_NUMBER_TO_TEXT
	* Converts a PHP upload error code (UPLOAD_ERR_* constant value) to a
	* localized human-readable string via the label system.
	*
	* Returns an empty string for unknown error codes. Code 0 (UPLOAD_ERR_OK)
	* returns a "file uploaded successfully" label. Codes 1–8 map to specific
	* i18n label keys.
	*
	* @param int $f_error_number  PHP upload error code (0–8)
	* @return string $f_error_text  Localized description; empty string for unknown codes
	*/
	private static function error_number_to_text(int $f_error_number) : string {

		$f_error_text = '';

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
	* FILE_UPLOAD_MAX_SIZE
	* Returns the effective maximum upload file size in bytes, computed from the
	* PHP ini settings post_max_size and upload_max_filesize.
	*
	* The effective limit is the smaller of the two values (because PHP enforces
	* both). A value of 0 for either means "no limit" and is treated as infinity
	* for comparison purposes. The result is cached in a static variable so the
	* ini lookups are only performed once per request.
	*
	* @return int  Maximum upload size in bytes; -1 when no limit is configured
	*/
	private static function file_upload_max_size() : int {

		static $max_size = -1;

		if ($max_size < 0) {
			// Start with post_max_size.
			$post_max_size = self::parse_size(ini_get('post_max_size') ?: '0');
			if ($post_max_size > 0) {
				$max_size = $post_max_size;
			}

			// If upload_max_size is less, then reduce. Except if upload_max_size is
			// zero, which indicates no limit.
			$upload_max = self::parse_size(ini_get('upload_max_filesize') ?: '0');
			if ($upload_max > 0 && $upload_max < $max_size) {
				$max_size = $upload_max;
			}
		}

		return $max_size;
	}//end file_upload_max_size



	/**
	* PARSE_SIZE
	* Converts a PHP ini size string (e.g. '8M', '512K', '2G') to bytes.
	*
	* The unit suffix is matched case-insensitively against the ordered string
	* 'bkmgtpezy'; its position in that string is the power of 1024 to apply.
	* When no unit suffix is present, the value is returned as-is (rounded to
	* the nearest integer). Used exclusively by file_upload_max_size().
	*
	* @param string $size  PHP ini size string, e.g. '8M', '2G', '512'
	* @return int          Size in bytes
	*/
	private static function parse_size(string $size) : int {

		$unit = preg_replace('/[^bkmgtpezy]/i', '', $size); // Remove the non-unit characters from the size.
		$size = preg_replace('/[^0-9\.]/', '', $size); // Remove the non-numeric characters from the size.
		if ($unit) {
			// Find the position of the unit in the ordered string which is the power of magnitude to multiply a kilobyte by.
			return (int)round(floatval($size) * pow(1024, stripos('bkmgtpezy', $unit[0])));
		}

		return (int)round(floatval($size));
	}//end parse_size



	/**
	* GET_KNOWN_MIME_TYPES
	* Returns the upload allowlist: an array of MIME-type/extension pairs that
	* Dédalo accepts as uploaded files.
	*
	* Each entry is an associative array:
	*   ['mime' => string, 'extension' => string[]]
	*
	* The upload() method uses this list for a three-stage check:
	*   1. Is the finfo-detected MIME type in the list?
	*   2. Is the extension in any list entry?
	*   3. Do the detected MIME and the extension belong to the SAME entry?
	*
	* Notable omissions (intentional security decisions):
	*   - text/html (.html, .htm): stored-XSS vector (MEDIA-01).
	*   - application/javascript (.js): script injection.
	*   - application/x-shockwave-flash (.swf): Flash-based XSS.
	*   - application/x-msdownload (.exe, .msi): executable upload prevention.
	*
	* Notable inclusions with serving-layer requirements:
	*   - application/xml, image/svg+xml: legitimate import/component use, but
	*     must be served with Content-Disposition: attachment or a strict CSP to
	*     prevent inline-rendering attacks.
	*
	* @return array<int, array{mime: string, extension: string[]}>
	*/
	private static function get_known_mime_types() : array {

		$mime_types = array(
			[
				'mime'		=> 'text/plain',
				'extension'	=> ['txt','glsl','csv']
			],
			// MEDIA-01: text/html (html/htm) removed from the generic upload allowlist —
			// an uploaded HTML file served same-origin from the media tree is a stored-XSS
			// vector and has no legitimate media use (cf. the javascript/flash removals).
			// NOTE: application/xml and image/svg+xml below are kept (MARCXML/.dae/RDF
			// imports, and component_svg respectively) — their inline-rendering risk must
			// be mitigated at the serving layer (Content-Disposition: attachment / CSP),
			// not by dropping them here.
			[
				'mime'		=> 'text/css',
				'extension'	=> ['css']
			],
			[
				'mime'		=> 'text/csv',
				'extension'	=> ['csv']
			],
			// application/javascript removed: prevents script injection via uploaded .js files
			[
				'mime'		=> 'application/json',
				'extension'	=> ['json']
			],
			[
				'mime'		=> 'application/xml',
				'extension'	=> ['xml']
			],
			// application/x-shockwave-flash removed: prevents Flash-based XSS via uploaded .swf files
			[
				'mime'		=> 'video/x-flv',
				'extension'	=> ['flv']
			],
			[
				'mime'		=> 'video/x-flv',
				'extension'	=> ['flv']
			],
			// images
			[
				'mime'		=> 'image/png',
				'extension'	=> ['png']
			],
			[
				'mime'		=> 'image/jpeg',
				'extension'	=> ['jpe','jpeg','jpg']
			],
			[
				'mime'		=> 'image/gif',
				'extension'	=> ['gif']
			],
			[
				'mime'		=> 'image/bmp',
				'extension'	=> ['bmp']
			],
			[
				'mime'		=> 'image/vnd.microsoft.icon',
				'extension'	=> ['ico']
			],
			[
				'mime'		=> 'image/tiff',
				'extension'	=> ['tiff','tif']
			],
			[
				'mime'		=> 'image/svg+xml',
				'extension'	=> ['svg','svgz']
			],
			[
				'mime'		=> 'image/heic',
				'extension'	=> ['heic']
			],
			[
				'mime'		=> 'image/avif',
				'extension'	=> ['avif']
			],
			[
				'mime'		=> 'image/webp',
				'extension'	=> ['webp']
			],
			// archives
			[
				'mime'		=> 'application/zip',
				'extension'	=> ['zip']
			],
			[
				'mime'		=> 'application/x-rar-compressed',
				'extension'	=> ['rar']
			],
			[
				'mime'		=> 'application/octet-stream',
				'extension'	=> ['blob','fbx','obj','glb']
			],
			// application/x-msdownload removed: prevents executable uploads (.exe, .msi)
			[
				'mime'		=> 'application/vnd.ms-cab-compressed',
				'extension'	=> ['cab']
			],
			[
				'mime'		=> 'application/marc',
				'extension'	=> ['mrc']
			],
			// audio/video
			[
				'mime'		=> 'audio/mpeg',
				'extension'	=> ['mp3']
			],
			[
				'mime'		=> 'video/mp4',
				'extension'	=> ['mp4','mp4v','mpg4']
			],
			[
				'mime'		=> 'video/quicktime',
				'extension'	=> ['qt','mov']
			],
			[
				'mime'		=> 'video/mpeg',
				'extension'	=> ['m2v','mpa','mpe','mpeg','mpg']
			],
			[
				'mime'		=> 'video/x-m4v',
				'extension'	=> ['m4v']
			],
			[
				'mime'		=> 'video/ogg',
				'extension'	=> ['ogv']
			],
			[
				'mime'		=> 'video/x-matroska',
				'extension'	=> ['mkv']
			],
			[
				'mime'		=> 'video/x-msvideo',
				'extension'	=> ['avi']
			],
			[
				'mime'		=> 'video/jpeg',
				'extension'	=> ['jpgv']
			],
			[
				'mime'		=> 'video/webm',
				'extension'	=> ['webm']
			],
			[
				'mime'		=> 'audio/x-wav',
				'extension'	=> ['wav']
			],
			// 3d @see https://github.com/KhronosGroup/glTF/blob/main/specification/1.0/README.md#mimetypes
			[
				'mime'		=> 'model/gltf-binary',
				'extension'	=> ['glb']
			],
			[
				'mime'		=> 'model/gltf+json',
				'extension'	=> ['gltf']
			],
			[
				'mime'		=> 'model/vnd.collada+xml',
				'extension'	=> ['dae']
			],
			// adobe
			[
				'mime'		=> 'application/pdf',
				'extension'	=> ['pdf']
			],
			[
				'mime'		=> 'image/vnd.adobe.photoshop',
				'extension'	=> ['psd']
			],
			[
				'mime'		=> 'application/postscript',
				'extension'	=> ['ai','eps','ps']
			],
			// ms office
			[
				'mime'		=> 'application/msword',
				'extension'	=> ['doc']
			],
			[
				'mime'		=> 'application/rtf',
				'extension'	=> ['rtf']
			],
			[
				'mime'		=> 'application/vnd.ms-excel',
				'extension'	=> ['xls']
			],
			[
				'mime'		=> 'application/vnd.ms-powerpoint',
				'extension'	=> ['ppt']
			],
			[
				'mime'		=> 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
				'extension'	=> ['pptx']
			],
			// open office
			[
				'mime'		=> 'application/vnd.oasis.opendocument.text',
				'extension'	=> ['odt']
			],
			[
				'mime'		=> 'application/vnd.oasis.opendocument.spreadsheet',
				'extension'	=> ['ods']
			],
			[
				'mime'		=> 'application/pages',
				'extension'	=> ['pages']
			],
			[
				'mime'		=> 'application/vnd.apple.keynote',
				'extension'	=> ['key']
			],
			[
				'mime'		=> 'application/vnd.apple.numbers',
				'extension'	=> ['numbers']
			],
			// geojson
			[
				'mime'		=> 'application/geo+json',
				'extension'	=> ['geojson']
			],
			[
				'mime'		=> 'application/vnd.google-earth.kml+xml',
				'extension'	=> ['kml']
			],
			[
				'mime'		=> 'application/vnd.google-earth.kmz',
				'extension'	=> ['kmz']
			]
		);


		return $mime_types;
	}//end get_known_mime_types



	/**
	* CREATE_THUMBNAIL
	* Generates a JPEG thumbnail for an uploaded file and places it in the
	* <tmp_dir>/thumbnail/ subdirectory. Returns the public URL of the thumbnail.
	*
	* Dispatches to the appropriate conversion utility based on the finfo-detected
	* MIME type of the source file:
	*   - application/pdf  → ImageMagick::convert at 72 dpi, 12.5% resize, q50
	*   - image/*          → ImageMagick::convert with thumbnail=true
	*   - video/*          → Ffmpeg::create_posterframe at timecode 10s
	*   - all others       → returns null (no thumbnail produced)
	*
	* Called from both upload() (non-chunked uploads) and
	* join_chunked_files_uploaded() (after all chunks are assembled). The
	* returned URL is served from DEDALO_UPLOAD_TMP_URL under the user's
	* staging directory, so it is only accessible while the file remains staged.
	*
	* @see dd_utils_api::upload
	* @see dd_utils_api::join_chunked_files_uploaded
	* @param object $options
	* - tmp_dir:     string  Absolute path of the user's staging directory
	* - name:        string  File name within tmp_dir (source file basename)
	* - target_path: string  Absolute path of the source file
	* - key_dir:     string  Upload category identifier used to build the URL
	* - user_id:     int     Current logged-in user ID used to build the URL
	* @return string|null  Public URL of the generated thumbnail, or null on failure/unsupported type
	*/
	private static function create_thumbnail(object $options) : ?string {

		// options
			$tmp_dir		= $options->tmp_dir;
			$name			= $options->name;
			$target_path	= $options->target_path;
			$key_dir		= $options->key_dir;
			$user_id		= $options->user_id;

		// thumbnail_file
			$pathinfo		= pathinfo($name);
			$filename		= $pathinfo['filename'];
			$thumbnail_file	= $tmp_dir . '/thumbnail/' . $filename . '.jpg';

		// convert based on mime type
			$finfo = new finfo(FILEINFO_MIME_TYPE);
			$mime = $finfo->file($target_path);

			switch (true) {

				case ($mime==='application/pdf'):
					ImageMagick::convert((object)[
						'source_file'	=> $target_path,
						'ar_layers'		=> [0],
						'target_file'	=> $thumbnail_file,
						'density'		=> 72,
						'antialias'		=> true,
						'quality'		=> 50,
						'resize'		=> '12.5%'
					]);
					break;

				case (strpos($mime, 'image/')===0):
					ImageMagick::convert((object)[
						'source_file'	=> $target_path,
						'target_file'	=> $thumbnail_file,
						'thumbnail'		=> true
					]);
					break;

				case (strpos($mime, 'video/')===0):
					Ffmpeg::create_posterframe((object)[
						'timecode'				=> '10', // like '10'
						'src_file'				=> $target_path,
						'quality'				=> 'thumbnail',
						'posterframe_filepath'	=> $thumbnail_file
					]);
					break;

				default:
					// Nothing to do with videos
					return null;
			}

		// temp thumb file URL
		$thumbnail_url = DEDALO_UPLOAD_TMP_URL .'/'. $user_id .'/'. $key_dir .'/thumbnail/'. $filename . '.jpg';


		return $thumbnail_url;
	}//end create_thumbnail



}//end dd_utils_api
