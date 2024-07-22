<?php
// Turn off output buffering
	ini_set('output_buffering', 'off');

// set some time Important!
	$myDateTimeZone = 'Europe/Madrid';
	date_default_timezone_set($myDateTimeZone);

// text check
	$text = $_GET['id'] ?? false;
	if (empty($text)) {
		die("text var is mandatory!");
	}



/**
* TAG_SAFE_XSS
* @param string $value
* @return string $value
*/
function tag_safe_xss(string $value) : string {

	if (!empty($value)) {

		if ($decode_json=json_decode($value)) {
			// If var is a stringify JSON, not verify string now
		}else{
			$value = strip_tags($value,'<br><strong><em>');
			$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
		}
	}

	return $value;
}//end tag_safe_xss

// clean variable
$text = tag_safe_xss($text);

// Text to display
$text = trim(stripslashes(urldecode($text)));
$text = strip_tags($text, '');

// tag type
	$tag_image_dir = dirname(dirname(dirname(__FILE__))) . '/themes/default/tag_base';
	$type = false;
	$fill_color = new stdClass();
		$fill_color->n = '#FFaa00'; // normal state
		$fill_color->d = '#3e8fed'; // delete state
		$fill_color->r = '#e04a26';	// review state

	$icon_color = new stdClass();
		$icon_color->n = '#000000'; // normal state
		$icon_color->d = '#ffffff'; // delete state
		$icon_color->r = '#ffffff'; // review state

	switch (true) {
		case (strpos($text,'[TC_')!==false):
			$type			= 'tc';
			$pattern		= "/\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?)_TC\]/";
			$text_original	= $text;
			preg_match_all($pattern, $text, $matches);
			$text			= $matches[1][0];
			$imgBase		= $tag_image_dir . '/tc_ms-x2.png';
			break;

		case (strpos($text,'[index-')!==false || strpos($text,'[/index-')!==false):
			$type			= 'index';
			$pattern		= "/\[\/{0,1}(index)-([a-z])-([0-9]{1,6})(-(.{0,22}))?(-data:(.*?):data)?\]/";
			$text_original	= $text;
			preg_match_all($pattern, $text, $matches);
			$n				= $matches[3][0];
			$state			= $matches[2][0];
			if(strpos($text_original,'/')!==false) {
				// mode [/index-u-6]
				$text 		= " $n";
				$imgBase 	= $tag_image_dir."/indexOut-{$state}-x2.png";
			}else{
				// mode [index-u-1]
				$text 		= $n;
				$imgBase 	= $tag_image_dir."/indexIn-{$state}-x2.png";
			}
			break;

		case (strpos($text,'[draw-')!==false):
			$type = 'draw' ;
			// mode [draw-n-1-data:***]
			$state = substr($text,6,1);

			$last_minus	= strrpos($text, '-');
			$pattern	= "/\[(draw)-([a-z])-([0-9]{1,6})-(.{0,22})\]/";
			preg_match($pattern, $text, $matches);
			$text		= $matches[4];
			// $imgBase	= $tag_image_dir."/draw-{$state}-x2.png";

			$path = strlen($text)>3
				? '"M73.22,30H14.85C6.74,30,0.17,23.43,0.17,15.32v-0.64C0.17,6.57,6.74,0,14.85,0l58.37,0 c8.11,0,14.68,6.57,14.68,14.68v0.64C87.91,23.43,81.33,30,73.22,30z"'
				: '"M61.15,30H14.88C6.77,30,0.19,23.43,0.19,15.32v-0.64C0.19,6.57,6.77,0,14.88,0l46.27,0 c8.11,0,14.68,6.57,14.68,14.68v0.64C75.83,23.43,69.26,30,61.15,30z"';
			$x_length = strlen($text)>3
				? 88
				: 76;
			$x_text_position = strlen($text)>3
				? 28
				: 30;

			$svg_content = '
			<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 '.$x_length .' 30" enable-background="new 0 0 '.$x_length.' 30" xml:space="preserve">
				<g id="base">
					<path fill="'.$fill_color->$state.'" d='.$path.'/>
					<path fill="'.$icon_color->$state.'" d="m14.86 5.9c-0.97 0-1.92 0.09-2.84 0.4-5.39 1.81-7.99 6.89-8.16 7.32-0.16 0.43-0.25 0.77-0.25 1.02s0.08 0.59 0.25 1.02c0.16 0.43 3.42 7.71 10.99 7.71 8.01 0 10.83-7.28 10.99-7.71s0.25-0.77 0.25-1.02-0.08-0.59-0.25-1.02c-0.16-0.43-2.77-5.39-8.16-7.32-0.89-0.33-1.85-0.4-2.82-0.4zm-5.09 4.68c0.18-0.18 0.28-0.25 0.32-0.21s0.01 0.16-0.09 0.39c-0.29 0.67-0.44 1.37-0.44 2.1 0 1.46 0.52 2.71 1.56 3.75s2.29 1.56 3.75 1.56 2.71-0.52 3.75-1.56 1.56-2.29 1.56-3.75c0-0.7-0.14-1.37-0.41-2.01-0.09-0.22-0.12-0.35-0.08-0.39s0.14 0.04 0.31 0.21c0.82 0.81 1.77 1.9 2.83 3.25 0.15 0.19 0.24 0.43 0.27 0.72 0.02 0.29-0.03 0.54-0.16 0.75-0.26 0.42-3.18 5.6-8.06 5.6-5.39 0-7.8-5.16-8.06-5.58-0.13-0.21-0.18-0.46-0.16-0.75s0.11-0.53 0.25-0.73c1.04-1.39 2-2.5 2.86-3.35zm7.78 1.8 0.62 0.64c0.18 0.18 0.29 0.4 0.34 0.68s0.03 0.52-0.08 0.73c-0.44 0.8-0.98 1.48-1.64 2.05-0.19 0.15-0.42 0.22-0.68 0.19-0.27-0.02-0.48-0.12-0.65-0.3l-0.62-0.6c-0.16-0.18-0.24-0.37-0.22-0.59s0.11-0.42 0.29-0.59c0.52-0.52 1.04-1.21 1.57-2.07 0.13-0.21 0.29-0.33 0.49-0.35s0.4 0.05 0.58 0.21z"/>
				</g>
				<g id="text">
					<text x="'.$x_text_position.'" y="23" fill="#ffffff" font-family="sans-serif" font-weight="600" font-size="24px" letter-spacing="-.50px">'.$text.'</text>
				</g>
			</svg>
			';
			header("Cache-Control: private, max-age=10800, pre-check=10800");
			header("Pragma: private");
			header("Expires: " . date(DATE_RFC822,strtotime(" 200 day")));

			// No cache header
			// header("Cache-Control: no-cache, must-revalidate");

			// Output to browser
			// header('Content-Length: '.strlen($file_content));
			header('Content-Type: image/svg+xml');
			// header('Content-Length: '.filesize($file_path));
			// header('Accept-Ranges: bytes');
			header('Vary: Accept-Encoding');
			// fpassthru( $file_path );
			header('Connection: close');
			echo $svg_content;
			die();

			break;

		case (strpos($text,'[geo-')!==false):
			$type = 'geo';
			// mode [geo-n-1-data:***]
			$state 		= substr($text,5,1);
			$last_minus = strrpos($text, '-');
			$ar_parts 	= explode('-', $text);
			$text 		= $ar_parts[2];
			$imgBase 	= $tag_image_dir."/geo-{$state}-x2.png";
			break;

		case (strpos($text,'[page-')!==false):
			$type = 'page';
			// mode [page-n-1-77]
			$pattern		= "/\[(page)-([a-z])-([0-9]{1,6})-(.{0,22})?\]/";
			$text_original	= $text;
			preg_match_all($pattern, $text, $matches);
			$text			= $matches[3][0]; //$matches[3][0]
			$state			= $matches[2][0];
			$imgBase		= $tag_image_dir."/page-{$state}-x2.png";
			break;

		case (strpos($text,'[person-')!==false):
			$type = 'person';
			// ex. [person-a-1-El%20in]
			$pattern		= "/\[(person)-([a-z])-([0-9]{1,6})-(.{0,22})\]/";
			$text_original	= $text;
			preg_match_all($pattern, $text, $matches);
			$text = isset($matches[4][0])
				? urldecode($matches[4][0])
				: '...';
			$state = $matches[2][0] ?? 'a';
			if($state!=='a' && $state!=='b') {
				$state = 'a';
			}
			$imgBase = $tag_image_dir."/person-{$state}-x2.png";
			break;

		case (strpos($text,'[note-')!==false):
			$type = 'note';
			// mode [note-0-name-data:locator_flat:data]
			$ar_parts	= explode('-', $text);
			$state		= $ar_parts[1];
			$text		= urldecode($ar_parts[2]);
			$imgBase	= $tag_image_dir."/note-{$state}-x2.png";
			break;

		case (strpos($text,'[lang-')!==false):
			$type = 'lang';
			// mode [lang-n-1-English]
			$pattern		= "/\[(lang)-([a-z])-([0-9]{1,6})-(\D{0,22})\]/";
			$text_original	= $text;
			preg_match_all($pattern, $text, $matches);
			$text			= urldecode($matches[4][0]);
			$state			= $matches[2][0];
			$imgBase		= $tag_image_dir."/lang-{$state}-x2.png";
			break;

		// locator case, used by svg or image or video, etc...
		case (strpos($text,'{')===0):
			$changed_text = str_replace(['&#039;','\''],'"', $text);
			$locator = json_decode($changed_text);
			if(!$locator) {
				error_log('Ignored bad locator from text:' . $text);
				return;
			}
			include(dirname(dirname(dirname(dirname(__FILE__)))).'/config/config.php');
			$section_tipo	= $locator->section_tipo;
			$section_id		= $locator->section_id;
			$component_tipo	= $locator->component_tipo;
			$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			// read the physical file (usually svg)
				$file_content = $component->get_file_content();

			// throw file contents with proper headers
				header("Cache-Control: private, max-age=10800, pre-check=10800");
				header("Pragma: private");
				header("Expires: " . date(DATE_RFC822,strtotime(" 200 day")));

				// No cache header
				// header("Cache-Control: no-cache, must-revalidate");

				// Output to browser
				// header('Content-Length: '.strlen($file_content));
				header('Content-Type: image/svg+xml');
				// header('Content-Length: '.filesize($file_path));
				// header('Accept-Ranges: bytes');
				header('Vary: Accept-Encoding');
				// fpassthru( $file_path );
				header('Connection: close');
				echo $file_content;

			// stop here
				exit;
			break;

		default:
			error_log("Error: Need type ..! <br>$text");
			die("Need type ..! <br>$text");
			break;
	}

// Text formatting in 1 or 2 lines depending on the number of characters
	// $maxchar	= 16 ;
	$width		= 66 ; 	# 88
	$angle		= 0;	# 0
	$x			= 0 ;	# 0
	$y			= 0 ;	# 0

// Attempt to open. We create an image from the base image ($imgBase)
	$im = @imagecreatefrompng($imgBase);

// See if it failed
	if(!$im) {
		error_log("Error. invalid im. type:". gettype($im) .' - REQUEST_URI: '.json_encode($_SERVER["REQUEST_URI"], JSON_PRETTY_PRINT));

		// Create a blank image
		$im  = imagecreatetruecolor(150, 30);
		$bgc = imagecolorallocate($im, 255, 255, 255);
		$tc  = imagecolorallocate($im, 0, 0, 0);

		imagefilledrectangle($im, 0, 0, 150, 30, $bgc);

		// Output an error message
		imagestring($im, 1, 5, 5, 'Error loading bogus.image', $tc);

		header('Content-Type: image/png');

		imagepng($im);
		imagedestroy($im);

		die();
	}

// Define colors
	$black	= imagecolorallocate($im, 0, 0, 0);
	$white	= imagecolorallocate($im, 255, 255, 255);
	$grey	= imagecolorallocate($im, 188, 188, 188);
	$colorH	= imagecolorallocate($im, 141, 198, 63);
	$colorH	= imagecolorallocate($im, 0, 232, 0);
	$colorP	= imagecolorallocate($im, 0, 167, 157);

// Font config defaults
	$font_name 	= '/san_francisco/System_San_Francisco_Display_Regular.ttf';
	$font_size 	= 8;

	switch($type) {

		case 'tc'	:
			$colorText	= $colorH ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2; // as 18
			break;

		case 'index':
			$colorText	= $black ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2; // as 18
			if($state==='n') $colorText	= $white ;
			break;

		case 'draw':
			$colorText	= $white ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2;
			break;

		case 'geo':
			$colorText	= $white ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2;
			if($state==='n') $colorText	= $white ;
			break;

		case 'page':
			$colorText	= $black ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2;
			break;

		case 'person':
			$colorText	= $black ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2; // as 18
			break;

		case 'note':
			$colorText	= $black ;
			$colorBG	= $white ;
			$font_size	= ($font_size *2)+2; // as 18
			break;

		case 'lang':
			$colorText	= $black ;
			$colorBG	= $black ;
			$font_size	= ($font_size *2)+2;
			break;
	}

// We activate the alpha channel (24bit png)
	imageAlphaBlending($im, true);
	imageSaveAlpha($im, true);

// Making Image Transparent
// imagecolortransparent($im,$colorBG);

// font files . path to our font file
	$path_fonts	= dirname(dirname(dirname(__FILE__))) . '/themes/default/fonts';
	$fontfile	= $path_fonts . $font_name;

// offset
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

		case 'draw':
			$offsetY = 2;
			$offsetX = 10;
			break;
		case 'page':
			$offsetY = 2;
		case 'person':
			$offsetX = 8;
			break;

		case 'lang':
			$offsetY = 2;
			$offsetX = 10;
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

// custom offset for mac development
	if (PHP_OS==='Darwin') {

		$offsetX = -1;

		switch ($type) {
			case 'tc':
			case 'index':
				break;

			case 'draw':
				$offsetY = 2;
				$offsetX = 10;
				break;
			case 'page':
			case 'person':
				$offsetX = 8;
				break;

			case 'lang':
				$offsetX = 10;
				break;

			case 'geo':
				$offsetX = 7;
				break;

			case 'note':
				$offsetX = 0;
				break;
		}
	}//end if (PHP_OS==='Darwin')

// background. Set the background to be white
	// $bg = imagefilledrectangle($im, 0, 0, $width, $width, $colorBG); //( resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color )

// Get image Width and Height
	$image_width	= imagesx($im);
	$image_height	= imagesy($im);
	// $centroXimg	= $image_width / 2;
	// $centroYimg	= $image_height / 2;

// image
	if($text!==false) {

		// First we create our bounding box for the first text
		// Get Bounding Box Size
		$bbox = imagettfbbox($font_size, $angle, $fontfile, $text ); //( float $size , float $angle , string $fontfile , string $text )

		// Get your Text Width and Height
		$text_width		= abs($bbox[2])-abs($bbox[0]);
		$text_height	= abs($bbox[7])-abs($bbox[1]);

		// Calculate coordinates of the text
		$x = intval( ($image_width/2)  - ($text_width/2) 	+ $offsetX) ;
		$y = intval( ($image_height/2) - ($text_height/2) );	// + $offsetY ;

		// calculate y baseline
		$y = $baseline = abs($font_size/2 - ($image_height) ) + $offsetY ;

		// This is our coordinates for X and Y
		// $x = $bbox[0] + $centroXimg  - ($bbox[2] / 2)	+ $offsetX ;
		// $y = $bbox[1] + $centroYimg  - ($bbox[6] / 2)	+ $offsetY ;

		// Write it text1
		// Add the text
		$imgText  = imagettftext($im, $font_size , $angle, $x, $y, $colorText, $fontfile, $text );
		// Verify if it failed
		if ($imgText===false) {
			imagestring($im, 1, 5, 5, "Error $text1", 0);
		}
	}//end if($text!==false)

// Enable interlacing
	imageinterlace($im, true);

// headers
	header("Cache-Control: private, max-age=10800, pre-check=10800");
	header("Pragma: private");
	header("Expires: " . date(DATE_RFC822,strtotime(" 200 day")));

// No cache header
	// header("Cache-Control: no-cache, must-revalidate");

// Output to browser
	header('Content-Type: image/png;');
	header('Connection: close');
	imagepng($im);

// On finish, destroy used image
	imagedestroy($im);
