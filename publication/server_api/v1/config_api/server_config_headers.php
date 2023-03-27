<?php
// PUBLIC API HEADERS
	// Allow CORS
	header("Access-Control-Allow-Origin: *");
	
	// header("Access-Control-Allow-Credentials: true");
	// header("Access-Control-Allow-Methods: GET,POST"); // GET,HEAD,OPTIONS,POST,PUT
	$allow_headers = [
		// 'Access-Control-Allow-Headers',
		// 'Origin,Accept',
		// 'X-Requested-With',
		'Content-Type',
		// 'Access-Control-Request-Method',
		// 'Access-Control-Request-Headers'
	];
	header("Access-Control-Allow-Headers: ". implode(', ', $allow_headers));

	
	// /**
	//  *  An example CORS-compliant method.  It will allow any GET, POST, or OPTIONS requests from any
	//  *  origin.
	//  *
	//  *  In a production environment, you probably want to be more restrictive, but this gives you
	//  *  the general idea of what is involved.  For the nitty-gritty low-down, read:
	//  *
	//  *  - https://developer.mozilla.org/en/HTTP_access_control
	//  *  - http://www.w3.org/TR/cors/
	//  *
	//  */
	// function cors() {

	// 	// Allow from any origin
	// 	if (isset($_SERVER['HTTP_ORIGIN'])) {
	// 		// Decide if the origin in $_SERVER['HTTP_ORIGIN'] is one
	// 		// you want to allow, and if so:
	// 		header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
	// 		header('Access-Control-Allow-Credentials: true');
	// 		header('Access-Control-Max-Age: 86400');    // cache for 1 day
	// 	}

	// 	// Access-Control headers are received during OPTIONS requests
	// 	if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {

	// 		if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
	// 			// may also be using PUT, PATCH, HEAD etc
	// 			header("Access-Control-Allow-Methods: GET, POST, OPTIONS");         

	// 		if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
	// 			header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");

	// 		exit(0);
	// 	}

	// 	// echo "You have CORS!";
	// }
	// cors();