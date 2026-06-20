#!/usr/bin/env php
<?php declare(strict_types=1);
/**
* PROCESS_RUNNER.PHP
* CLI entry-point for all Dédalo background tasks.
*
* This script is the sole target of exec_::request_cli. It is never called
* directly from the browser; it runs as an independent PHP process spawned with
* `nohup nice -n 19` by the web-server process and communicates back to the
* client exclusively through its stdout (captured to a per-process file in
* DEDALO_SESSIONS_PATH that the client polls via dd_utils_api::get_process_status).
*
* Lifecycle (all steps must succeed or the script dies with a plain-text error):
*   1. Decode JSON argument ($argv[1]) — the serialised dispatch descriptor written
*      by exec_::request_cli.
*   2. Redirect the PHP error log to the same path used by the PHP-FPM pool so all
*      worker errors are consolidated into a single log stream.
*   3. Restore the HTTP $_SERVER environment (HTTP_HOST, REQUEST_URI, SERVER_NAME)
*      so that classes that reference those superglobals work identically in CLI.
*   4. Re-attach to the caller's PHP session by its ID, load config.php, then
*      immediately close the session for writing (read-only) to avoid locking the
*      FPM session file for the duration of the background job.
*   5. Authenticate: die if the session does not belong to a logged-in user.
*   6. Sanitize infrastructure keys (class_name, method_name, file) with safe_xss;
*      leave 'params' unsanitized (see sanitization note below).
*   7. Validate and include an optional extra class file, restricted to the project
*      tree (DEDALO_CORE_PATH and DEDALO_ADDITIONAL_TOOLS roots).
*   8. Check that the target class and method exist and are callable.
*   9. Enforce the BACKGROUND_RUNNABLE allowlist when the class declares one.
*  10. Invoke the method; catch permission_exception to produce a uniform JSON error.
*  11. echo the JSON-encoded result to stdout — captured as the process output file.
*
* Sanitization note: the 'params' key is intentionally skipped by safe_xss because
* params are application data (e.g. SQO filter expressions containing '>' or '<'
* operators) that would be corrupted by htmlspecialchars. The direct (non-CLI) API
* path also passes params unsanitized to tool methods. Infrastructure keys
* (class_name, method_name, file) are still sanitized and die on mutation.
*
* Security boundaries enforced here:
*   - Authentication gate: login::is_logged() must return true.
*   - allow_url_include must be Off; die otherwise.
*   - realpath() + prefix check restricts include_once to allowlisted roots.
*   - BACKGROUND_RUNNABLE opt-in allowlist mirrors dd_manager::API_ACTIONS (SEC-024).
*   - permission_exception from security::assert_* is caught and returned as JSON.
*
* @see exec_::request_cli   (caller that serialises and spawns this script)
* @see process              (PID tracking and output-file helpers)
* @see processes            (DB table that stores PID→pfile→user_id mappings)
* @package Dédalo
* @subpackage Core
*/

// time
// Record high-resolution start timestamp for elapsed-time logging at the end.
	$start_time = hrtime(true);

// data
// Decode the JSON dispatch descriptor passed as the first CLI argument.
// exec_::request_cli encodes class_name, method_name, file, params, session_id,
// user_id, server, and error_log_path into this single JSON string.
	$data = json_decode($argv[1], true);
	if (empty($data)) {
		die('Invalid data');
	}

// error_log_path.
// From now on, the execution CLI uses the same error log path as the PHP-FPM pool to get a unified error output.
// Redirect PHP error output to the same log file the FPM pool uses so that
// errors from background jobs appear alongside HTTP-request errors instead of
// going to the CLI SAPI's default destination (often /dev/stderr).
	$error_log_path = $data['error_log_path'] ?? null;
	if ($error_log_path) {
		ini_set('error_log', $error_log_path);
	}

// server environment. Restore from command arguments (merge to avoid wiping useful values)
// PHP CLI does not populate HTTP_HOST, REQUEST_URI, or SERVER_NAME; merge them
// from the values captured at request time so that any class that reads $_SERVER
// (e.g. URL builders, login::get_base_url) behaves identically to the FPM context.
// array_merge is used rather than assignment to preserve CLI-specific keys such as
// argv and the script path that are only meaningful inside the CLI SAPI.
	if (!empty($data['server']) && is_array($data['server'])) {
		$_SERVER = array_merge($_SERVER, $data['server']);
	}

// user_id
// Store the user ID from the dispatch descriptor for local reference and sanity
// checking; authoritative identity is still derived from the session below.
	$user_id = (int)$data['user_id'];

// session_id. Is used mainly to verify that user is logged or not.
	// get current session id and force new session name as equal
	// Force the PHP session subsystem to use the same session ID that was active
	// in the originating HTTP request. This allows login::is_logged() (called
	// below) to read the session data and verify the user is authenticated,
	// without requiring a separate credential exchange mechanism.
	$session_id = $data['session_id'] ?? null;
	if (!empty($session_id)) {
		session_id($session_id);
	}

// config. Starts a new session with forced id from command arguments
// Bootstrap the Dédalo environment: autoloader, DB connection, constants, and
// all core classes including login. Must run AFTER session_id() so that the
// session opened by config.php uses the ID injected above.
	include dirname(__FILE__, 3).'/config/bootstrap.php';

// unlock session. Only use for read
// Close the session file for writing immediately after config bootstraps it.
// This releases the file lock so that the originating FPM worker (and any other
// concurrent request for the same user) can access the session without blocking.
// Background jobs must be read-only with respect to session state.
	session_write_close();

// only logged users can access SSE events
// Authentication gate. The session opened above must belong to a logged-in user;
// any unauthenticated or expired-session invocation is rejected here.
// (!) This check must run after config.php loads the login class.
	if (login::is_logged()!==true) {
		die('Authentication error: please login');
	}

// safe_data. data check (sanitize strings recursively, preserve arrays/objects)
// Build a sanitized copy of $data for infrastructure keys. The $sanitize closure
// applies safe_xss (htmlspecialchars-based) to every string leaf; arrays and
// objects are traversed recursively; all other scalars (int, float, bool, null)
// pass through unchanged.
// Note: 'params' is intentionally excluded from this closure — see the loop below.
	$safe_data = [];
	$sanitize = null;
	$sanitize = function ($value) use (&$sanitize) {
		if (is_string($value)) {
			return safe_xss($value);
		}
		if (is_array($value)) {
			$res = [];
			foreach ($value as $k => $v) {
				$res[$k] = $sanitize($v);
			}
			return $res;
		}
		if (is_object($value)) {
			$res = new stdClass();
			foreach ((array)$value as $k => $v) {
				$res->$k = $sanitize($v);
			}
			return $res;
		}
		return $value;
	};

	foreach ($data as $key => $value) {
		if ($key === 'params') {
			// Skip recursive sanitization of params — they are application data
			// (e.g. SQO filter values with '>' operators) not rendered as HTML.
			// htmlspecialchars() corrupts such operational values. The direct
			// (non-CLI) path also passes options unsanitized to tool methods.
			// Infrastructure keys (class_name, method_name, file) are still
			// sanitized below.
			$safe_data[$key] = $value;
			continue;
		}
		$safe_value = $sanitize($value);
		if (is_string($value) && $safe_value !== $value) {
			// An infrastructure key's string value changed under sanitization,
			// meaning it contained HTML-special characters. This must never happen
			// for class names, method names, or file paths; die with a diagnostic.
			die("Invalid value [$key]: " . to_string($value));
		}
		$safe_data[$key] = $safe_value;
	}

// output manager
// Extract the three dispatch coordinates from the sanitized payload.
	// class_name
	$output_class_name		= $safe_data['class_name'] ?? null;
	// method_name
	$output_method_name		= $safe_data['method_name'] ?? null;
	// params
	// Default to an empty stdClass so the method always receives an object argument.
	$output_params			= $safe_data['params'] ?? new stdClass();

	if (empty($output_class_name) || !is_string($output_class_name)) {
		die('Invalid class_name');
	}
	if (empty($output_method_name) || !is_string($output_method_name)) {
		die('Invalid method_name');
	}

	// include class file (validate realpath and restrict to project tree)
	// When the dispatch descriptor includes a 'file' key the caller needs a class
	// that is not yet loaded by the autoloader (e.g. a tool class in an additional
	// tools root). This block validates and includes it safely.
	if (!empty($safe_data['file'])) {
		$allow_url_include = ini_get('allow_url_include');
		if ($allow_url_include === 'On' || $allow_url_include == true) {
			// (!) allow_url_include=On would let an attacker pass an http:// URL
			// as the 'file' argument and execute arbitrary remote code. Die here
			// rather than silently proceeding with a mis-configured server.
			die('Invalid server config. Remote files are not allowed');
		}
		$requested = $safe_data['file'];
		$real_requested = realpath($requested);
		// allowed include roots: the project tree plus any additional tool
		// roots (DEDALO_ADDITIONAL_TOOLS), canonicalized and policy-checked
		// by tool_paths (config + loader are already booted at this point)
		// Build the allowlist of directories from which an include is permitted.
		// The primary root is the Dédalo project directory three levels above this
		// file. Additional tool roots are contributed by tool_paths::get_roots()
		// when that class is loaded (it is, after config.php runs).
		$include_roots = [ realpath(dirname(__FILE__, 3)) ];
		if (class_exists('tool_paths', false)) {
			// Skip index 0 (the primary root already added above) and add any
			// extra roots registered via DEDALO_ADDITIONAL_TOOLS configuration.
			foreach (array_slice(tool_paths::get_roots(), 1) as $additional_root) {
				$include_roots[] = $additional_root->path;
			}
		}
		$include_ok = false;
		if ($real_requested !== false) {
			foreach ($include_roots as $include_root) {
				// Use a prefix check with a trailing DIRECTORY_SEPARATOR to ensure
				// a path like '/var/www/dedalo_evil' cannot match a root of
				// '/var/www/dedalo' by prefix alone.
				if ($include_root !== false
					&& strpos($real_requested, $include_root . DIRECTORY_SEPARATOR) === 0) {
					$include_ok = true;
					break;
				}
			}
		}
		if (!$include_ok) {
			debug_log(__METHOD__
				. " Request file for include is not valid " . PHP_EOL
				. ' file: ' . to_string($requested)
				, logger::ERROR
			);
			die('Invalid file');
		}
		include_once $real_requested;
	}

	// check callable
	// Verify the target class and method are available before attempting dispatch.
	// class_exists uses the autoloader; is_callable also checks visibility (must be public).
	if (!class_exists($output_class_name)) {
		debug_log(__METHOD__ . " Error. Class not found: " . $output_class_name, logger::ERROR);
		die('Invalid class');
	}
	if (!is_callable([$output_class_name, $output_method_name])) {
		debug_log(__METHOD__ . " Error. Method is not callable: " . $output_class_name . ':' . $output_method_name, logger::ERROR);
		die('Invalid method');
	}

	// SEC: opt-in per-class allowlist (mirrors SEC-024 / dd_manager::API_ACTIONS).
	// When the dispatched class declares a BACKGROUND_RUNNABLE class constant
	// the method MUST appear in it; otherwise we fall back to the historical
	// "any public-static method on the class is callable" rule. The opt-in
	// form is strongly preferred for new classes because process_runner is a
	// second API surface that bypasses dd_manager's own allowlist.
	// Example: area_maintenance declares BACKGROUND_RUNNABLE = ['build_database_version', ...].
	// Classes that do not declare the constant retain backward-compatible open access,
	// but all new classes dispatched via request_cli SHOULD declare it.
	if (defined($output_class_name . '::BACKGROUND_RUNNABLE')) {
		$bg_runnable = constant($output_class_name . '::BACKGROUND_RUNNABLE');
		if (!is_array($bg_runnable) || !in_array($output_method_name, $bg_runnable, true)) {
			debug_log(__METHOD__
				. " Error. Method not in BACKGROUND_RUNNABLE allowlist: "
				. $output_class_name . '::' . $output_method_name
				, logger::ERROR
			);
			die('Method not allowed for background execution');
		}
	}

	// exec output
	// Re-encode params through JSON to ensure all nested arrays are converted to
	// stdClass objects, matching the object-graph shape that tool methods expect
	// when they receive $options from the HTTP path (where json_decode produces objects).
	$output_params	= (object)json_decode( json_encode($output_params) );
	try {
		$output_result	= $output_class_name::$output_method_name($output_params);
	} catch (permission_exception $e) {
		// SEC: the dispatched method tripped a security::assert_* gate.
		// Convert to a uniform response shape so the parent (SSE / poll) gets
		// valid JSON and not a fatal-error trace on its stdout pipe.
		// The $e->api_context property carries the security context string set by
		// the security::assert_* helper that threw the exception.
		debug_log(__METHOD__
			. ' permission_exception in CLI: ' . $e->getMessage() . PHP_EOL
			. ' context: ' . $e->api_context . PHP_EOL
			. ' user_id: ' . to_string(logged_user_id()) . PHP_EOL
			. ' class: ' . $output_class_name . '::' . $output_method_name
			, logger::ERROR
		);
		$output_result = (object)[
			'result' => false,
			'msg'    => 'Error. ' . $e->getMessage(),
			'errors' => ['permissions_denied'],
		];
	}


// log write notification
// Record completion time so ops can detect pathologically slow background jobs.
	debug_log(__METHOD__
		.' Process runner job is done ('.$output_class_name.'::'.$output_method_name.') in time: '.exec_time_unit($start_time,'ms').' ms'
		, logger::WARNING
	);

// write result to file as text
// Emit the result as JSON on stdout. exec_::request_cli redirected stdout to the
// pfile (process output file in DEDALO_SESSIONS_PATH), so the client's polling
// call to dd_utils_api::get_process_status reads this JSON from disk.
	echo json_encode($output_result, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
