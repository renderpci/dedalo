#!/usr/bin/env php
<?php
/**
* This file calculates component_security_acces datalist tree in background.
* Receives a command argument JSON encoded array as $argv[1]
* with server environment needed for config start file:
* {
* 	"server" => [
* 		 "HTTP_HOST"	: "127.0.0.1:8443",
* 		 "REQUEST_URI"	: "DEDALO_API_URL",
* 		 "SERVER_NAME"	: "127.0.0.1"
* 	],
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

// session_id. Is used mainly to verify that user is logged or not.
	// get current session id and force new session name as equal
	$session_id = $data['session_id'];
	session_id($session_id);

	error_log(")))))))))))))))))))))))))))))))))))))))))))))))) session_id 1: $session_id");

// unlock session. Only for read
	define('PREVENT_SESSION_LOCK', true);

// config. Starts a new session with forced id from command arguments
	include (dirname(dirname(dirname(__FILE__)))) .'/config/config.php';

// unlock session
	// session_write_close();

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
	}
	if ($session_id!=session_id()) {
		trigger_error("))))) Warning! session id received and current session id do not match " . $session_id . ' -> ' .$current_session);
	}
	if (!isset($session_lang)) {
		trigger_error('))))) Warning! session dedalo_application_lang is not defined (' . '$_SESSION[\'dedalo\'][\'config\'][\'dedalo_application_lang\']' .')');
	}else{
		if ($lang!=$session_lang) {
			trigger_error('))))) Warning! session dedalo_application_lang ('. $session_lang. ') is not the desired language ('.$lang.')');
		}
	}

// write result to file as text
	echo json_encode($datalist);
