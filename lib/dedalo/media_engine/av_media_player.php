<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVPlayer.php');

$share = isset($_GET['share']) ? safe_xss($_GET['share']) : false;
if ($share) {

	# Decode vars
	$share_decoded = base64_decode($share);

	if(SHOW_DEBUG===true) {
		#dump($share_decoded, 'DEBUG INFO: share ++ '.to_string());
	}	

	parse_str($share_decoded);

	$_REQUEST['player_type'] = 'mediaelement';	// Overwrite request var

}else{

	# Login is mandatory
	if(login::is_logged()!==true) {
		$string_error = "Auth error: please login";
		print dd_error::wrap_error($string_error);
		die();
	}

	# set vars
	$vars = array('reelID','quality','tcin','tcout','media','modo','vbegin','vend');
		foreach($vars as $name) $$name = common::setVar($name);

	#
	# SHARE VIDEO
		#dump($_SERVER , '$_SERVER  ++ '.to_string());
		$base_url  		= $_SERVER['PHP_SELF'];		// Like '/dedalo4/lib/dedalo/media_engine/av_media_player.php'
		$url_query 		= $_SERVER['QUERY_STRING'];	// Like 'reelID=rsc35_rsc167_3&quality=404&top_tipo=rsc167&top_id='
		$url_query_b64 	= base64_encode($url_query);

		$url_public 	= 'http://'.$_SERVER['HTTP_HOST'].$base_url.'?share='.$url_query_b64;
			#dump($url_public, ' url_public ++ '.to_string( ));

}//end if ($share) {

if(!isset($tcin))  $tcin  = false;
if(!isset($tcout)) $tcout = false;
if(!isset($tcin))  $tcin  = false;
if(!isset($media)) $media = false;

if($media=='audio') $quality = 'audio';



# AVOBJ		
$AVObj = new AVObj($reelID, $quality, $tcin, $tcout);

# POSTERFRAME	
$PosterFrameObj = new PosterFrameObj($reelID);
	

	#
	# QUALITY FALLBACK
	# Si no existe el fichero default quality, lo intentaremos con alguno que exista, empezando por la calidad más alta
	$file_path = $AVObj->get_media_path_abs() . $AVObj->get_name() .'.'. $AVObj->get_extension();	#dump($file_path, ' file_path');
	if (!file_exists($file_path)) {
		$ar_valid	= $AVObj->get_ar_quality_with_file();
		if (!empty($ar_valid[0])) {
			
			$quality = $ar_valid[0];
			$AVObj->set_quality($quality);

		}else{

			$locator = explode("_", $reelID);
			$component_tipo = $locator[0];
			$section_tipo = $locator[1];
			$section_id = $locator[2];

			header("Location: ".DEDALO_LIB_BASE_URL."/main/?m=tool_upload&t=".$component_tipo."&parent=".$section_id."&section_tipo=".$section_tipo."&quality=original");
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
	if(SHOW_DEBUG===true) {
		#dump($AVObj, ' AVPlayer');
	}
	#$AVPlayer->set_autoplay('autoplay');
	$player_type 		= 'qt';
	if(isset($_REQUEST['player_type'])) {
		$player_type 	= safe_xss($_REQUEST['player_type']);
		$_SESSION['player_type'] = $player_type;		
	}else if(isset($_SESSION['player_type'])) {		
		$player_type 	= $_SESSION['player_type'];		
	}
	$player = $AVPlayer->build_player($player_type, 1);	
	

	
	#
	# CONFIGURE KEYS 
	$configure_keys_html	= null;
		/*
		$file = DEDALO_LIB_BASE_PATH .'/media_engine/html/av_media_player_configure_keys.phtml';
		ob_start();
		include ( $file );
		$configure_keys_html =  ob_get_contents();
		ob_get_clean();
		*/



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