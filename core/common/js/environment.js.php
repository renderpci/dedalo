<?php declare(strict_types=1);

$global_start_time = hrtime(true);

// headers
	header('Content-type: application/javascript; charset=utf-8');
	// no cache headers
	header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
	header("Cache-Control: post-check=0, pre-check=0", false);
	header("Pragma: no-cache");

// prevent_session_lock
	define('PREVENT_SESSION_LOCK', true);

// config file
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

// page_globals
	$page_globals		= dd_core_api::get_page_globals(); // return object
	$page_globals_json	= json_encode($page_globals, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

// plain global vars
	$plain_vars			= dd_core_api::get_js_plain_vars(); // return array assoc
	$plain_vars_string	= PHP_EOL. implode(','.PHP_EOL, array_map(function ($v, $k) {
		return sprintf('%s=%s', $k, json_encode($v, JSON_UNESCAPED_SLASHES));
	}, $plain_vars, array_keys($plain_vars)));

// lang labels. String ready to output with error catching
	$lang_labels = dd_core_api::get_lang_labels(DEDALO_APPLICATION_LANG); // return string

// javascript code:
?>
// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

"use strict";

// page_globals. Set var to window to allow easy access from opened windows
window.page_globals=<?php echo $page_globals_json; ?>;
// plain_vars. Main JS plain constants
const <?php echo $plain_vars_string; ?>;
// lang labels. Object with all Dédalo global labels in current lang
const get_label=<?php echo $lang_labels; ?>
// time
const build_time_ms=<?php echo exec_time_unit($global_start_time,'ms'); ?>


// @license-end
