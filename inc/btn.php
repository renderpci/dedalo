<?php
include(dirname(dirname(__FILE__)) .'/lib/dedalo/config/core_functions.php');

# set some time Important!
$myDateTimeZone = 'Europe/Madrid';
date_default_timezone_set($myDateTimeZone);

#
# TEXT
$text = false;

# TEXT STRING . Get last directory in $PATH
#if( !$text = substr(strrchr($_SERVER["REQUEST_URI"], ".php/"), 5) ) {
#	die("Need text!");
#}
if (strpos($_SERVER["REQUEST_URI"],'[/index')!==false) {
	$text = substr(strrchr($_SERVER["REQUEST_URI"], ".php/"), 5);
}else if( !$text = pathinfo($_SERVER["REQUEST_URI"])['basename']){
	die("Need text!");
}

$text = safe_xss($text);

# Text to show
$text = trim(stripslashes(urldecode($text)));
$text = strip_tags($text, '');

#
# TAG TYPE
$type = false;
switch (true) {
	case (strpos($text,'[TC_')!==false):
		$type 			= 'tc';
		$pattern 		= "/\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?)_TC\]/";
		$text_original 	= $text;
		preg_match_all($pattern, $text, $matches);
		#print_r($text.'<hr>'); print_r($pattern.'<hr>'); print_r($matches); die();
		$text			= $matches[1][0];
		$imgBase 		= "../images/btn_base/tc_ms-x2.png";
		break;
	case (strpos($text,'[index-')!==false || strpos($text,'[/index-')!==false):
		$type 			= 'index';
		$pattern 		= "/\[\/{0,1}(index)-([a-z])-([0-9]{1,6})(-(.{0,22}))?(-data:(.*?):data)?\]/";
		$text_original 	= $text;
		preg_match_all($pattern, $text, $matches);
		#print_r($text.'<hr>'); print_r($pattern.'<hr>'); print_r($matches); die();
		$n 		= $matches[3][0];
		$state 	= $matches[2][0];

		if(strpos($text_original,'/')!==false) {
			# mode [/index-u-6]	
			$text 		= " $n";
			$imgBase 	= "../images/btn_base/indexOut-{$state}-x2.png";
		}else{
			# mode [index-u-1]
			$text 		= $n;
			$imgBase 	= "../images/btn_base/indexIn-{$state}-x2.png";
		}
		break;
	case (strpos($text,'[svg-')!==false):
		$type = 'svg' ;
		# mode [svg-n-1-data:***]
		$state 		= substr($text,5,1);
		$last_minus = strrpos($text, '-');
		$ar_parts 	= explode('-', $text);
		$text 		= $ar_parts[2];
		$imgBase 	= "../images/btn_base/svg-{$state}-x2.png";
		break;
	case (strpos($text,'[draw-')!==false):
		$type = 'draw' ;
		# mode [svg-n-1-data:***]
		$state 		= substr($text,6,1);
		$last_minus = strrpos($text, '-');
		$ar_parts 	= explode('-', $text);
		$text 		= $ar_parts[2];
		$imgBase 	= "../images/btn_base/draw-{$state}-x2.png";
		break;
	case (strpos($text,'[geo-')!==false):
		$type = 'geo';
		# mode [geo-n-1-data:***]
		$state 		= substr($text,5,1);
		$last_minus = strrpos($text, '-');
		$ar_parts 	= explode('-', $text);
		$text 		= $ar_parts[2];
		$imgBase 	= "../images/btn_base/geo-{$state}-x2.png";
		break;
	case (strpos($text,'[page-')!==false):
		$type = 'page';
		# mode [page-n-1]
		$pattern 		= "/\[(page)-([a-z])-([0-9]{1,6})(-.{0,22})?\]/";
		$text_original 	= $text;
		preg_match_all($pattern, $text, $matches);
		#print_r($text.'<hr>'); print_r($pattern.'<hr>'); print_r($matches); die();
		$text			= $matches[3][0];	
		$state 			= $matches[2][0];		
		$imgBase 		= "../images/btn_base/page-{$state}-x2.png";
		break;
	case (strpos($text,'[person-')!==false):
		$type = 'person';
		# mode [person-0-name-data:locator_flat:data]
		$pattern 	= "/\[(person)-([a-z])-([0-9]{1,6})-(\S{0,22})\]/";
		$text_original 	= $text;
		preg_match_all($pattern, $text, $matches);
		#print_r($text.'<hr>'); print_r($pattern.'<hr>'); print_r($matches); die();
		$text			= urldecode($matches[4][0]);
		$state 			= $matches[2][0];
		$imgBase 		= "../images/btn_base/person-{$state}-x2.png";
		break;
	case (strpos($text,'[note-')!==false):
		$type = 'note';
		# mode [note-0-name-data:locator_flat:data]
		$ar_parts 	= explode('-', $text);
		$state 		= $ar_parts[1];
		$text 		= urldecode($ar_parts[2]);
		$imgBase 	= "../images/btn_base/note-{$state}-x2.png";
		break;
	/*
	case (strpos($text,'[reference-')!==false || strpos($text,'[/reference-')!==false):
		$type 			= 'reference';
		$pattern 		= "/\[\/{0,1}(reference)-([a-z])-([0-9]{1,6})(-(.{0,22}))?(-data:(.*?):data)?\]/";
		$text_original 	= $text;
		preg_match_all($pattern, $text, $matches);
		#print_r($text.'<hr>'); print_r($pattern.'<hr>'); print_r($matches); die();
		$n 		= $matches[3][0];
		$state 	= $matches[2][0];

		if(strpos($text_original,'/')!==false) {
			# mode [/reference-u-6]	
			$text 		= " $n";
			$imgBase 	= "../images/btn_base/referenceOut-{$state}-x2.png";
		}else{
			# mode [reference-u-1]
			$text 		= $n;
			$imgBase 	= "../images/btn_base/referenceIn-{$state}-x2.png";
		}
		break;*/
	default:
		die("Need type ..! <br>$text");
		break;
}


# Text formatting in 1 or 2 lines depending on the number of characters
# $maxchar 	= 16 ;
$width 		= 66 ; 	# 88
$angle 		= 0;	# 0
$x 			= 0 ;	# 0
$y 			= 0 ;	# 0


# We create an image from the base image ($imgBase)
$im = imagecreatefrompng($imgBase);


# Define colors
$black 		= imagecolorallocate($im, 0, 0, 0);
$white 		= imagecolorallocate($im, 255, 255, 255);
$grey 		= imagecolorallocate($im, 188, 188, 188);
$colorH 	= imagecolorallocate($im, 141, 198, 63);
$colorH 	= imagecolorallocate($im, 0, 232, 0);
$colorP		= imagecolorallocate($im, 0, 167, 157);


# Font config defaults
#$font_name 	= '/liberation/LiberationSans-Regular.ttf';
#$font_name 	= '/oxigen-webfont/oxygen-bold-webfont.ttf';
$font_name 	= '/san_francisco/System_San_Francisco_Display_Regular.ttf';
$font_size 	= 8;

switch($type) {

	case 'tc'	:	$colorText	= $colorH ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 8  ; # 11 o 10.88
					$font_size 	= ($font_size *2)+2; // as 18
					break;

	case 'index':	$colorText	= $black ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88
					$font_size 	= ($font_size *2)+2; // as 18

					if($state=='n') $colorText	= $white ;
					break;	

	case 'svg':		$colorText	= $white ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88
					$font_size 	= ($font_size *2)+2;
					break;

	case 'draw':	$colorText	= $white ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88
					$font_size 	= ($font_size *2)+2;
					break;

	case 'geo':		$colorText	= $white ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88
					$font_size 	= ($font_size *2)+2;

					if($state=='n') $colorText	= $white ;
					break;

	case 'page':	$colorText	= $black ;
					$colorBG 	= $black ;
					$font_size 	= ($font_size *2)+2;
					break;
	
	case 'person':	$colorText	= $black ;
					$colorBG 	= $black ;
					#$maxchar 	= 160 ;
					#$width 		= 400 ; 	# 88
					$font_size 	= ($font_size *2)+2; // as 18
					#$font_name 	= '/oxigen-webfont/oxygen-bold-webfont.ttf';
					#$font_name 	= '/san_francisco/System_San_Francisco_Display_Regular.ttf';
					#$font_name 	= '/san_francisco/SanFranciscoDisplay-Regular.otf';
					break;
	case 'note':	$colorText	= $black ;
					$colorBG 	= $white ;
					#$maxchar 	= 160 ;
					#$width 		= 400 ; 	# 88
					$font_size 	= ($font_size *2)+2; // as 18
					#$font_name 	= '/oxigen-webfont/oxygen-bold-webfont.ttf';
					#$font_name 	= '/san_francisco/System_San_Francisco_Display_Regular.ttf';
					#$font_name 	= '/san_francisco/SanFranciscoDisplay-Regular.otf';
					break;
}

# We activate the alpha chanel (24bit png)
imageAlphaBlending($im, true);
imageSaveAlpha($im, true);

# Making Image Transparent 
#imagecolortransparent($im,$colorBG); 

# FONT FILES . Path to our font file
$path_fonts = dirname(dirname(__FILE__)) . '/lib/dedalo/themes/default/fonts';
$fontfile	= $path_fonts . $font_name;

# OFFSET
$offsetX	= 0 ; # 0
$offsetY	= 0 ; # 5

switch ($type) {
	case 'tc':
		$offsetX = 0;
		$offsetY = 2;
		break;
	case 'index':
		$offsetX = 2;
		$offsetY = 2;
		break;
	case 'svg':
	case 'draw':
	case 'page':
		$offsetY = 2;
	case 'person':
		$offsetX = 8;
		break;
	case 'geo':
		$offsetY = 2;
		$offsetX = 7;
		break;
	case 'note':
		$offsetX = 0;
		$offsetY = 0;
		break;	
}

# CUSTOM OFFSET FOR MAC DEVELOPMENT
if (PHP_OS==='Darwin') {

	$offsetX	= -1 ; # 0

	switch ($type) {
		case 'tc':
		case 'index':
			break;
		case 'svg':
		case 'draw':
		case 'page':
		case 'person':
			$offsetX = 8;
			break;
		case 'geo':
			$offsetX = 7;
			break;
		case 'note':
			$offsetX = 0;
			break;
	}
}//end if (DEDALO_ENTITY=='development')


# BACKGROUND. Set the background to be white
#$bg = imagefilledrectangle($im, 0, 0, $width, $width, $colorBG); //( resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color )

// Get image Width and Height
$image_width  = imagesx($im);
$image_height = imagesy($im);

$centroXimg = $image_width / 2;
$centroYimg	= $image_height / 2;


if($text!==false) {

	# First we create our bounding box for the first text
	# Get Bounding Box Size
	$bbox = imagettfbbox($font_size, $angle, $fontfile, $text ); //( float $size , float $angle , string $fontfile , string $text )

	
	// Get your Text Width and Height
	$text_width  = abs($bbox[2])-abs($bbox[0]);
	$text_height = abs($bbox[7])-abs($bbox[1]);	

	// Calculate coordinates of the text
	$x = ($image_width/2)  - ($text_width/2) 	+ $offsetX ;
	$y = ($image_height/2) - ($text_height/2);	// + $offsetY ;	
	
	//calculate y baseline
	$y = $baseline = abs($font_size/2 - ($image_height) )+ $offsetY ;

/*
	echo "<pre>";
	echo " font_size: $font_size"."<br>";
	echo " image_height: $image_height"."<br>";
	echo " text_height: $text_height"."<br>";
	echo " --- Calculo: ".($font_size/2 - ($image_height) ) ."<br>";
	echo " baseline: $baseline"."<br>";
	echo " x: $x"."<br>";
	echo " y. $y<br>";
	$middle = abs($bbox[7])-abs($bbox[1]);
	print_r($middle);
	print_r($text);
	print_r($font_size);
	print_r($angle);
	var_dump($bbox); 
	echo "</pre>";
	die();
*/

	
	# This is our cordinates for X and Y
	#$x = $bbox[0] + $centroXimg  - ($bbox[2] / 2)	+ $offsetX ;
	#$y = $bbox[1] + $centroYimg  - ($bbox[6] / 2)	+ $offsetY ; 	
		
	# Write it text1
	# Add the text
	$imgText  = imagettftext($im, $font_size , $angle, $x, $y, $colorText, $fontfile, $text );	
				# Verify if it failed
				if ($imgText===false) {
					imagestring($im, 1, 5, 5, "Error $text1", 0);
				}	
}//end if($text!==false) {


# Enable interlancing
imageinterlace($im, true);


# HEADERS
/**/
header("Cache-Control: private, max-age=10800, pre-check=10800");
header("Pragma: private");
header("Expires: " . date(DATE_RFC822,strtotime(" 200 day")));

# No cache header
#header("Cache-Control: no-cache, must-revalidate");

# Output to browser
header('Content-Type: image/png;');
imagepng($im);

# On finish destroy
imagedestroy($im);
?>