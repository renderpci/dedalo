<?php
require_once( dirname(dirname(dirname(__FILE__))).'/config/config4.php');


#if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','lang_filter','ar_prefix_filter');
	foreach($vars as $name) $$name = common::setVar($name);



if ($mode=='alphabetic_tesauro') {

	require_once('lib/dedalo3/class.tesauro_works.php');

	$lang_filter 		= 'lg-spa';
	$ar_prefix_filter 	= array('dc','ts','on');
	

	if (empty($lang_filter) || empty($ar_prefix_filter)) {
		throw new Exception("Error Processing Request. Few vars", 1);		
	}
	
	
	$alphabetic_tesauro = (array)tesauro_works::get_alphabetic_tesauro(
		array(
			'lang_filter'		=> $lang_filter,
			'ar_prefix_filter'	=> $ar_prefix_filter
			)
		);
	$walk_alphabetic_tesauro = (array)tesauro_works::walk_alphabetic_tesauro($alphabetic_tesauro);
		dump($walk_alphabetic_tesauro,'$walk_alphabetic_tesauro');

	include 'html/alphabetic_tesauro.phtml';
	exit();

}#end alphabetic_tesauro







throw new Exception("Error Processing Request", 1);
?>