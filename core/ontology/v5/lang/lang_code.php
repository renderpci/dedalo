<?php
// D3 COMPATIBILY


// SYNC LANG
	// $lang = $_SESSION['lang'] = tools::convert_d4_to_d3_lang(DEDALO_APPLICATION_LANG);
$lang = $_SESSION['lang'] = lang::get_alpha2_from_code(DEDALO_APPLICATION_LANG);


// path to file
	$lang_file	= $lang;
	$lang_path	= dirname(__FILE__) . '/'.$lang_file.'.php';


// load lang file
	if(!include_once $lang_path) {
		$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
		$msg = "$codHeader Dedalo Language '$lang' is not defined! ";
		// debug
		if(SHOW_DEVELOPER===true) {
			$msg .= '<br>lang_path: '.$lang_path;
			$msg .= "<br><a href=\"javascript:top.location='?lang=lg-eng';\"> Back </a>";
		}

		die($msg);
	}
