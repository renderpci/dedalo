#!/usr/bin/env php
<?php
/**
* CALCULATE_TREE
* CLI entry point that computes the component_security_access datalist tree in a background process.
*
* This script is intentionally executed as a separate PHP subprocess (not via the HTTP API).
* The security-access tree is an expensive computation (3–6 seconds for large ontologies);
* spawning it in the background during login lets the login response return immediately
* while the cache is built asynchronously.
*
* Execution flow:
* 1. Decode the single JSON argument ($argv[1]) that carries all context the web process
*    had at login time (server environment, session id, authenticated user, language).
* 2. Reconstruct $_SERVER so that config.php initialises correctly (it reads HTTP_HOST,
*    SERVER_NAME, and REQUEST_URI to derive DEDALO_HOST_PATH and related constants).
* 3. Restore the caller's PHP session by ID before session_start() runs inside config.php,
*    so that the CLI process has access to the same authentication data as the web request.
* 4. Define PREVENT_SESSION_LOCK = true so config.php opens the session read-only
*    (session_start with read_and_close), avoiding a lock that would block the web process.
* 5. Include config.php to boot the full Dédalo environment (autoloader, constants, DB).
* 6. Call component_security_access::calculate_tree() to build the datalist.
* 7. Emit the result via OpcacheObjectManager::generateCode(), which converts the datalist
*    to a minified `<?php return [...];` string. The caller (background launcher) captures
*    stdout and writes it to the per-language cache file that get_datalist() will subsequently
*    read from disk on every request.
*
* $argv[1] must be a JSON-encoded object with the following structure:
* {
*     "server": {
*         "HTTP_HOST"   : "127.0.0.1:8443",
*         "REQUEST_URI" : "DEDALO_API_URL",
*         "SERVER_NAME" : "127.0.0.1"
*     },
*     "session_id" : "3j4mkd21cq71fh9qp7gj1ka033",
*     "user_id"    : "-1",
*     "lang"       : "lg-spa"
* }
*
* Output: a single PHP source string on stdout (OpcacheObjectManager::generateCode format).
*         The caller is responsible for writing this string to the cache file.
*
* @see component_security_access::calculate_tree() — the main computation entry point
* @see component_security_access::get_datalist()   — the reader that consumes the cache file
* @see OpcacheObjectManager::generateCode()         — serialises the array to PHP source
* @see dd_cache::cache_from_file()                  — the cache-file I/O layer
*
* @package Dédalo
* @subpackage Core
*/

// data
// Decode the single CLI argument; all context the web worker had at login time is packed here.
	$data = json_decode($argv[1], true);

// server environment. Restore from command arguments
// config.php uses $_SERVER['HTTP_HOST'] and related keys to derive DEDALO_HOST_PATH and
// other URL-based constants. Without this restore the CLI process would pick up wrong paths.
	$_SERVER = $data['server'];

// user_id
// Cast to int to match the int type expected by security:: and component_common:: methods.
	$user_id = (int)$data['user_id'];

// lang
	$lang = $data['lang'];
	// force set application and data lang
	// $_REQUEST is read by config.php to set DEDALO_APPLICATION_LANG / DEDALO_DATA_LANG constants.
	// The CLI process has no HTTP request, so the desired language must be injected here.
	$_REQUEST['dedalo_application_lang']	= $lang;
	$_REQUEST['dedalo_data_lang']			= $lang;

// session_id. Resumes the caller's session so user auth data is available in the CLI process.
	// Must be set BEFORE config.php calls session_start().
	// If the session is NOT restored, security::is_global_admin() and get_user_profile()
	// will fail because they read from $_SESSION['dedalo'].
	$session_id = $data['session_id'] ?? '';
	if (!empty($session_id)) {
		session_id($session_id);
	}

	error_log(")))))))))))))))))))))))))))))))))))))))))))))))) session_id 1: $session_id");

// unlock session. Only for read
// (!) Defining PREVENT_SESSION_LOCK before config.php makes config.php open the session
// with read_and_close so that the exclusive file lock is released immediately.
// Without this flag the web process would be blocked until this subprocess finishes.
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
// Boots the full Dédalo environment: constants, autoloader, DB connections, session resume.
	include dirname(__FILE__, 3) . '/config/config.php';

// actions to run
// The expensive computation: walks the ontology hierarchy for the given user and language,
// building the flat datalist that the permission UI and access-check logic will consume.
	$datalist = component_security_access::calculate_tree($user_id, $lang);

	// session integrity checks
	// After config.php has run, verify that the session that was restored matches what was
	// requested, and that the language constant was set as expected. Mismatches here mean
	// the cache will be built for the wrong language or with wrong permission data.
	$session_lang = isset($_SESSION['dedalo']) && isset($_SESSION['dedalo']['config']) && isset($_SESSION['dedalo']['config']['dedalo_application_lang'])
		? $_SESSION['dedalo']['config']['dedalo_application_lang']
		: null;

	error_log(")))))))))))))))))))))))))))))))))))))))))))))))) session_id 2: " . session_id());
	error_log(")))))))))))))))))))))))))))))))))))))))))))))))) session value dedalo_application_lang: " . $session_lang);

	$current_session = session_id();
	if (empty($current_session)) {
		trigger_error("))))) Warning! current session is empty");
	} elseif (empty($session_id)) {
		trigger_error("))))) Warning! No session_id provided: session flow not preserved across CLI process");
	} elseif ($session_id !== $current_session) {
		trigger_error("))))) Warning! session id received and current session id do not match " . $session_id . ' -> ' . $current_session);
	}
	if ($session_lang === null) {
		trigger_error('))))) Warning! session dedalo_application_lang is not defined (' . '$_SESSION[\'dedalo\'][\'config\'][\'dedalo_application_lang\']' .')');
	} elseif ($lang !== $session_lang) {
		trigger_error('))))) Warning! session dedalo_application_lang ('. $session_lang. ') is not the desired language ('.$lang.')');
	}

// write result to file as text
// OpcacheObjectManager::generateCode() converts $datalist to a minified PHP source string
// of the form `<?php return [...];` so it can be loaded by include() and benefit from
// OPcache (no JSON decode / unserialize overhead on subsequent reads).
// The output goes to stdout; the background launcher captures it and writes it to disk.
	echo OpcacheObjectManager::generateCode($datalist);
