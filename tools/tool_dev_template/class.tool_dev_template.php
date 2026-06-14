<?php declare(strict_types=1);
/**
* CLASS TOOL_DEV_TEMPLATE
*
* Production-shaped starting point for new Dédalo tools.
* Copy this directory, rename every 'tool_dev_template' occurrence to your
* tool name (directory, class file, class name, JS files, CSS, register.json)
* — or run the scaffolder, which does it for you:
*
*   php tools/tool_common/cli/create_tool.php --name=tool_myorg_mytool --label="My tool"
*
* Documentation: docs/development/tools/ (creating_tools, server_contract,
* js_lifecycle, register_json, security).
*
* CONTRACT
* - The class extends tool_common and is named exactly like its directory.
* - Every remotely callable method is public static, takes a single
*   `object $options` parameter and returns an object {result, msg, errors}.
* - Every remotely callable method MUST be listed in API_ACTIONS (SEC-024).
*   Use the map form to declare the permission gate the framework enforces
*   BEFORE your method runs (see tool_security class docs).
* - Methods listed in BACKGROUND_RUNNABLE may also be executed by the CLI
*   background runner (process_runner.php) when the client passes
*   `background: true` to tool_request. The CLI path does NOT go through
*   dd_tools_api, so keep imperative gates inside long-running write methods
*   as defense in depth.
*
* Note: this template is only registered when the install defines
* SHOW_DEVELOPER=true (see tools_register::get_valid_tool_directories).
*/
class tool_dev_template extends tool_common {



	/**
	* SEC-024: allowlist of methods callable via dd_tools_api::tool_request,
	* in map form. The framework runs the declared gate before dispatch:
	*  - get_component_data : read (level 1) on (section_tipo, tipo|component_tipo)
	*  - handle_upload_file : write (level 2) on (section_tipo, tipo|component_tipo)
	*  - long_process_demo  : developer-only
	* Never list lifecycle hooks (is_available, on_register, on_remove) here.
	*/
	public const API_ACTIONS = [
		'get_component_data' => ['permission' => 'tipo', 'min_level' => 1],
		'handle_upload_file' => ['permission' => 'tipo', 'min_level' => 2],
		'long_process_demo'  => ['permission' => 'developer']
	];

	/**
	* Methods that the CLI background runner (process_runner.php) is allowed
	* to execute when called with `background: true`.
	*/
	public const BACKGROUND_RUNNABLE = [
		'long_process_demo'
	];



	/**
	* GET_COMPONENT_DATA
	* Sample READ action: loads a component instance and returns its data.
	* The framework already asserted read permission on
	* (options->section_tipo, options->component_tipo) before this runs.
	* @param object $options
	* {
	*    "component_tipo": "rsc85",
	*    "section_id": "1",
	*    "section_tipo": "rsc197",
	*    "config": null
	* }
	* @return object $response {result, msg, errors}
	*/
	public static function get_component_data(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$component_tipo	= $options->component_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;

		// SEC-024 layer 2 (per-record): the declarative 'tipo' gate checked the
		// schema permission; when the action targets one specific record we also
		// keep the caller inside their project scope. tool_security wraps the
		// core assert with options handling, used here imperatively.
			if (isset($options->section_id)) {
				security::assert_record_in_user_scope(
					$section_tipo,
					(int)$section_id,
					__METHOD__
				);
			}

		// optional tool config read. Per-key resolution:
		// install config (dd996) -> register default_config (dd1633) -> fallback
			// $my_setting = tool_common::get_config_value(get_called_class(), 'my_setting', 'default');

		// component data
			$model		= ontology_node::get_model_by_tipo($component_tipo, true);
			$component	= component_common::get_instance(
				$model, // string model
				$component_tipo, // string tipo
				$section_id, // string|int section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);
			$data = $component->get_data();

		// response
			$response->result	= (object)[
				'model'				=> $model,
				'component_tipo'	=> $component_tipo,
				'component_data'	=> $data
			];
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end get_component_data



	/**
	* HANDLE_UPLOAD_FILE
	* Sample WRITE action: receives the file_data produced by service_upload
	* and resolves the uploaded temporal file path with confinement checks.
	* A real tool would process/move the file from here.
	* @see https://dedalo.dev/docs/development/services/service_upload/
	* @param object $options
	* {
	*    "component_tipo": "hierarchy31",
	*    "section_id": "1",
	*    "section_tipo": "es1",
	*    "file_data": {
	*        "name": "myfile.zip",
	*        "key_dir": "component_geolocation",
	*        "tmp_name": "myfile.zip",
	*        ...
	*    }
	* }
	* @return object $response {result, msg, errors}
	*/
	public static function handle_upload_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$file_data = $options->file_data ?? null;
			if (!is_object($file_data) || empty($file_data->tmp_name) || empty($file_data->key_dir)) {
				$response->msg		= 'Error. Missing or invalid file_data';
				$response->errors[]	= 'invalid file_data';
				return $response;
			}

		// resolve the temporal upload path written by service_upload:
		// DEDALO_UPLOAD_TMP_DIR / {user_id} / {key_dir} / {tmp_name}
		// SEC: sanitize the caller-supplied path fragments and confine the
		// resolved path inside the upload tmp dir (no '../' escapes).
			$key_dir	= sanitize_key_dir((string)$file_data->key_dir);
			$tmp_name	= basename((string)$file_data->tmp_name);
			$tmp_file	= DEDALO_UPLOAD_TMP_DIR . '/' . logged_user_id() . '/' . $key_dir . '/' . $tmp_name;

			$upload_root	= realpath(DEDALO_UPLOAD_TMP_DIR);
			$real_file		= realpath($tmp_file);
			if ($upload_root===false || $real_file===false
				|| !str_starts_with($real_file, $upload_root . DIRECTORY_SEPARATOR)) {
				$response->msg		= 'Error. Uploaded file not found or outside the upload directory';
				$response->errors[]	= 'invalid upload path';
				debug_log(__METHOD__
					. ' Refused upload path.' . PHP_EOL
					. ' tmp_file: ' . $tmp_file
					, logger::ERROR
				);
				return $response;
			}

		// your tool's file processing goes here (move, parse, attach to a component...)

		// response
			$response->result	= (object)[
				'file'	=> $real_file,
				'size'	=> filesize($real_file)
			];
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end handle_upload_file



	/**
	* LONG_PROCESS_DEMO
	* Sample BACKGROUND action (developer-only): simulates a long process.
	* From the client, run it detached with:
	*   this.tool_request({ action: 'long_process_demo', options: {...}, background: true })
	* The HTTP response then returns immediately with the CLI pid; progress
	* goes to the debug log. Listed in BACKGROUND_RUNNABLE so the CLI runner
	* (process_runner.php) accepts it.
	* @param object $options
	* {
	*    "iterations": 5
	* }
	* @return object $response {result, msg, errors}
	*/
	public static function long_process_demo(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// SEC defense in depth: the declarative 'developer' gate covers the
		// dd_tools_api path; the CLI background path does not run it, so the
		// method gates itself too.
			if (security::is_developer(logged_user_id()) !== true) {
				$response->msg		= 'Error. Developer privileges required';
				$response->errors[]	= 'permissions_denied';
				return $response;
			}

		$iterations = min( (int)($options->iterations ?? 3), 10 );

		for ($i = 1; $i <= $iterations; $i++) {
			// a real tool would process a data chunk here
			sleep(1);
			debug_log(__METHOD__ . " long_process_demo iteration $i/$iterations", logger::DEBUG);
		}

		// response
			$response->result	= (object)['iterations_done' => $iterations];
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end long_process_demo



}//end class tool_dev_template
