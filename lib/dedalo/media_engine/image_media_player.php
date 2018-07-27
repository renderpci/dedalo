<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');


if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print dd_error::wrap_error($string_error);
	die();
}
#die("<span class='error'> Auth error: please login </span>");


# set vars
$vars = array('image_id','quality','modo','aditional_path','initial_media_path');
foreach($vars as $name) $$name = common::setVar($name);


# ImageObj		
$ImageObj = new ImageObj($image_id, $quality, $aditional_path, $initial_media_path);
	
	

# QUALITY SELECTOR 
$quality_selector_html	= null;
$ar_valid 				= $ImageObj->get_ar_quality_with_file();	#dump($ar_valid);
$selectedItem 			= $quality;
if(sizeof($ar_valid)>1) {
	$file = DEDALO_LIB_BASE_PATH .'/media_engine/html/image_media_player_quality_selector.phtml';
	ob_start();
	include ( $file );
	$quality_selector_html =  ob_get_contents();
	ob_get_clean();
}


#$img_url = $ImageObj->get_url();

$maxWidht 	= 1024 ;
$maxHeight 	= 768  ;
$img_url	= $ImageObj->get_thumb_url($maxWidht, $maxHeight);
	

$inicio_title 	= 'Inicio';
$recargar_title = 'Recargar';


# JAVASCRIPT LINKS
		$js_link_code	= js::get_js_link_code();

# CSS LINKS		
		$css_link_code	= css::get_css_link_code();

# LOAD VISTA TEMPLATE CODE
$page_html	= DEDALO_LIB_BASE_PATH .'/media_engine/html/image_media_player.phtml';
include($page_html);
?>