<?php #session_start();
# set some time Important!
$myDateTimeZone = 'Europe/Madrid';
date_default_timezone_set($myDateTimeZone);

#ini_set('error_reporting', E_ALL ^ E_NOTICE);
#ini_set('display_errors', 1);

#
# TEXT
$text = false;
#if(isset($_REQUEST['t'])) $text = $_REQUEST['t'];
// get last directory in $PATH
$text = substr(strrchr($_SERVER["REQUEST_URI"], ".php/"), 5);
	#die($text);
if(!$text) die("Need text!");


$text = trim(stripslashes(urldecode($text)));	// Texto a mostrar
$text = strip_tags($text, '');

#
# TYPE
$type = false;
if(strpos($text,'[index-') !== false || strpos($text,'[/index-') !== false) 
	$type = 'index' ;
else if(strpos($text,'[TC_') !== false)
	$type = 'tc' ;
else if(strpos($text,'[svg-') !== false)
	$type = 'svg' ;
else if(strpos($text,'[geo-') !== false)
	$type = 'geo' ;
else if(strpos($text,'[page-') !== false)
	$type = 'page' ;

if(!$type) die("Need type!");

# reformat text apperance
# background image
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


# Formateo del texto en 1 o 2 líneas en función de la cantidad de caracteres
$maxchar 	= 16 ;
$width 		= 66 ; 	# 88
$angle 		= 0;		# 0
$x 			= 0 ;		# 0
$y 			= 0 ;		# 0


# Creamos una imagen a partir de la imagen base ($imgBase)
$im = imagecreatefrompng($imgBase);


# definimos colores
$black 		= imagecolorallocate($im, 0, 0, 0);
$white 		= imagecolorallocate($im, 255, 255, 255);
$grey 		= imagecolorallocate($im, 188, 188, 188);
$colorH 	= imagecolorallocate($im, 141, 198, 63);
$colorP		= imagecolorallocate($im, 0, 167, 157);

# font color
switch($type) {
	
	case 'index':	$colorText	= $black ;
					$colorBG 	= $black ;
					$fontname	= 'arial.ttf'; // --
					$fontsize	= 7.9  ; # 11 o 10.88

					if($state=='n') $colorText	= $white ;
					break;
					
	case 'tc'	:	$colorText	= $colorH ;
					$colorBG 	= $black ;
					$fontname	= 'arial.ttf'; // --
					$fontsize	= 7.9  ; # 11 o 10.88
					break;

	case 'svg':		$colorText	= $black ;
					$colorBG 	= $black ;
					$fontname	= 'arial.ttf'; // --
					$fontsize	= 7.9  ; # 11 o 10.88

	case 'geo':		$colorText	= $black ;
					$colorBG 	= $black ;
					$fontname	= 'arial.ttf'; // --
					$fontsize	= 7.9  ; # 11 o 10.88

					if($state=='n') $colorText	= $white ;
					break;

	case 'page':	$colorText	= $black ;
					$colorBG 	= $black ;
					$fontname	= 'arial.ttf'; // --
					$fontsize	= 7.9  ; # 11 o 10.88					
}

# activamos el alpha (24bit png)
imageAlphaBlending($im, true);
imageSaveAlpha($im, true);

#imagecolortransparent($im,$colorBG); // Making Image Transparent 

// Path to our font file
$pathFonts 	= "../lib/fonts/truetype/";


$fontfile	= $pathFonts . $fontname ;

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

# CUSTOM OFFSET FOR MAC
if (strpos($_SERVER['HTTP_HOST'], '8888')!==false) {
	$offsetX	= 0 ; # 0
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
}//end if (strpos($_SERVER['HTTP_HOST'], '8888')!==false)


// Set the background to be white
#$bg = imagefilledrectangle($im, 0, 0, $width, $width, $colorBG); //( resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color )

$centroXimg = imagesx($im) / 2;
$centroYimg	= imagesy($im) / 2;


if($text) {	
	# First we create our bounding box for the first text
	$bbox = imagettfbbox($fontsize, $angle, $fontfile, $text ); //( float $size , float $angle , string $fontfile , string $text )
	
	# This is our cordinates for X and Y
	$x = $bbox[0] + $centroXimg  - ($bbox[2] / 2)	+ $offsetX ;
	$y = $bbox[1] + $centroYimg  - ($bbox[6] / 2)	+ $offsetY ; 
	
		
	// Write it text 1	
	$imgText = imagettftext($im, $fontsize , $angle, $x, $y, $colorText, $fontfile, $text );
	
	// Verificamos si se ha creado correctamente
	if (!$imgText) { /* See if it failed */
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

imagedestroy($im);
?>