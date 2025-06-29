<?php
/*
	JSON DISPATCHER

	Received vars (normally by CURL post)

		code : Auth code to validate request

		lang : Code lang of requested data like lg-spa
			   Is set as constant 'WEB_CURRENT_LANG_CODE' and you can use later as a valid constant in all server api

		options : json encoded data than contains all vars necessaries to build the api logic
				The first var inside json object is 'dedalo_get' and is used to determine the function to call in each case

*/



// Turn off output buffering
	ini_set('output_buffering', 'off');



// debug
	// error_log(print_r($_REQUEST,true));
	// error_log(print_r(file_get_contents('php://input'),true));



// headers (configure it to allow CORS access, etc.)
	$headers_file = dirname(__FILE__, 2). '/config_api/server_config_headers.php';
	include $headers_file;

	// print as JSON data
	header('Content-Type: application/json');



// safe_xss
	$safe_xss = function($value) {

		if (is_string($value) && !empty($value)) {
			if ($decode_json = json_decode($value)) {
				// If var is a stringify JSON, not verify string yet
			}else{
				$value = strip_tags($value,'<br><strong><em><img>');
				$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
			}
		}

		return $value;
	};//end safe_xss



// js fetch calls try with format like
	# {
	#	code 		: 'mmycode',
	# 	dedalo_get 	: 'records',
	#	db_name 	: 'web_myweb',
	# 	table 		: 'mytable',
	# 	lang 		: 'lg-spa',
	# 	limit 		: 10
	# }
	if (empty($_REQUEST['code'])) {
		// try to get vars from json object
		$str_json = file_get_contents('php://input');
		if (!empty($str_json)) {
			$json_object= json_decode( $str_json );
			foreach($json_object as $key => $value) {
				if (!empty($value))
					$_REQUEST[$key] = $value;
			}
		}
	}

// auth code
	// must to be identical to server config defined code
	$code = isset($_REQUEST['code']) ? $safe_xss($_REQUEST['code']) : false;

// lang
	$lang = isset($_REQUEST['lang']) ? $safe_xss($_REQUEST['lang']) : false;

// db
	$db_name = isset($_REQUEST['db_name']) ? $safe_xss($_REQUEST['db_name']) : false;

// config . Load server api config vars
	// If received code if different to defined code, and error was launched
	// lang for the api was fixed here with received lang var or default value is used if not
	if(!include(dirname(__FILE__, 2) .'/config_api/server_config_api.php')) {
		exit("Error. Server API config file not found");
	}

// options . Get request vars options to send to manager
	$options = isset($_REQUEST['options']) ? $_REQUEST['options'] : false;

	if ($options!==false) {
		if (is_string($options)) {
			$options = json_decode( $options );
		}
	}else{

		$options = new stdClass();
		foreach ($_REQUEST as $key => $cvalue) {

			switch ($cvalue) {
				case 'true':
					$cvalue = true;
					break;
				case 'false':
					$cvalue = false;
					break;
			}
			$options->$key = $cvalue;
		}
	}

// dedalo_get. Inject option dedalo_get as current dir name (captured as var from Apache regex)
	$dedalo_get = isset($_REQUEST['dedalo_get']) ? $safe_xss($_REQUEST['dedalo_get']) : false;
	if ($dedalo_get!==false && is_object($options)) {
		$options->dedalo_get = $dedalo_get;
	}



// unlock session lock
	session_write_close();



// manager
	$manager = new manager();
	try {
		$dedalo_data = $manager->manage_request( $options );
		$result 	 = json_encode($dedalo_data, JSON_UNESCAPED_UNICODE);
		echo $result;

	} catch (Exception $e) {

		$error_obj = new stdClass();
			$error_obj->result 	= false;
			$error_obj->msg 	= 'Exception when calling Dédalo API: '. $e->getMessage();
		$result = json_encode($error_obj, JSON_UNESCAPED_UNICODE);
		echo $result;
	}



// debug
	// if(SHOW_DEBUG===true) {
	// 	error_log("api call ".PHP_EOL. json_encode($options, JSON_PRETTY_PRINT));
	// 	error_log("api result ".PHP_EOL. $result);
	// 	$t = time();
	// 	error_log( 'API SERVER CALL $_REQUEST: '. $t . PHP_EOL . print_r($_REQUEST,true));
	// }
