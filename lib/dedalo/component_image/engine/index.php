<?php
//
require( dirname(dirname(dirname(__FILE__))).'/config/config4.php');


$f		= common::setVar('f');
$file	= DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . $f;


// Check file exists
	if (!file_exists($file)) {
		// File not found in dir
		header("HTTP/1.0 404 Not Found");
		echo "Image not found in dir ($file_name)";
		exit();
	}

	// Set zone time
		date_default_timezone_set('Europe/Madrid');


	// Headers		
		// $ACCESS_CONTROL_ALLOW_ORIGIN = defined('ACCESS_CONTROL_ALLOW_ORIGIN') ? ACCESS_CONTROL_ALLOW_ORIGIN : '*';
		// header("Access-Control-Allow-Origin: {$ACCESS_CONTROL_ALLOW_ORIGIN}");
		header("Cache-Control: private, max-age=10800, pre-check=10800");
		header("Pragma: private");
		header("Expires: " . date(DATE_RFC822,strtotime(" 1 day")));
		header('Content-Type: image/jpeg');	

	// Direct read file
		header('Content-Length: ' . filesize($file));
		readfile($file);

	

	// Thumb options
		// if (isset($_GET['fx'])) {

		// 	#$common_path = dirname(dirname(dirname(dirname(dirname(__FILE__))))) . '/common';
		// 	$common_path = dirname(dirname(dirname(__FILE__))) . '/web_app/common';
		// 	include($common_path .'/class.common.php');
		// 	include($common_path .'/class.thumb.php');

		// 	// thumb manager
		// 	$thumb  = new thumb($file);

		// 	$fx 	= isset($_GET['fx']) ? common::safe_xss($_GET['fx']) : false;	
		// 	$req_w 	= isset($_GET['w'])  ? common::safe_xss($_GET['w'])  : false;
		// 	$req_h 	= isset($_GET['h'])  ? common::safe_xss($_GET['h'])  : false;
		// 	$req_p 	= isset($_GET['p'])  ? common::safe_xss($_GET['p'])  : false;			

		// 	# crop image
		// 	if($fx==='crop') {
				
		// 		# width
		// 		if(!isset($w)) $w = 64;
		// 		if($req_w!==false) $w = $req_w;
				
		// 		# height
		// 		if(!isset($h)) $h = 48;
		// 		if($req_h!==false) $h = $req_h;
				
		// 		# position
		// 		if(!isset($p)) $p = 'center';
		// 		if($req_p!==false) $p = $req_p;
				
		// 		$thumb->crop($cwidth=$w, $cheight=$h, $pos=$p);
			
		// 	# resize image
		// 	}else if($fx==='resize') {		
				
		// 		# value max
		// 		if(!isset($w)) $w = 484;
		// 		if($req_w!==false) $w = $req_w;
				
		// 		# property (widht or height)
		// 		if(!isset($h)) $h = 390;
		// 		if($req_h!==false) $h = $req_h;
				
		// 		#$thumb->resize($value=$rv, $prop=$rp);
		// 		$thumb->resizeWithLimits($maxWidht=$w,$maxHeight=$h) ;
		// 	}
			

		// 	// Show created image raw code without save the file
		// 		$thumb->show();

		// }else{

		// 	// Direct read file
		// 		header('Content-Length: ' . filesize($file));
		// 		readfile($file);

		// }//end if (isset($_GET['fx']))
	

