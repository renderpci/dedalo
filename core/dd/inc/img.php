<?php
include( DEDALO_CORE_PATH .'/base/core_functions.php');
session_write_close();



if(!isset($source)) $source = false;
if(isset($_REQUEST['source']))	$source = safe_xss($_REQUEST['source']);
if(isset($_REQUEST['s']))		$source = safe_xss($_REQUEST['s']);
if(!$source) die("Not source! $source");

# Accept images with get vars
$ar = explode('?', $source);
if (isset($ar[0])) {
	$source = $ar[0];
}

# set sone time
$myDateTimeZone 		= 'Europe/Madrid';
date_default_timezone_set($myDateTimeZone);

if(!isset($fx)) $fx = false;
if(isset($_REQUEST['fx']))	$fx = safe_xss($_REQUEST['fx']);

# Load obj ficha
require_once(dirname(__FILE__).'/class.Thumb.php');
$thumb 		= new Thumb($source);


# FX 

	$req_w = isset($_REQUEST['w']) ? safe_xss($_REQUEST['w']) : false;
	$req_h = isset($_REQUEST['h']) ? safe_xss($_REQUEST['h']) : false;
	$req_p = isset($_REQUEST['p']) ? safe_xss($_REQUEST['p']) : false;

	# crop image
	if($fx=='crop') {
		
		# width
		if(!isset($w)) $w = 64;
		if($req_w!==false) $w = $req_w;
		
		# height
		if(!isset($h)) $h = 48;
		if($req_h!==false) $h = $req_h;
		
		# position
		if(!isset($p)) $p = 'center';
		if($req_p!==false) $p = $req_p;
		
		$thumb->crop($cwidth=$w, $cheight=$h, $pos=$p);
	}
	

	# resize image
	if($fx=='resize') {		
		
		# value max
		if(!isset($w)) $w = 484;
		if($req_w!==false) $w = $req_w;
		
		# property (widht or height)
		if(!isset($h)) $h = 390;
		if($req_h!==false) $h = $req_h;
		
		#$thumb->resize($value=$rv, $prop=$rp);
		$thumb->resizeWithLimits($maxWidht=$w,$maxHeight=$h) ;
	}



# HEADERS
header("Cache-Control: private, max-age=10800, pre-check=10800");
header("Pragma: private");
header("Expires: " . date(DATE_RFC822,strtotime(" 120 day")));

# show header for jpg
header('Content-Type: image/jpeg');

# show created image raw code without save the file
$thumb->show();

exit();

?>