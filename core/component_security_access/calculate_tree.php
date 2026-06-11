#!/usr/bin/env php
<?php
/**
* This file calculates component_security_access datalist tree in background.
* Receives a command argument JSON encoded array as $argv[1]
* with server environment needed for config start file:
* {
* 	"server": {
* 		"HTTP_HOST"	: "127.0.0.1:8443",
* 		"REQUEST_URI"	: "DEDALO_API_URL",
* 		"SERVER_NAME"	: "127.0.0.1"
* 	},
* 	"session_id"	: "3j4mkd21cq71fh9qp7gj1ka033",
* 	"user_id"		: "-1",
* 	"lang" 			: "lg-spa"
* }
*/

// data
	$data = json_decode($argv[1], true);

// server environment. Restore from command arguments
	$_SERVER = $data['server'];

// user_id
	$user_id = (int)$data['user_id'];

// lang
	$lang = $data['lang'];
	// force set application and data lang
	$_REQUEST['dedalo_application_lang']	= $lang;
	$_REQUEST['dedalo_data_lang']			= $lang;

// session_id. Resumes the caller's session so user auth data is available in the CLI process.
	// Must be set BEFORE config.php calls session_start().
	$session_id = $data['session_id'] ?? '';
	if (!empty($session_id)) {
		session_id($session_id);
	}

	error_log(")))))))))))))))))))))))))))))))))))))))))))))))) session_id 1: $session_id");

// unlock session. Only for read
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
	include dirname(__FILE__, 3) . '/config/bootstrap.php';

// actions to run
	$datalist = component_security_access::calculate_tree($user_id, $lang);

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
	echo OpcacheObjectManager::generateCode($datalist);
