<?php
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
include( dirname(__FILE__) .'/class.geonames.php');
# http://api.geonames.org/childrenJSON?geonameId=2510769&username=yoadev&maxRows=5000000

# Write session to unlock session file
session_write_close();

ignore_user_abort(true);

$start_time=microtime(1);


	echo $msg = "Adding geonames matched data for existing toponomy section records (based on equal names) ".safe_xss($_GET['section_tipo'])."<hr>"; ob_flush();flush();


	$vars = array('section_tipo','lang','base_value');
		foreach($vars as $name) {
			$$name = common::setVar($name, $json_data);
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
				
					
	$geo_options = new stdClass();
		$geo_options->section_tipo 		= $section_tipo;	// Like 'fr1';
		$geo_options->lang 				= $lang;			// Like 'lg-fra';
		$geo_options->base_value 		= $base_value;		// Like 'France';
		$geo_options->save 				= true;
		$geo_options->set_english_name	= true;
	tool_administration::add_geonames_code( $geo_options );


	
	$total=round(microtime(1)-$start_time,3);
	dump($geo_options->section_tipo, ' section_tipo ++ '.exec_time_unit($start_time,'ms').' ms');

	

ob_end_flush();
?>