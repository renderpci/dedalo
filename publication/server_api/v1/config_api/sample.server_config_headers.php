<?php
// PUBLIC API HEADERS
	// Allow CORS
	header("Access-Control-Allow-Origin: *");
	$allow_headers = [
		// 'Access-Control-Allow-Headers',
		// 'Origin,Accept',
		// 'X-Requested-With',
		'Content-Type',
		// 'Access-Control-Request-Method',
		// 'Access-Control-Request-Headers'
	];
	header("Access-Control-Allow-Headers: ". implode(', ', $allow_headers));