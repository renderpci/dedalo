<?php
# SYNC LANG
	$lang = $_SESSION['lang'] = tools::convert_d4_to_d3_lang(DEDALO_APPLICATION_LANG);
	#dump($lang,'lang');


# from request
if(!empty($_REQUEST['lang'])) {
	
	$lang 				= $_REQUEST['lang'];
	$_SESSION['lang'] 	= $lang ;

# from session
}else if( !empty($_SESSION['lang']) ) {
	
	$lang = $_SESSION['lang']; 
}


# verify set correct lang		
if( empty($lang) ) {
	
	$lang  				= $lang_default;
	$_SESSION['lang'] 	= $lang ;
}


# path to file
$lang_file		= $lang;


$idioma_path = DEDALO_ROOT . '/lang/'.$lang_file.'.php';	 


# load lang file
	
# verify exists lang file
if(!file_exists($idioma_path)) {
	#dump($idioma_path,"$idioma_path not exists. using default lang instead");
	$idioma_path = DEDALO_ROOT .'/lang/'.$lang_default.'.php';	
}
	

# load lang file
if(file_exists($idioma_path)) {	
	require_once($idioma_path);
}else{
	$msg = "$codHeader Dedalo Language not defined! ";
	if(NIVEL==10)
	$msg .= $idioma_path;
	$msg .= " <br><a href=\"javascript:top.location='?lang=en';\"> Back </a> ";
	die($msg);
}

?>