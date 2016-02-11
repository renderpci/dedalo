<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','parent','lang','section_tipo','top_tipo','options','type','dato');
		foreach($vars as $name)	$$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* UPDATE_STATE_LOCATOR
*/

if($mode=='update_state_locator') {


	# Verify vars
	if( empty($options) ) {
		trigger_error("Error options is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: options is empty ! ", 1); 
		}		
		exit();
	}
	if( $dato === false ) {
		trigger_error("Error dato is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: dato is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is manadatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}		
		exit();
	}

	$options = json_decode($options);
	$dato 	 = (int)$dato;


	$component_state = component_common::get_instance(	'component_state',
														$tipo,
														$parent,
														'edit',
														$lang,
														$section_tipo);

	$component_state->set_options($options);
	$current_valor   = $component_state->get_valor_for_checkbox();

	if($type == 'user'){
		$ar_dato = [$dato,$current_valor[1]];
	}else if($type == 'admin'){
		$ar_dato = [$current_valor[0],$dato];
	}else{
		exit('Error: Invalid type');
	}

	$result = $component_state->update_state_locator( $options, $ar_dato);

	if($result===true){
		echo 'ok';
	}else{
		echo 'error';
		debug_log(__METHOD__." Error on update_state_locator. result: ".to_string($result), logger::WARNING);
	}
	exit();

}#END update_state_locator



?>