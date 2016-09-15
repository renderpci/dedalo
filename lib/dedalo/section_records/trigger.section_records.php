<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

#dump($_REQUEST);
//session_write_close();

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);		
	

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* LOAD_ROWS
*/
function load_rows() {

	if(SHOW_DEBUG) {
		#dump($_REQUEST,"_REQUEST");
		$start_time=microtime(1);
	}
	
	#$options = $_REQUEST['options'];

	# set vars
	$vars = array('options');
		foreach($vars as $name) $$name = common::setVar($name);	


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

	# Reset offset
	#$options->offset = 0;
	#$options->offset_list = 0;

	#$options = json_handler::decode(json_encode($options));	# Force array of objects instead default array of arrays format
		#dump($options, 'options', array()); #die();

	if (!defined('SECTION_TIPO')) {
		define('SECTION_TIPO', $options->section_tipo);
	}	
	#dump($options, ' options'); die();

	$section_records 	= new section_records($options->section_tipo, $options);
	$html 				= $section_records->get_html();
	#$html 			=(string)"<br>12345</br>";

	#$html 			= str_replace(':', '_', $html);
	#$html = filter_var($html, FILTER_SANITIZE_STRING);

	if(SHOW_DEBUG) {
		$total=round(microtime(1)-$start_time,3);
		debug_log(__METHOD__." Total: (load_rows) ".exec_time($start_time), logger::DEBUG);	;
	}
	
	session_write_close();
	echo $html;
}//end load_rows



/**
* LOAD_CHILDRENS
* @return string $childrens_html
*/
function load_childrens() {

	//session_write_close();

	if(SHOW_DEBUG) {
		#dump($_REQUEST,"_REQUEST");
		$start_time=microtime(1);
	}

	# set vars
	$vars = array('ar_childrens');
		foreach($vars as $name) $$name = common::setVar($name);		

	if (!$ar_childrens) {
		exit("Error. No childrens are received");
	}

	# load needed class
	include(DEDALO_LIB_BASE_PATH.'/section_records/row_thesaurus/class.row_thesaurus.php');


	$childrens_html='';

	# iterate all childrens and get each html
	$ar_childrens = json_decode($ar_childrens);
	$ar_rows 	  = array();
	foreach ((array)$ar_childrens as $current_locator) {
		$row_thesaurus = new row_thesaurus($current_locator->section_id, $current_locator->section_tipo);
			#dump($row_thesaurus, ' row_thesaurus ++ '.to_string());
		$html  = $row_thesaurus->get_html();
		$order = $row_thesaurus->get_order();
		$ar_rows[] = array( 'order'=>$order, 'html'=>$html );
	}

	# ORDER BY COLUMN 'order'
	usort($ar_rows, function ($item1, $item2) {
	    if ($item1['order'] == $item2['order']) return 0;
	    return $item1['order'] < $item2['order'] ? -1 : 1;
	});	
	#dump($ar_rows, ' ar_rows 2 ++ '.to_string());

	# ITERATE ORDERED ROWS
	foreach ($ar_rows as $key => $value) {
		$childrens_html .= $value['html'];
	}
	

	if(SHOW_DEBUG) {
		$total=round(microtime(1)-$start_time,3)*1000;
		$n_elements 	= count($ar_childrens);
		$time_element 	= $total/$n_elements;

		$msg = " <pre style=\"margin-left:50px\">Total: [$n_elements] $total ms. $time_element ms by element</pre>";
		$childrens_html = $msg . $childrens_html;
		#$start, $method=NULL, $result=NULL;
		debug_log(__METHOD__.' '.$msg, logger::DEBUG);
		#$childrens_html .= "<div>$msg</div>";
	}

	
	echo $childrens_html;
}//end load_childrens




?>