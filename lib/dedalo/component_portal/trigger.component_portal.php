<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','portal_tipo','portal_parent','target_section_tipo','rel_locator','dato','top_tipo','top_id','section_tipo','termino_id','portal_section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* SAVE_ORDER
*/
if ($mode=='save_order') {

	#$vars = array('portal_tipo','portal_parent','section_tipo','dato');
		#foreach($vars as $name) $$name = common::setVar($name);
	
	# Verify vars
	if( empty($portal_tipo) ) {
		trigger_error("Error portal_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($portal_parent) ) {
		trigger_error("Error portal_parent is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_parent is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($dato) ) {
		trigger_error("Error dato is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: dato is empty ! ", 1); 
		}		
		exit();
	}
	

	$component_portal = component_common::get_instance('component_portal', $portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		#dump($component_portal,'$component_portal');

	$dato = json_handler::decode($dato);
		#dump($dato,"dato");die();

	# EXPECTED FORMAT IS :
	# value: Array
	#	(
	#	    [0] => stdClass Object
	#	        (
	#	            [section_id] => 225077
	#	        )
	#
	#	    [1] => stdClass Object
	#	        (
	#	            [tag_id] => 2
	#	            [component_tipo] => dd751
	#	            [section_id] => 225041
	#	        )
	#
	#	    [2] => stdClass Object
	#	        (
	#	            [section_id] => 225050
	#	        )
	#
	#	)
	#	type: array

	# Verify first element
	if (isset($dato[0]) && !is_object($dato[0])) {
		if(SHOW_DEBUG) {
			dump($dato,"debug dato");
		}
		die("Error: dato format is wrong");
	}

	
	$dato_formatted=array();
	foreach ((array)$dato as $key => $value) {			
		if ( !is_object($value) || empty($value->section_id) ) {
			trigger_error("Error on save_order of portal rows. One or more elements are empty ");
			continue;
		}
		$dato_formatted[] = $value;
	}

	$component_portal->set_dato($dato);
	$component_portal->Save();

	# Reset session caches
	# Already made on save command
	 
	echo 'ok';
	exit();

}#end save_order



/**
* NEW_PORTAL_RECORD
* Save on matrix current relation
* @param $portal_id (Int id matrix from portal component)
* @param $portal_tipo (String tipo from portal
* @param $target_section_tipo (String tipo from section)
*/
if($mode=='new_portal_record') {

	#$vars = array('portal_tipo','portal_parent','portal_section_tipo','target_section_tipo','top_tipo','top_id');
		#foreach($vars as $name) $$name = common::setVar($name);

	# Verify vars	
	if( empty($portal_tipo) ) {
		trigger_error("Error portal_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($portal_parent) ) {
		trigger_error("Error portal_parent is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_parent is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($portal_section_tipo) ) {
		trigger_error("Error portal_section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_section_tipo is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($target_section_tipo) ) {
		trigger_error("Error target_section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: target_section_tipo is empty ! ", 1); 
		}
		exit();
	}
	if( empty($top_tipo) ) {
		trigger_error("Error top_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: top_tipo is empty ! ", 1); 
		}
		exit();
	}
	if( empty($top_id) ) {
		trigger_error("Error top_id is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: top_id is empty ! ", 1); 
		}
		exit();
	}	
	
	$new_portal_record = component_portal::create_new_portal_record( $portal_parent, $portal_tipo, $target_section_tipo, $top_tipo, $top_id, $portal_section_tipo );

	echo $new_portal_record;
	exit();
	
}#end new_portal_record



/**
* REMOVE_LOCATOR_FROM_PORTAL
*/
if($mode=='remove_locator_from_portal') {

	# Verify vars
	if( empty($portal_tipo) ) {
		throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); exit();
	}
	if( empty($portal_parent) ) {
		throw new Exception("Trigger Error: portal_parent is empty ! ", 1); exit();
	}
	if( empty($section_tipo) ) {		
		throw new Exception("Trigger Error: section_tipo is empty ! ", 1);	exit();	
	}
	if( empty($rel_locator) ) {
		throw new Exception("Trigger Error: rel_locator is empty ! ", 1); exit();
	}
	if( !$rel_locator = json_decode($rel_locator) ) {
		dump($rel_locator, ' rel_locator ++ '.to_string());
		throw new Exception("Trigger Error: rel_locator is invalid ! ", 1); exit();
	}		
	
	$component_portal = component_common::get_instance('component_portal',
														$portal_tipo,
														$portal_parent,
														'edit',
														DEDALO_DATA_NOLAN,
														$section_tipo);

	#SAVE the component portal with the new locator
	$result = $component_portal->remove_locator($rel_locator);
	$component_portal->Save();
		#dump($result,'$result');

	#DELETE AND UPDATE the state of this section and his parents
	$state = $component_portal->remove_state_from_locator($rel_locator);

	
	if ($result===true) {
		print 'ok';
	}else{
		print 'error: '.$result;
	}	
	exit();

}#end delete_portal_record



/**
* REMOVE_LOCATOR_FROM_PORTAL
*/
if($mode=='remove_resource_from_portal') {

	# Verify vars
	if( empty($portal_tipo) ) {
		throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); exit();
	}
	if( empty($portal_parent) ) {
		throw new Exception("Trigger Error: portal_parent is empty ! ", 1); exit();
	}
	if( empty($rel_locator) ) {
		throw new Exception("Trigger Error: rel_locator is empty ! ", 1); exit();
	}
	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}		
		exit();
	}
	
	$rel_locator = json_decode($rel_locator);
		#dump($rel_locator->section_id, 'rel_locator', array());die();
	
	$component_portal = component_common::get_instance('component_portal',
														$portal_tipo,
													 	$portal_parent,
													 	'edit',
														DEDALO_DATA_NOLAN,
														$section_tipo);

	# Return 'ok' / 'Sorry. You can not delete this resource because it is used in other records..'
	$msg = $component_portal->remove_resource_from_portal((object)$rel_locator, (string)$portal_tipo);
	
	#DELETE AND UPDATE the state of this section and his parents
	$state = $component_portal->remove_state_from_locator($rel_locator);
	
	echo $msg;
	exit();	

}#end delete_portal_record



/**
* SHOW_MORE
* Used in list to sow more than first element of current portal
*/
if($mode=='show_more') {

	if( empty($portal_tipo) ) {
		trigger_error("Error portal_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}
		exit();
	}
	if( empty($portal_parent) ) {
		trigger_error("Error portal_parent is mandatory");
		if(SHOW_DEBUG) {
			#throw new Exception("Trigger Error: portal_parent is empty ! ", 1); 
		}
		exit();
	}
	
	$component_portal = component_common::get_instance('component_portal',
													  $portal_tipo,
													  $portal_parent,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);
	$component_portal->html_options->skip_records = 1; // Skip first result
	$html = $component_portal->get_html();

	echo $html;
	exit();

}//end show_more








?>