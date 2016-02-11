<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	#dump($_REQUEST);

# set vars
	$vars = array('mode','modo');	
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);		
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");




/**
* LOAD_ROWS
*/
if ($mode=='load_rows') {

	if(SHOW_DEBUG) {
		#dump($_REQUEST,"_REQUEST");
	}
	
	$options = $_POST['options'];


	# Received post var 'options' is a json object stringnified. Decode to regenrate original object
	$options = json_handler::decode($options);
		#dump($options,"options to object");die();

	if (isset($options->context) && is_string($options->context) ) {
		$options->context = json_decode($options->context);
	}
	#dump($options,"options to object");

	if (!is_object($options)) {
		die("Error. Received data must be a object (options)");
	}

	if (isset($options->limit)) {
		#$_SESSION['dedalo4']['config']['max_rows'] = $options->limit;
	}

	if (empty($options->section_tipo)) {
		if(SHOW_DEBUG) {
			throw new Exception("Error Processing Request. Ilegal section tipo", 1);
		}			
		die("Error on load rows. Ilegal section tipo");
	}
	if (empty($options->modo)) {
		if(SHOW_DEBUG) {
			throw new Exception("Error Processing Request. Empty modo", 1);
		}
		die("Error on load rows. Empty modo");
	}

	# Activity case : Only use
	if ($options->section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
		$options->tipo_de_dato 			= 'dato';
		$options->tipo_de_dato_order	= 'dato';
	}

	#$options = json_handler::decode(json_encode($options));	# Force array of objects instead default array of arrays format
		#dump($options, 'options', array()); die();

	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $options->section_tipo);
	}	
	#dump($options, ' options'); die();

	$section_records 	= new section_records($options->section_tipo, $options);
	$html 				= $section_records->get_html();
	#$html 			=(string)"<br>12345</br>";

	#$html 			= str_replace(':', '_', $html);
	#$html = filter_var($html, FILTER_SANITIZE_STRING);

	echo $html;
	die();


}#end if ($mode=='load_rows') 

?>