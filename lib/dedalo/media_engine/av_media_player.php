<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVPlayer.php');


if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}
#die("<span class='error'> Auth error: please login </span>");


# set vars
$vars = array('reelID','quality','tcin','tcout','media','modo');
foreach($vars as $name) $$name = common::setVar($name);	

#dump($_REQUEST, ' _REQUEST');





if($media=='audio') $quality = 'audio';

# AVOBJ		
$AVObj = new AVObj($reelID, $quality, $tcin, $tcout);

# POSTERFRAME	
$PosterFrameObj = new PosterFrameObj($reelID);
	

	# Si no existe el fichero default quality, lo intentaremos con alguno que exista, empezando por la calidad más alta
	$file_path = $AVObj->get_media_path_abs() . $AVObj->get_name() .'.'. $AVObj->get_extension();	#dump($file_path, ' file_path');
	if (!file_exists($file_path)) {
		$ar_valid	= $AVObj->get_ar_quality_with_file();
		if (!empty($ar_valid[0])) {
			$quality = $ar_valid[0];
			$AVObj->set_quality($quality);			
		}		
	}


	#
	# QUALITY SELECTOR 
	$quality_selector_html	= null;
	$ar_valid 				= $AVObj->get_ar_quality_with_file();	#dump($ar_valid);
	$selectedItem 			= $quality;
	if(sizeof($ar_valid)>1) {
		$file = DEDALO_LIB_BASE_PATH .'/media_engine/html/av_media_player_quality_selector.phtml';
		ob_start();
		include ( $file );
		$quality_selector_html =  ob_get_contents();
		ob_get_clean();
	}


	#
	# PLAYER
	$AVPlayer	= new AVPlayer($AVObj);
	if(SHOW_DEBUG) {
		#dump($AVObj, ' AVPlayer');
	}
	#$AVPlayer->set_autoplay('autoplay');
	$player_type 		= 'qt';
	if(isset($_REQUEST['player_type'])) {
		$player_type 	= $_REQUEST['player_type'];
		$_SESSION['player_type'] = $player_type;		
	}else if(isset($_SESSION['player_type'])) {		
		$player_type 	= $_SESSION['player_type'];		
	}
	$player = $AVPlayer->build_player($player_type, 1);	
	

	
	#
	# CONFIGURE KEYS 
	$configure_keys_html	= null;
		$file = DEDALO_LIB_BASE_PATH .'/media_engine/html/av_media_player_configure_keys.phtml';
		ob_start();
		include ( $file );
		$configure_keys_html =  ob_get_contents();
		ob_get_clean();
	



$inicio_title 	= 'Inicio';
$recargar_title = 'Recargar';


# JAVASCRIPT LINKS
		$js_link_code	= js::get_js_link_code();

# CSS LINKS		
		$css_link_code	= css::get_css_link_code();

# LOAD VISTA TEMPLATE CODE
$page_html	= DEDALO_LIB_BASE_PATH .'/media_engine/html/av_media_player.phtml';
include($page_html);
?>