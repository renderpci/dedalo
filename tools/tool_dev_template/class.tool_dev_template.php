<?php declare(strict_types=1);
/**
* CLASS TOOL_DEV_TEMPLATE
* Production-shaped scaffolding template for new Dédalo tools.
*
* Copy this directory and rename every 'tool_dev_template' occurrence to your
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
* Extends tool_common. Registered only when the install defines
* SHOW_DEVELOPER=true (see tools_register::get_valid_tool_directories).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_dev_template extends tool_common {



	/**
	* SEC-024 allowlist of methods callable via dd_tools_api::tool_request,
	* declared in map form so the framework can enforce the permission gate
	* automatically before dispatch. Each key is a method name; each value is a
	* gate descriptor consumed by tool_security:
	*  - get_component_data : 'tipo' gate, read (level 1) on (section_tipo, component_tipo)
	*  - handle_upload_file : 'tipo' gate, write (level 2) on (section_tipo, component_tipo)
	*  - long_process_demo  : 'developer' gate — only users with developer role may call it
	* (!) Never list lifecycle hooks (is_available, on_register, on_remove) here — they are
	* called internally by the framework and must not be exposed as API endpoints.
	* @var array<string, array<string, string|int>> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_component_data' => ['permission' => 'tipo', 'min_level' => 1],
		'handle_upload_file' => ['permission' => 'tipo', 'min_level' => 2],
		'long_process_demo'  => ['permission' => 'developer']
	];

	/**
	* Allowlist of method names that the CLI background runner
	* (process_runner.php) may execute when the client passes `background: true`
	* to tool_request. The background runner spawns a separate PHP process and
	* does NOT pass through dd_tools_api, so imperative permission checks inside
	* the listed methods are mandatory as defense-in-depth (see long_process_demo).
	* Every method listed here MUST also appear in API_ACTIONS.
	* @var list<string> BACKGROUND_RUNNABLE
	*/
	public const BACKGROUND_RUNNABLE = [
		'long_process_demo'
	];



	/**
	* GET_COMPONENT_DATA
	* Sample READ action: loads a component instance and returns its raw data.
	* Demonstrates the standard read-action pattern: declarative gate (API_ACTIONS
	* level 1) handles schema-level permission; a second imperative
	* assert_record_in_user_scope call inside the method confines access to
	* records within the caller's project scope when a section_id is provided.
	* The framework (dd_tools_api) already asserted read permission on
	* (options->section_tipo, options->component_tipo) before dispatch.
	* @param object $options {
	*    "component_tipo": "rsc85",    - ontology tipo of the target component
	*    "section_id": "1",            - record ID within the section
	*    "section_tipo": "rsc197",     - ontology tipo of the parent section
	*    "config": null                - optional per-call tool config override
	* }
	* @return object $response {
	*    result: {model, component_tipo, component_data} | false,
	*    msg: string,
	*    errors: array
	* }
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
		// isset() rather than !==null because the property itself may be absent
		// when the caller invokes the action in a list-level context (no record).
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
		// Resolve the PHP class name for component_tipo, then instantiate in 'list'
		// mode so the component returns structured data without UI extras.
		// DEDALO_DATA_NOLAN is the language-neutral constant ('lg-nolan') used when
		// the caller has not requested a specific display language; components
		// whose data is language-keyed will return all language variants.
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
	* Sample WRITE action: receives the file_data object produced by service_upload
	* and resolves the temporal upload path with strict path-confinement checks.
	* Demonstrates the canonical pattern for safely consuming uploaded files:
	* sanitize caller-supplied path fragments with sanitize_key_dir() and
	* basename(), then use realpath() to confirm the resolved path still lives
	* inside DEDALO_UPLOAD_TMP_DIR/{user_id}/ (guards against directory-traversal
	* attacks via crafted key_dir or tmp_name values).
	* A real tool would process or move the file after this validation stage.
	* The framework (dd_tools_api) already asserted write (level 2) permission on
	* (options->section_tipo, options->component_tipo) before dispatch.
	* @see https://dedalo.dev/docs/development/services/service_upload/
	* @param object $options {
	*    "component_tipo": "hierarchy31",  - ontology tipo of the uploading component
	*    "section_id": "1",                - record ID within the section
	*    "section_tipo": "es1",            - ontology tipo of the parent section
	*    "file_data": {                    - object written by service_upload
	*        "name": "myfile.zip",         - display name (not used for path resolution)
	*        "key_dir": "component_geolocation", - subdirectory under the user tmp dir
	*        "tmp_name": "myfile.zip",     - filename inside key_dir
	*        ...
	*    }
	* }
	* @return object $response {
	*    result: {file: string, size: int} | false,
	*    msg: string,
	*    errors: array
	* }
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
		// SEC: sanitize caller-supplied path fragments before building the path.
		// sanitize_key_dir strips dangerous characters from the subdirectory name;
		// basename ensures tmp_name cannot be a path traversal segment ('../../x').
			$key_dir	= sanitize_key_dir((string)$file_data->key_dir);
			$tmp_name	= basename((string)$file_data->tmp_name);
			$tmp_file	= DEDALO_UPLOAD_TMP_DIR . '/' . logged_user_id() . '/' . $key_dir . '/' . $tmp_name;

		// path confinement: realpath() resolves symlinks and '..' sequences.
		// If $real_file does not begin with $upload_root the file has escaped the
		// user's tmp directory — reject it regardless of how it got there.
		// realpath() returns false for non-existent paths, so the check also
		// acts as an existence guard (the file must actually be present).
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
	* Sample BACKGROUND action (developer-only): simulates a long-running process
	* by sleeping one second per iteration and logging progress.
	* Demonstrates the canonical background-action pattern:
	* - The client calls with `background: true`; the HTTP response returns
	*   immediately with the spawned CLI pid.
	* - The CLI background runner (process_runner.php) then executes this method
	*   in a separate PHP process; output goes to the debug log, NOT to the
	*   HTTP response.
	* - Because the CLI path bypasses dd_tools_api, this method imperatively
	*   re-checks is_developer() as defense-in-depth before doing any work.
	* Listed in BACKGROUND_RUNNABLE so the CLI runner accepts it.
	* Iterations are capped at 10 to prevent runaway background processes.
	* @param object $options {
	*    "iterations": 5  - number of sleep cycles to simulate (capped at 10)
	* }
	* @return object $response {
	*    result: {iterations_done: int} | false,
	*    msg: string,
	*    errors: array
	* }
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
