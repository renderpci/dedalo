<?php
# D3 COMPATIBILY


# SYNC LANG
$lang = $_SESSION['lang'] = tools::convert_d4_to_d3_lang(DEDALO_APPLICATION_LANG);


# path to file
$lang_file = $lang;


$lang_path = DEDALO_LIB_BASE_PATH . '/dd/lang/'.$lang_file.'.php';


# load lang file
if(file_exists($lang_path)) {	
	require_once($lang_path);
}else{
	$codHeader = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';
	$msg = "$codHeader Dedalo Language not defined! ";
	if(NIVEL==10)
	$msg .= $lang_path;
	$msg .= " <br><a href=\"javascript:top.location='?lang=en';\"> Back </a> ";
	die($msg);
}
?>