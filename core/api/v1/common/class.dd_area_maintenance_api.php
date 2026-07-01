<?php declare(strict_types=1); // TEST NOT FINISHED !
/**
* CLASS DD_AREA_MAINTENANCE_API
* API gateway for the system-maintenance area of Dédalo.
*
* This class is the thin REST adapter that sits between the HTTP request
* dispatcher (dd_manager) and the area_maintenance / widget business logic.
* Every public static method maps 1-to-1 to one of the names declared in
* API_ACTIONS; dd_manager routes calls here after verifying that the
* authenticated user holds Global Admin, Developer, or root privileges.
*
* Responsibilities:
* - Dispatch class-level maintenance actions to area_maintenance static methods
*   (class_request), optionally spawning a background CLI process for long-running jobs.
* - Dispatch widget-level actions to dynamically-loaded widget classes
*   (widget_request, get_widget_value) with two-layer security: widget-ID
*   allowlist + SEC-044/SEC-069 realpath confinement.
* - Surface component locking state (lock_components_actions).
* - Expose ontology-change-file listing and parsing for the security-access UI
*   (get_simple_schema_changes_files, parse_simple_schema_changes_files).
*
* Design note: all methods accept a single stdClass $rqo (Request Query Object)
* and return a stdClass {result, msg, errors?}. This mirrors the convention used
* in dd_tools_api and dd_core_api so that dd_manager can handle all API classes
* uniformly.
*
* @see area_maintenance::API_ACTIONS  — the allowlist on the business-logic side
* @see core/api/v1/common/class.dd_manager.php  — router / auth gate
* @see core/area_maintenance/class.area_maintenance.php  — underlying business logic
*
* @package Dédalo
* @subpackage API
*/
final class dd_area_maintenance_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Note: callers are still authorization-gated by area_maintenance access
	* checks in `dd_manager`. This list is the orthogonal "is the method even
	* dispatchable?" gate.
	*
	* Any public static method on this class that is NOT listed here is invisible
	* to remote callers, preventing accidental exposure of future helpers.
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'class_request',
		'widget_request',
		'get_widget_value',
		'lock_components_actions',
		'get_simple_schema_changes_files',
		'parse_simple_schema_changes_files'
	];



	/**
	* CLASS_REQUEST
	* Dispatches an RQO action to a static method on the area_maintenance class.
	*
	* The target class is always area_maintenance (it is not included in the RQO).
	* The target method is taken from $rqo->source->action and must:
	*   - Be declared public static on area_maintenance.
	*   - Be present in area_maintenance::API_ACTIONS when that constant exists
	*     (SEC-044 allowlist gate).
	*
	* When $rqo->options->background_running is true, the call is handed off to
	* exec_::request_cli() which spawns process_runner.php as a detached child
	* process. The response then contains {result, pid, pfile, msg} instead of
	* the method's own return value. For synchronous calls the method's return
	* value is passed through verbatim as $response.
	*
	* RQO shape:
	* {
	*   action: "class_request",
	*   dd_api: "dd_area_maintenance_api",
	*   source: {
	*     typo: "source",
	*     action: "make_backup"          // area_maintenance static method name
	*   },
	*   options: {
	*     skip_backup_time_range: true   // passed as the sole argument to the method
	*   }
	* }
	*
	* @param object $rqo - Request Query Object as described above
	* @return object - {result: mixed, msg: string, errors?: array}; on success, the
	*                  verbatim return value of the dispatched method (or the
	*                  exec_::request_cli result for background jobs)
	*/
	public static function class_request( object $rqo ) : object {

		// options
			// $options is passed as the sole argument to the target method,
			// so it must be an object; the default [] triggers the type-guard below.
			$options			= $rqo->options ?? [];
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			// The caller class is always area_maintenance; it is not in the RQO.
			$source			= $rqo->source;
			$class_name		= 'area_maintenance';
			$class_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// check valid options
			// Target methods expect an stdClass; reject arrays or scalars early
			// so call_user_func never receives a wrong-typed argument.
			if (!is_object($options)) {
				$response->msg = 'Error. invalid options ';
				$response->errors[] = 'Invalid options type';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' .to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// method (static)
			// Confirm the method exists before the API_ACTIONS gate so we get
			// a clear "method does not exist" message rather than a cryptic
			// allowlist-denial when the typo is in the RQO itself.
			if (!method_exists($class_name, $class_method)) {
				$response->msg = 'Error. class method \''.$class_method.'\' do not exists ';
				return $response;
			}

		// SEC-044: dispatch allowlist. When the target class declares
		// API_ACTIONS, the requested method MUST appear in it. Mirrors the
		// dd_manager / dd_tools_api gate (§9.1, §9.2) so an authenticated
		// area_maintenance user cannot invoke arbitrary public-static methods
		// (e.g. internal helpers like `get_file_constants`) that were never
		// designed as remote API actions. Back-compat: classes without
		// API_ACTIONS keep the legacy any-static behaviour.
			if (defined($class_name . '::API_ACTIONS')) {
				$allowed_actions = constant($class_name . '::API_ACTIONS');
				if (!in_array($class_method, $allowed_actions, true)) {
					$response->errors[] = 'method not in API_ACTIONS allowlist';
					$response->msg = 'Error. Method \''.$class_method.'\' is not in '.$class_name.'::API_ACTIONS';
					debug_log(__METHOD__
						. ' Denied class_request: method not in allowlist' . PHP_EOL
						. ' class_name: ' . $class_name . PHP_EOL
						. ' class_method: ' . $class_method
						, logger::ERROR
					);
					return $response;
				}
			}

			try {

				// background_running / direct cases
				switch (true) {
					case ($background_running===true):
						// Long-running maintenance tasks (e.g. make_backup, update_data_version)
						// are dispatched to a detached PHP-CLI child so that the HTTP response
						// is returned immediately. $cli_options->class_file is null here because
						// area_maintenance is already loaded by the autoloader; process_runner.php
						// will skip the require when the value is null.
						$cli_options = new stdClass();
							$cli_options->class_name	= $class_name;
							$cli_options->method_name	= $class_method;
							$cli_options->class_file	= null; // already loaded by loader
							$cli_options->params		= $options;

						$fn_result = exec_::request_cli($cli_options);
						break;

					default:
						// direct case
						// Synchronous path: invoke the static method in-process.
						// $fn_arguments is the options stdClass; methods must accept it as their
						// first (and only) argument per the area_maintenance convention.
						$fn_result = call_user_func(array($class_name, $class_method), $fn_arguments);
						break;
				}

			} catch (Exception $e) { // For PHP 5

				debug_log(__METHOD__
					." Exception caught [class_request] : ". $e->getMessage()
					, logger::ERROR
				);
				trigger_error($e->getMessage());


				$fn_result = new stdClass();
					$fn_result->result	= false;
					$fn_result->msg		= 'Error. Request failed on call_user_func method: '.$class_method;
					$response->errors[] = 'Invalid method ' . $class_method;
			}

			// Replace the stub $response with whatever the dispatched method returned.
			// (!) If the method returns null or a non-object, callers will receive null;
			// individual area_maintenance methods are responsible for returning the
			// correct {result, msg} shape.
			$response = $fn_result;


		return $response;
	}//end class_request



	/**
	* WIDGET_REQUEST
	* Dispatches an RQO action to a static method on a dynamically-loaded widget class.
	*
	* Unlike class_request (which always targets area_maintenance), here the target
	* class is derived from $rqo->source->model, which names one of the widget
	* sub-directories under core/area_maintenance/widgets/. Four security layers
	* are applied before any file is loaded or method called:
	*   1. sanitize_key_dir() normalises the model name to a safe directory key.
	*   2. Widget-ID allowlist: the model name must match an id returned by
	*      area_maintenance::get_ar_widgets() (same set the client UI enumerates).
	*   3. SEC-069 realpath confinement: the resolved file path must stay inside
	*      the widgets/ directory even if a constant or symlink was tampered with.
	*   4. SEC-044 API_ACTIONS gate: if the widget class declares API_ACTIONS, the
	*      requested method must be present in it.
	*
	* When $rqo->options->background_running is true, exec_::request_cli() spawns
	* process_runner.php (with $cli_options->class_file set to the widget file) so
	* the HTTP response is returned immediately.
	*
	* RQO shape:
	* {
	*   action: "widget_request",
	*   dd_api: "dd_area_maintenance_api",
	*   source: {
	*     typo:   "source",
	*     type:   "widget",
	*     model:  "update_code",                   // widget directory / class name
	*     action: "build_version_from_git_master"  // static method on the widget class
	*   },
	*   options: {
	*     skip_backup_time_range: true             // forwarded as the method's sole argument
	*   }
	* }
	*
	* @param object $rqo - Request Query Object as described above
	* @return object - {result: mixed, msg: string, errors?: array}
	*/
	public static function widget_request( object $rqo ) : object {

		// options
			// $options is forwarded verbatim as the sole argument to the widget method.
			// The array default [] triggers the type-guard below, which enforces object.
			$options			= $rqo->options ?? [];
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			// sanitize_key_dir strips path separators and non-identifier characters,
			// making the model name safe to interpolate into the filesystem path.
			$source			= $rqo->source;
			$class_name		= sanitize_key_dir($source->model);
			$class_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// whitelist validation - get valid widget IDs from area_maintenance
			// The authoritative widget list is the same enumeration the client UI
			// renders; any model name not in that list is rejected before we touch
			// the filesystem. This guards against sanitize_key_dir edge-cases and
			// any future widget directories that should not be remotely callable.
			// get_ar_widget_ids() returns just the IDs (kept in sync with
			// get_ar_widgets() by a drift test) so a polled widget_request does not
			// build every widget — which would probe diffusion connections, read
			// definition files and run DB sequence checks on each call.
			$area_maintenance		= area_common::get_instance('area_maintenance', DEDALO_AREA_MAINTENANCE_TIPO, 'list');
			$valid_widget_ids		= $area_maintenance->get_ar_widget_ids();
			if (!in_array($class_name, $valid_widget_ids)) {
				$response->errors[] = 'Invalid widget name: ' . $class_name;
				debug_log(__METHOD__ . ' Error: Widget not in whitelist: ' . $class_name, logger::ERROR);
				return $response;
			}

		// include the widget class
			// Path is composed from three sanitised/validated parts: the core path constant,
			// the literal '/area_maintenance/widgets/' segment, and the allowlisted class name.
			$widget_class_file = DEDALO_CORE_PATH . '/area_maintenance/widgets/' . $class_name . '/class.' . $class_name . '.php';
			if( !file_exists($widget_class_file) ) {
				$response->errors[] = 'Widget class file is unavailable';
				return $response;
			}
			// SEC-069: realpath confinement — defence-in-depth on top of the
			// `sanitize_key_dir` + widget-id whitelist above. Refuse to
			// `require` any file whose canonical path escapes the widgets
			// directory, even if the constants or symlinks have been
			// tampered with at the filesystem level.
			$widgets_root = realpath(DEDALO_CORE_PATH . '/area_maintenance/widgets');
			$real_widget  = realpath($widget_class_file);
			if ($widgets_root === false
				|| $real_widget === false
				|| !str_starts_with($real_widget, $widgets_root . DIRECTORY_SEPARATOR)
			) {
				$response->errors[] = 'Widget path confinement failed';
				debug_log(__METHOD__
					. ' SEC-069 widget path escapes widgets root.' . PHP_EOL
					. ' widgets_root: ' . to_string($widgets_root) . PHP_EOL
					. ' real_widget: ' . to_string($real_widget)
					, logger::ERROR
				);
				return $response;
			}
			require_once $widget_class_file;

		// check valid options
			// Widget methods expect an stdClass options object; an array default was
			// substituted above when $rqo->options was absent.
			if (!is_object($options)) {
				$response->msg = 'Error. invalid options ';
				$response->errors[] = 'Invalid options type';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' .to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// method (static)
			// Confirm the method exists on the now-loaded widget class before applying
			// the API_ACTIONS gate so that missing methods produce an informative error
			// rather than an allowlist-denial message.
			if (!method_exists($class_name, $class_method)) {
				$response->msg = 'Error. class method \''.$class_method.'\' do not exists ';
				return $response;
			}

		// SEC-044: same dispatch allowlist as class_request. Without it, a
		// user with maintenance-area write could invoke arbitrary public
		// static methods on the widget class (e.g. internal helpers,
		// lifecycle hooks). Back-compat: widgets without API_ACTIONS keep
		// the legacy any-static behaviour pending the per-widget rollout.
			if (defined($class_name . '::API_ACTIONS')) {
				$allowed_actions = constant($class_name . '::API_ACTIONS');
				if (!in_array($class_method, $allowed_actions, true)) {
					$response->errors[] = 'method not in API_ACTIONS allowlist';
					$response->msg = 'Error. Method \''.$class_method.'\' is not in '.$class_name.'::API_ACTIONS';
					debug_log(__METHOD__
						. ' Denied widget_request: method not in allowlist' . PHP_EOL
						. ' class_name: ' . $class_name . PHP_EOL
						. ' class_method: ' . $class_method
						, logger::ERROR
					);
					return $response;
				}
			}

			try {

				// background_running / direct cases
				switch (true) {
					case ($background_running===true):
						// Unlike class_request, the widget class file is NOT pre-loaded by the
						// autoloader; pass $widget_class_file so process_runner.php can require it.
						$cli_options = new stdClass();
							$cli_options->class_name	= $class_name;
							$cli_options->method_name	= $class_method;
							$cli_options->class_file	= $widget_class_file;
							$cli_options->params		= $options;

						$fn_result = exec_::request_cli($cli_options);
						break;

					default:
						// direct case
						// Synchronous: invoke the widget's static method in-process.
						$fn_result = call_user_func(array($class_name, $class_method), $fn_arguments);
						break;
				}

			} catch (Exception $e) { // For PHP 5

				debug_log(__METHOD__
					." Exception caught [widget_request] : ". $e->getMessage()
					, logger::ERROR
				);
				trigger_error($e->getMessage());


				$fn_result = new stdClass();
					$fn_result->result	= false;
					$fn_result->msg		= 'Error. Request failed on call_user_func method: '.$class_method;
					$response->errors[] = 'Invalid method ' . $class_method;
			}

			$response = $fn_result;


		return $response;
	}//end widget_request



	/**
	* GET_WIDGET_VALUE
	* Calls the static get_value() method on the named widget class to refresh
	* its display data without a full page reload.
	*
	* This is a lightweight polling endpoint: no options are forwarded to the widget;
	* get_value() is expected to be a read-only, no-argument probe that returns
	* current runtime state (e.g. the current codebase version, backup timestamp).
	*
	* Unlike widget_request this method always executes synchronously (no
	* background_running path). It shares the two-layer security model of
	* widget_request (SEC-050 bare-identifier regex + realpath confinement) but
	* does NOT consult the widget-ID allowlist from get_ar_widgets(); instead it
	* relies solely on the identifier-regex and realpath gates.
	*
	* RQO shape:
	* {
	*   ...,
	*   source: {
	*     model: string   // widget class/directory name
	*   }
	* }
	*
	* @param object $rqo - Request Query Object; only source.model is consumed
	* @return object - {result: mixed, msg: string, errors?: array}; result is
	*                  whatever the widget's get_value() method returns
	*/
	public static function get_widget_value( object $rqo ) : object {

		// source
			$source			= $rqo->source;
			// SEC-050: `$class_name` becomes both a filesystem segment
			// (widget directory + class filename) and the dynamic target of
			// `call_user_func`. Although dd_manager's API_ACTIONS gate blocks
			// unauthenticated calls, the string itself was interpolated raw.
			// Sanitise to a bare PHP identifier (same contract as every
			// other widget directory under `area_maintenance/widgets/`)
			// before use.
			$class_name		= sanitize_key_dir((string)($source->model ?? ''));
			$class_method	= 'get_value';

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// SEC-050: explicit bare-identifier regex even after sanitize_key_dir,
		// plus realpath confinement against the widgets root, so no symlink
		// or future sanitiser bug can drag the include outside the tree.
			if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/', $class_name)) {
				$response->errors[] = 'Invalid widget name';
				debug_log(__METHOD__
					. ' SEC-050 refused invalid widget identifier: ' . to_string($source->model ?? null)
					, logger::ERROR
				);
				return $response;
			}

		// include the widget class
			$widget_class_file = DEDALO_CORE_PATH . '/area_maintenance/widgets/' . $class_name . '/class.' . $class_name . '.php';
			$widgets_root = realpath(DEDALO_CORE_PATH . '/area_maintenance/widgets');
			$real_file    = realpath($widget_class_file);
			if ($widgets_root === false || $real_file === false
				|| strncmp($real_file, $widgets_root . DIRECTORY_SEPARATOR, strlen($widgets_root) + 1) !== 0) {
				$response->errors[] = 'Widget path confinement failed';
				debug_log(__METHOD__
					. ' SEC-050 widget file escapes widgets root. widget_class_file=' . to_string($widget_class_file)
					. ' real_file=' . to_string($real_file)
					, logger::ERROR
				);
				return $response;
			}
			if( !include_once $widget_class_file ) {
				$response->errors[] = 'Widget class file is unavailable';
				return $response;
			}

		// method (static)
			if (!method_exists($class_name, $class_method)) {
				$response->msg = 'Error. class method \''.$class_method.'\' do not exists ';
				$response->errors[] = 'Invalid method';
				return $response;
			}

			try {

				// exec 'get_value' method from widget
				// get_value() takes no arguments; it is a pure read probe.
				// The commented-out alternative is equivalent but relies on
				// variable variables, which phpcs flags; call_user_func is preferred.
				$fn_result = call_user_func([$class_name, $class_method]);
				// $fn_result = $class_name::$class_method();

			} catch (Exception $e) { // For PHP 5

				debug_log(__METHOD__
					." Exception caught [class_request] : ". $e->getMessage()
					, logger::ERROR
				);
				trigger_error($e->getMessage());

				$fn_result = new stdClass();
					$fn_result->result	= false;
					$fn_result->msg		= 'Error. Request failed on call method: '.$class_method;
					$response->errors[] = 'Invalid method ' . $class_method;
			}

			$response = $fn_result;


		return $response;
	}//end get_widget_value



	/**
	* LOCK_COMPONENTS_ACTIONS
	* Delegates component-locking operations to lock_components based on a sub-action key.
	*
	* Supported fn_action values:
	*   'get_active_users'           — Returns the full active-user lock map via
	*                                  lock_components::get_active_users_full(). Response
	*                                  gains an additional 'ar_user_actions' key.
	*   'force_unlock_all_components'— Releases all active component locks, optionally
	*                                  scoped to a single user when options.user_id is
	*                                  provided. Delegates to
	*                                  lock_components::force_unlock_all_components().
	*
	* Unknown fn_action values fall through the switch silently (result stays false).
	*
	* RQO shape:
	* {
	*   action:  "lock_components_actions",
	*   dd_api:  "dd_area_maintenance_api",
	*   options: {
	*     fn_action: string,        // 'get_active_users' | 'force_unlock_all_components'
	*     user_id?:  int|string     // optional: scope force-unlock to one user
	*   }
	* }
	*
	* @param object $rqo - Request Query Object as described above
	* @return object - {result: bool, msg: array|string, errors: array}; 'ar_user_actions'
	*                  is added for the 'get_active_users' sub-action
	*/
	public static function lock_components_actions( object $rqo ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// options
			$fn_action	= $rqo->options->fn_action;
			// user_id is optional; absent means "all users" for force-unlock.
			$user_id	= $rqo->options->user_id ?? null;

		// switch fn_action
			switch ($fn_action) {
				case 'get_active_users':
					$response->result			= true;
					// get_active_users_full() returns the full per-user lock map
					// (user metadata + component list); the lighter get_active_users()
					// returns only user IDs.
					$response->ar_user_actions	= lock_components::get_active_users_full();
					break;

				case 'force_unlock_all_components':
					// Cast to int only when user_id is non-empty to satisfy the
					// int|string|null union on force_unlock_all_components(); passing
					// the string "0" would cast to 0 and inadvertently scope the unlock.
					$user_id = !empty($user_id)
						? (int)$user_id
						: null;
					$response = lock_components::force_unlock_all_components($user_id);
					break;

				default:
					break;
			}


		return $response;
	}//end lock_components_actions






	/**
	* GET_SIMPLE_SCHEMA_CHANGES_FILES
	* Returns the list of available ontology-diff snapshot files for the client UI.
	*
	* Delegates to hierarchy::get_simple_schema_changes_files() which scans the
	* schema-changes directory and returns a sorted list of filenames. The client
	* (component_security_access.js) displays this list so an administrator can
	* select a specific diff file to inspect with parse_simple_schema_changes_files.
	*
	* This method takes no RQO; it is a read-only probe with no parameters.
	*
	* @return object - {result: array<string>, msg: 'OK'}; result is the filename list
	*                  from hierarchy::get_simple_schema_changes_files()
	*/
	public static function get_simple_schema_changes_files() : object {

		$response = new stdClass();
			$response->result	= hierarchy::get_simple_schema_changes_files();
			$response->msg		= 'OK';

		return $response;
	}//end get_simple_schema_changes_files



	/**
	* PARSE_SIMPLE_SCHEMA_CHANGES_FILES
	* Parses a specific ontology-diff snapshot file and returns its contents,
	* structured section by section, for the component_security_access UI.
	*
	* The client (component_security_access.js) first calls
	* get_simple_schema_changes_files to obtain the available file list, then
	* calls this method with the administrator-selected filename to inspect the
	* actual ontology additions/changes in that snapshot.
	*
	* Delegates to hierarchy::parse_simple_schema_changes_file($filename) which
	* reads and decodes the JSON diff file from the schema-changes directory.
	*
	* (!) $filename is taken directly from the RQO without sanitisation; hierarchy's
	* parser is responsible for confining file access to the schema-changes directory.
	*
	* @see component_security_access.js — client caller
	* @param object $rqo - {options: {filename: string}} where filename is a basename
	*                      from the list returned by get_simple_schema_changes_files()
	* @return object - {result: array, msg: 'OK'}; result is the parsed diff array
	*                  from hierarchy::parse_simple_schema_changes_file(), structured
	*                  as section-keyed changes/additions since the last ontology update
	*/
	public static function parse_simple_schema_changes_files( object $rqo ) : object {

		// options
			$options	= $rqo->options;
			$filename	= $options->filename;

		$changes = hierarchy::parse_simple_schema_changes_file($filename);

		$response = new stdClass();
			$response->result = $changes;
			$response->msg = 'OK';

		return $response;
	}//end parse_simple_schema_changes_files



}//end dd_area_maintenance_api
