<?php
/*
# HEADERS FOR ALLOW CACHE THIS PAGE 
Header("Cache-Control: must-revalidate");
$offset = 60 * 60 * 24 * 3;
$ExpStr = "Expires: " . gmdate("D, d M Y H:i:s", time() + $offset) . " GMT";
Header($ExpStr);
*/
/**/




require_once( dirname(dirname(dirname(__FILE__))).'/config/config4.php');


#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','fichaID','show_mode','w','h','shoot');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
if(empty($mode)) {
	$mode = 'show_images'; # default mode is used
	#exit( Error::wrap_error("Trigger error: invalid mode..",false,'warning') );
}



/**
* SHOW_IMAGES 
* Filemaker la usa para mostrar las imágenes de las ficha de Inventario del MUPREVA
* URL: Llamar como : http://www.museodeprehistoria.es/dedalo/mupreva/?fichaID=73
*/
if($mode=='show_images') {	

	/*
	# Using only '?' in url like ../mupreva/?1 . If isset, fichaID is $_SERVER['argv'][0]
	# print_r($_SERVER['argv']);
	if(!empty($_SERVER['argv'][0])){
		$fichaID = $_SERVER['argv'][0];
	}
	*/

	# fichaID DATA VERIFY
	if(empty($fichaID)) exit( Error::wrap_error("Trigger Error: fichaID is mandatory",false,'warning') );

	# show_mode DATA VERIFY
	if(empty($show_mode)) $show_mode = 'edit';
	#echo $fichaID;

	# DIFFUSION_MUPREVA_FICHA_FM
	$diffusion_mupreva_ficha_fm = new diffusion_mupreva_ficha_fm( (int)$fichaID, $show_mode );

	# Add params (dimensions, etc) if received
	# Image width
	if(!empty($w)) $diffusion_mupreva_ficha_fm->image_widht  = $w;
	# Image height
	if(!empty($h)) $diffusion_mupreva_ficha_fm->image_height = $h;
	# Shoot
	if(!empty($shoot)) $diffusion_mupreva_ficha_fm->shoot 	 = $shoot;


	$html = $diffusion_mupreva_ficha_fm->get_html();
		#dump($html,'$html');

	# HEADERS FOR ALLOW CACHE THIS PAGE 
	header("Cache-Control: private, max-age=10800, pre-check=10800");
	header("Pragma: private");
	header("Expires: " . date(DATE_RFC822,strtotime(" 120 day")));
	header('Content-Type: text/html');

	print $html;

	exit();

}#end show_images



?>