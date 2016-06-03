<?php
# set some time Important!
$myDateTimeZone = 'Europe/Madrid';
date_default_timezone_set($myDateTimeZone);


#
# TEXT
$text = false;

# TEXT STRING . Get last directory in $PATH
if( !$text = substr(strrchr($_SERVER["REQUEST_URI"], ".php/"), 5) ) {
	die("Need text!");
}

# Text to show
$text = trim(stripslashes(urldecode($text)));
$text = strip_tags($text, '');



#
# TAG TYPE
$type = false;
switch (true) {
	case (strpos($text,'[index-') !== false || strpos($text,'[/index-') !== false):
		$type = 'index' ;
		break;
	case (strpos($text,'[TC_')!==false):
		$type = 'tc' ;
		break;
	case (strpos($text,'[svg-')!==false):
		$type = 'svg' ;
		break;
	case (strpos($text,'[geo-')!==false):
		$type = 'geo' ;
		break;
	case (strpos($text,'[page-')!==false):
		$type = 'page' ;
		break;
	default:
		die("Need type!");
		break;
}
if(!$type) die("Need type!");

# TAG PARTS . Format text apperance and background image
switch($type) {
		
	case 'svg'	: 		# mode [svg-n-1-data:***]
						$state 		= substr($text,5,1);
						$last_minus = strrpos($text, '-');
						$ar_parts 	= explode('-', $text);
						$text 		= $ar_parts[2];
						$imgBase 	= "../images/btn_base/svg-{$state}.png";
						break;

	case 'geo'	: 		# mode [geo-n-1-data:***]
						$state 		= substr($text,5,1);
						$last_minus = strrpos($text, '-');
						$ar_parts 	= explode('-', $text);
						$text 		= $ar_parts[2];
						$imgBase 	= "../images/btn_base/geo-{$state}.png";
						break;

	case 'page'	: 		# mode [page-n-1]
						$state 		= substr($text,6,1);						
						$ar_parts 	= explode('-', $text);
						$text 		= substr($ar_parts[2],0,-1);
						$imgBase 	= "../images/btn_base/page-{$state}.png";
						break;

	case 'index':	if(strpos($text,'/')) {
						# mode [/index-u-6]
						$n 			= substr($text,10,-1);
						$state 		= substr($text,8,1);
						$text 		= " $n";						
						$imgBase 	= "../images/btn_base/indexOut-{$state}.png";
					}else{
						# mode [index-u-1]
						$n 			= substr($text,9,-1);
						$state 		= substr($text,7,1);	
						$text 		= "$n";						
						$imgBase 	= "../images/btn_base/indexIn-{$state}.png";
					}					
						break;

	case 'tc'	: 		$text 		= substr($text,4,8);
						$imgBase 	= "../images/btn_base/tc.png";
						break;
}
#print_r($text);die();


# Text formatting in 1 or 2 lines depending on the number of characters
$maxchar 	= 16 ;
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
$colorP		= imagecolorallocate($im, 0, 167, 157);


# Font config defaults
$font_name 	= '/liberation/LiberationSans-Regular.ttf';
$font_size 	= 8;

switch($type) {
	
	case 'index':	$colorText	= $black ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88

					if($state=='n') $colorText	= $white ;
					break;
					
	case 'tc'	:	$colorText	= $colorH ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 8  ; # 11 o 10.88
					break;

	case 'svg':		$colorText	= $black ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88

	case 'geo':		$colorText	= $black ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88

					if($state=='n') $colorText	= $white ;
					break;

	case 'page':	$colorText	= $black ;
					$colorBG 	= $black ;
					#$font_name	= $font; // --
					#$font_size	= 7.9  ; # 11 o 10.88					
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
$offsetX	= 3 ; # 0
$offsetY	= 4 ; # 5

switch ($type) {
	case 'svg':
	case 'page':
		$offsetX = 7;
		break;
	case 'geo':
		$offsetX = 7;
		break;
	case 'index':
		$offsetX = 2;
		break;
	case 'tc':
		$offsetX = 2;
		$offsetY = 3;
		break;
}

# CUSTOM OFFSET FOR MAC DEVELOPMENT
if (strpos($_SERVER['HTTP_HOST'], '8888')!==false) {
	$offsetX	= 1 ; # 0
	$offsetY	= 5 ; # 5

	switch ($type) {
		case 'svg':
		case 'page':
			$offsetX = 7;
			break;
		case 'geo':
			$offsetX = 7;
			break;
		case 'index':
			break;
	}
}//end if (DEDALO_ENTITY=='development')


# BACKGROUND. Set the background to be white
#$bg = imagefilledrectangle($im, 0, 0, $width, $width, $colorBG); //( resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color )


$centroXimg = imagesx($im) / 2;
$centroYimg	= imagesy($im) / 2;


if($text) {

	# First we create our bounding box for the first text
	$bbox = imagettfbbox($font_size, $angle, $fontfile, $text ); //( float $size , float $angle , string $fontfile , string $text )
	
	# This is our cordinates for X and Y
	$x = $bbox[0] + $centroXimg  - ($bbox[2] / 2)	+ $offsetX ;
	$y = $bbox[1] + $centroYimg  - ($bbox[6] / 2)	+ $offsetY ; 	
		
	# Write it text1
	$imgText = imagettftext($im, $font_size , $angle, $x, $y, $colorText, $fontfile, $text );
	
	# Verify if it failed
	if (!$imgText) {
		imagestring($im, 1, 5, 5, "Error $text1", 0);
	}	
}

# Enable interlancing
imageinterlace($im, true);

# HEADERS
header("Cache-Control: private, max-age=10800, pre-check=10800");
header("Pragma: private");
header("Expires: " . date(DATE_RFC822,strtotime(" 200 day")));

# Output to browser
header('Content-Type: image/png;');
imagepng($im);

# On finish destroy
imagedestroy($im);
?>