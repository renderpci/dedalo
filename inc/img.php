<?php
session_write_close();

if(!isset($source)) $source = false;
if(isset($_REQUEST['source']))	$source = $_REQUEST['source'];
if(isset($_REQUEST['s']))		$source = $_REQUEST['s'];
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
if(isset($_REQUEST['fx']))	$fx = $_REQUEST['fx'];

# Load obj ficha
require_once(dirname(__FILE__).'/class.Thumb.php');
$thumb 		= new Thumb($source);


# FX 

	# crop image
	if($fx=='crop') {
		
		# width
		if(!isset($w)) $w = 64;
		if(isset($_REQUEST['w']))	$w = $_REQUEST['w'];
		
		# height
		if(!isset($h)) $h = 48;
		if(isset($_REQUEST['h']))	$h = $_REQUEST['h'];
		
		# position
		if(!isset($p)) $p = 'center';
		if(isset($_REQUEST['p']))	$p = $_REQUEST['p'];
		
		$thumb->crop($cwidth=$w, $cheight=$h, $pos=$p);
	}
	
	# resize image
	if($fx=='resize') {		
		
		# value max
		if(!isset($w)) $w = 484;
		if(isset($_REQUEST['w']))	$w = $_REQUEST['w'];
		
		# property (widht or height)
		if(!isset($h)) $h = 390;
		if(isset($_REQUEST['h']))	$h = $_REQUEST['h'];
		
		#$thumb->resize($value=$rv, $prop=$rp);
		$thumb->resizeWithLimits($maxWidht=$w,$maxHeight=$h) ;
	}
/**/

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