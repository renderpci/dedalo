<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','portal_tipo','portal_parent','target_section_tipo','rel_locator','dato','top_tipo','top_id','section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

/**
* SAVE_ORDER
*/
if ($mode=='save_order') {
	
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
	if( empty($dato) ) {
		trigger_error("Error dato is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: dato is empty ! ", 1); 
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

	$component_portal = component_common::get_instance('component_portal',$portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
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
	foreach ($dato as $key => $value) {			
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
	die();



}#end save_order


/**
* NEW_PORTAL_RECORD
* Save on matrix current relation
* @param $portal_id (Int id matrix from portal component)
* @param $portal_tipo (String tipo from portal
* @param $target_section_tipo (String tipo from section)
*/
if($mode=='new_portal_record') {

	# Verify vars
	if( empty($portal_parent) ) {
		trigger_error("Error portal_parent is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_parent is empty ! ", 1); 
		}		
		exit();
	}
	if( empty($portal_tipo) ) {
		trigger_error("Error portal_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); 
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

	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}
		exit();
	}
	
	
	#dump($section,'$section');
	$new_portal_record = component_portal::create_new_portal_record( $portal_parent, $portal_tipo, $target_section_tipo, $top_tipo, $top_id, $section_tipo );


	echo $new_portal_record;
	die();
	
}#end new_portal_record


/**
* REMOVE_LOCATOR_FROM_PORTAL
*/
if($mode=='remove_locator_from_portal') {

	# Verify vars
	if( empty($portal_tipo) ) {
		throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); exit();
	}
	#if( empty($portal_id) ) {
	#	throw new Exception("Trigger Error: portal_id is empty ! ", 1); exit();
	#}
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

	$rel_locator = (object)$rel_locator;
	#dump($rel_locator,"rel_locator");die();
	
	#$component_portal = new component_portal($portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN);
	$component_portal = component_common::get_instance('component_portal',$portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		#dump($component_portal,'$component_portal');

	$result = $component_portal->remove_locator($rel_locator);
	$component_portal->Save();
		#dump($result,'$result');

	
	if ($result===true) {
		print 'ok';
	}else{
		print 'error: '.$result;
	}	
	die();

}#end delete_portal_record



/**
* REMOVE_LOCATOR_FROM_PORTAL
*/
if($mode=='remove_resource_from_portal') {

	# Verify vars
	if( empty($portal_tipo) ) {
		throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); exit();
	}
	#if( empty($portal_id) ) {
	#	throw new Exception("Trigger Error: portal_id is empty ! ", 1); exit();
	#}
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

	if( empty($section_tipo) ) {
		trigger_error("Error section_tipo is mandatory");
		if(SHOW_DEBUG) {
			throw new Exception("Trigger Error: section_tipo is empty ! ", 1); 
		}		
		exit();
	}
	$rel_locator = (object)$rel_locator;
		#dump($rel_locator->section_id, 'rel_locator', array());die();
	
	#$component_portal = new component_portal($portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN);
	$component_portal = component_common::get_instance('component_portal',$portal_tipo, $portal_parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);
		#dump($component_portal,'$component_portal');


	# Return 'ok' / 'Sorry. You can not delete this resource because it is used in other records..'
	$msg = $component_portal->remove_resource_from_portal((object)$rel_locator, (string)$portal_tipo);
	echo $msg;
	die();

	/*
	# Todas las referencias a el recurso dado con el locator
	#$all_resource_references = $component_portal->get_all_resource_references($rel_locator, $portal_tipo);
	$options = new stdClass();
		$options->to_find 				= $rel_locator->section_id;
		$options->filter_by_modelo_name	= 'component_portal';
		$options->tipo 					= $target_section_tipo;
		
	$references = (array)common::get_references($options);
	$all_resource_references = array_keys($references);
	
	# Remove self section reference
	$all_resource_references = array_diff($all_resource_references, array($portal_parent));	
		#dump($all_resource_references,"all_resource_references - ".count($all_resource_references)." - portal_parent:$portal_parent");
	
	if (count($all_resource_references)>0) {

		# CASE 1 . Hay otros registros que usan este recurso. Avisamos de que NO se puede eliminar el mismo y no hacemos nada.
		$msg_html='Sorry. You can not delete this resource because it is used in other records: <br>';
		foreach ($all_resource_references as $current_section_id) {

			$section_tipo 			= common::get_tipo_by_id($current_section_id, $table='matrix');
			$section 				= section::get_instance($current_section_id,$section_tipo);			
			$section_id_number 		= $section->get_section_id();
			$section_termino 		= RecordObj_dd::get_termino_by_tipo($section_tipo,null,true);
			if ($current_section_id!=$portal_parent) {
				$msg_html .= "<br> Ref. $section_id_number - $section_termino ";
				if(SHOW_DEBUG) $msg_html .= " id_matrix:$current_section_id";
			}			
		}
		print($msg_html);
		die();		
	
	}else{

		# CASE 2 . No hay otros registros que usen este recurso. Podemos borrarlo tranquilamente y lo hacemos.
		$component_portal->remove_resource_from_portal($rel_locator, $portal_tipo);
		print 'ok';
		die();
	}
	*/

}#end delete_portal_record




?>