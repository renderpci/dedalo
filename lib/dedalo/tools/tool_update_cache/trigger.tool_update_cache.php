<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

$seconds = 60 * 60 * 8;
set_time_limit ( $seconds );


# set vars
$vars = array('mode','section_tipo','section_id');
foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* UPDATE_CACHE
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='update_cache') { 	
	
	if (empty($section_tipo)) throw new Exception("Error Processing Request: Unable load_source_component ! (Few vars1)", 1);

	$tool_update_cache  = new tool_update_cache($section_tipo);
	$result 			= $tool_update_cache->update_cache();

	if(SHOW_DEBUG) {		
		#dump(tool_update_cache::$debug_response,'$tool_update_cache->debug_response');		
	}
	
	if ($result==true) {
		echo 'Ok. update_cache done.';
	}else{
		echo $result;
	}
	
	exit();
}



/**
* UPDATE_CACHE
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='update_cache_by_section_id') {
	
	if (empty($section_tipo)) throw new Exception("Error Processing Request: Unable load_source_component ! (Few vars1)", 1);
	if (empty($section_id))   throw new Exception("Error Processing Request: Unable load_source_component ! (Few vars2)", 1);


	$locator = new locator();
		$locator->set_section_tipo($section_tipo);
		$locator->set_section_id($section_id);	

	$options = new stdClass();
		$options->filter_by_id = array( $locator );
	
	$tool_update_cache  = new tool_update_cache($section_tipo);
	$result  			= $tool_update_cache->update_cache( $options );


	if(SHOW_DEBUG) {		
		#dump(tool_update_cache::$debug_response,'$tool_update_cache->debug_response');		
	}
	
	if ($result==true) {
		echo 'Ok. update_cache done. '. to_string($section_id);
	}else{
		echo $result;
	}
	
	debug_log(__METHOD__." update_cache_by_section_id trigger result: ".to_string($result), logger::DEBUG);

	exit();
}





?>