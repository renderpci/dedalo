<?php declare(strict_types=1); // TEST NOT FINISHED !
/**
* DD_AREA_MAINTENANCE_API
* Manage API REST data flow of the area with Dédalo
* This class is a collection of area exposed methods to the API using
* a normalized RQO (Request Query Object)
* Note that only authorized users (Global Admins, Developer and root users)
* can access this methods (permissions checked in dd_manager)
*/
final class dd_area_maintenance_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Note: callers are still authorization-gated by area_maintenance access
	* checks in `dd_manager`. This list is the orthogonal "is the method even
	* dispatchable?" gate.
	*/
	public const API_ACTIONS = [
		'class_request',
		'widget_request',
		'get_widget_value',
		'lock_components_actions',
		'modify_counter',
		'get_simple_schema_changes_files',
		'parse_simple_schema_changes_files'
	];



	/**
	* CLASS_REQUEST
	* Fixed caller class NOT include into the RQO : area_maintenance
	* Call to class method given and return and object with the response
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	* @param object $rqo
	* sample:
		* {
		* 	action: "class_request"
		* 	dd_api: "dd_area_maintenance_api"
		* 	source: {
		* 		typo: "source",
		* 		action: "make_backup"
		* 	},
		* 	options: {
		*   	skip_backup_time_range: true
		*   }
		* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function class_request( object $rqo ) : object {

		// options
			$options			= $rqo->options ?? [];
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			$class_name		= 'area_maintenance';
			$class_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// check valid options
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

						$cli_options = new stdClass();
							$cli_options->class_name	= $class_name;
							$cli_options->method_name	= $class_method;
							$cli_options->class_file	= null; // already loaded by loader
							$cli_options->params		= $options;

						$fn_result = exec_::request_cli($cli_options);
						break;

					default:
						// direct case

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

			$response = $fn_result;


		return $response;
	}//end class_request



	/**
	* WIDGET_REQUEST
	* Call to class method given and return and object with the response
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	* @param object $rqo
	* sample:
		* {
		* 	action: "widget_request"
		* 	dd_api: "dd_area_maintenance_api"
		* 	source: {
		* 		typo: "source",
		* 		type : 'widget',
		* 		model : 'update_code'
		* 		action: "build_version_from_git_master"
		* 	},
		* 	options: {
		*   	skip_backup_time_range: true
		*   }
		* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function widget_request( object $rqo ) : object {

		// options
			$options			= $rqo->options ?? [];
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			$class_name		= sanitize_key_dir($source->model);
			$class_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// whitelist validation - get valid widget IDs from area_maintenance
			$area_maintenance		= area_common::get_instance('area_maintenance', DEDALO_AREA_MAINTENANCE_TIPO, 'list');
			$ar_widgets				= $area_maintenance->get_ar_widgets();
			$valid_widget_ids		= array_map(fn($widget) => $widget->id, $ar_widgets);
			if (!in_array($class_name, $valid_widget_ids)) {
				$response->errors[] = 'Invalid widget name: ' . $class_name;
				debug_log(__METHOD__ . ' Error: Widget not in whitelist: ' . $class_name, logger::ERROR);
				return $response;
			}

		// include the widget class
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

						$cli_options = new stdClass();
							$cli_options->class_name	= $class_name;
							$cli_options->method_name	= $class_method;
							$cli_options->class_file	= $widget_class_file;
							$cli_options->params		= $options;

						$fn_result = exec_::request_cli($cli_options);
						break;

					default:
						// direct case

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
	* Returns a widget value
	* It is used to update widget data dynamically
	* @param object $rqo
	* {
	* 	..
	* 	source : {
	* 		model: string
	* 	}
	* }
	* @return object $response
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
	* Get lock components active users info
	* @param object $rqo
	* {
	* 	action	: "lock_components_actions",
	*	dd_api	: 'dd_area_maintenance_api',
	* 	options : {
	* 		'fn_action' : get_active_users
	* 	}
	* }
	* @return object $response
	*/
	public static function lock_components_actions( object $rqo ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// options
			$fn_action	= $rqo->options->fn_action;
			$user_id	= $rqo->options->user_id ?? null;

		// switch fn_action
			switch ($fn_action) {
				case 'get_active_users':
					$response->result			= true;
					$response->ar_user_actions	= lock_components::get_active_users_full();
					break;

				case 'force_unlock_all_components':
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
	* MODIFY_COUNTER
	* @param object $rqo
	* @return object $response
	*/
	public static function modify_counter( object $rqo ) : object {

		session_write_close();

		// options
			$options = $rqo->options;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// short vars
			$section_tipo = $options->section_tipo;
			if (empty($section_tipo)) {
				$response->msg = 'Error: empty mandatory section_tipo';
				return $response;
			}
			$counter_action = $options->counter_action; // reset|fix

		// modify_counter
			$result = counter::modify_counter(
				$section_tipo,
				$counter_action
			);

		// check_counters
			$result_check_counters	= counter::check_counters();

		// response
			$response->result	= $result;
			$response->msg		= $result===true
				? 'OK. '.$counter_action.' counter successfully ' . $section_tipo
				: 'Error on '.$counter_action.' counter ' . $section_tipo;
			$response->datalist	= $result_check_counters->datalist ?? [];


		return $response;
	}//end modify_counter



	/**
	* GET_SIMPLE_SCHEMA_CHANGES_FILES
	* Used to call the hierarchy function by client
	* get the last list of files with the changes in ontology
	* @return object $response
	*/
	public static function get_simple_schema_changes_files() : object {

		$response = new stdClass();
			$response->result	= hierarchy::get_simple_schema_changes_files();
			$response->msg		= 'OK';

		return $response;
	}//end get_simple_schema_changes_files



	/**
	* PARSE_SIMPLE_SCHEMA_CHANGES_FILES
	* Used to call the hierarchy function by client in 'component_security_access'
	* get the parse data of specific file send by client in the rqo->options->filename
	* @see component_security_access.js request
	* @param object $rqo
	* @return object $response
	* response>result will be the array of changes/additions into the ontology since last update section by section.
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
