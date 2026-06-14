<?php declare(strict_types=1);
/**
* ENVIRONMENT.JS.PHP
* PHP-generated JavaScript bootstrap file that publishes server-side
* configuration to the browser as global JS constants and the
* `window.page_globals` object.
*
* This file is served as `Content-Type: application/javascript` and is
* loaded as the very first <script> tag in every Dédalo page.  All
* subsequent JS modules depend on the globals it declares.
*
* Responsibilities:
* - Set anti-cache HTTP headers so the browser never serves a stale
*   configuration after a deployment or permission change.
* - Define `PREVENT_SESSION_LOCK` before config.php loads so the
*   session manager skips the blocking session_write_close() handshake
*   that would otherwise serialise concurrent XHR requests.
* - Load config.php (which bootstraps the entire PHP environment and
*   registers the auto-loader).  On failure, emit a safe JS fallback
*   that nulls every constant so client code cannot crash on undefined
*   names, shows a visible alert, and halts.
* - Call `dd_core_api::get_environment()` once and distribute the three
*   parts of its result across the three JS output blocks:
*     - `window.page_globals`  — rich object (auth state, entity, URLs,
*       ontology identifiers, server capabilities).
*     - `const` declarations   — scalar PHP constants mirrored verbatim
*       as browser-side JS constants (SHOW_DEBUG, DEDALO_CORE_URL, …).
*     - `const get_label`      — full localised label dictionary for the
*       logged-in user's language.
* - Append `build_time_ms` so client diagnostics can log how long the
*   PHP side took to render this file.
*
* @package Dédalo
* @subpackage Core
*/

// Performance timer — must be the very first statement so it covers the
// entire PHP execution time of this file, including config loading and
// the get_environment() call below.
$global_start_time = hrtime(true);

// headers
	header('Content-type: application/javascript; charset=utf-8');
	// no cache headers
	// (!) These three lines together satisfy both HTTP/1.0 (Pragma) and
	// HTTP/1.1 (Cache-Control) caches, and the duplicate Cache-Control call
	// with post-check/pre-check handles older IE proxy quirks.  All three
	// are necessary; removing any one may allow stale JS to be served.
	header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
	header("Cache-Control: post-check=0, pre-check=0", false);
	header("Pragma: no-cache");

// prevent_session_lock
	// Signal to worker/class.session_manager.php that this request must NOT
	// block on session_write_close().  Without this flag, a slow PHP session
	// back-end would serialise this bootstrap request with every concurrent
	// API call from the same tab, producing visible page-load stalls.
	define('PREVENT_SESSION_LOCK', true);

// config file
	// config.php bootstraps the entire PHP stack (auto-loader, constants,
	// database credentials, the dd_core_api class, etc.).  If it is absent
	// (e.g. fresh install, misconfigured path) the browser would receive
	// incomplete JS and crash unpredictably.  The fallback block below
	// emits safe stub constants so the client can at least display an alert
	// instead of a silent JS syntax error.
	$config_path = dirname(__DIR__, 3) . '/config/config.php'; // Go up 3 directories from this file to the root
	if( !include_once $config_path ) {

		echo '
		window.page_globals = { "error" : "Error loading config file" };
		const SHOW_DEBUG = false,
		SHOW_DEVELOPER = false,
		DEDALO_CORE_URL = "",
		DEDALO_ROOT_WEB = "",
		get_label = {};
		alert("Error loading environment. Configuration file not available!");
		';
		exit();
	}

// Single call that assembles all three output payloads in one shot.
// Internally this calls get_page_globals(), get_js_plain_vars(), and
// get_lang_labels() and returns a stdClass with keys page_globals,
// plain_vars (assoc array), and get_label (decoded JSON object).
$environment_response = dd_core_api::get_environment();

// page_globals
	// JSON_PRETTY_PRINT is used here for readability in the browser's DevTools
	// source viewer; the payload is already served without HTTP compression for
	// JS static assets, so the extra whitespace has no meaningful size impact.
	$page_globals		= $environment_response->result->page_globals; // return object
	$page_globals_json	= json_encode($page_globals, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

// plain global vars
	// Each entry in $plain_vars becomes a single JS `const` declaration.
	// array_map over both values and keys (two-array form) avoids a
	// separate array_keys() + array_combine() round-trip and produces the
	// "KEY=<json-value>" fragments that are then joined with commas into one
	// multi-declaration `const` statement.
	$plain_vars			= $environment_response->result->plain_vars; // return array assoc
	$plain_vars_string	= PHP_EOL. implode(','.PHP_EOL, array_map(function ($v, $k) {
		return sprintf('%s=%s', $k, json_encode($v, JSON_UNESCAPED_SLASHES));
	}, $plain_vars, array_keys($plain_vars)));

// lang labels. String ready to output with error catching
	// get_label holds every translatable UI string for the active language
	// (DEDALO_APPLICATION_LANG).  It is decoded server-side and re-encoded
	// here so the client receives a plain JS object literal, not a JSON
	// string that would need a second JSON.parse() call.
	$lang_labels = json_encode($environment_response->result->get_label, JSON_PRETTY_PRINT); // return string

// javascript code:
?>
// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

"use strict";

// page_globals. Set var to window to allow easy access from opened windows
window.page_globals=<?php echo $page_globals_json; ?>;

// plain_vars. Main JS plain constants
const <?php echo $plain_vars_string; ?>;

// lang labels. Object with all Dédalo global labels in current lang
const get_label=<?php echo $lang_labels; ?>;

// time
const build_time_ms=<?php echo exec_time_unit($global_start_time,'ms'); ?>;

// @license-end
