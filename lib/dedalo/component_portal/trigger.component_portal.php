<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','portal_tipo','portal_id','portal_parent','target_section_tipo','rel_locator');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* NEW_PORTAL_RECORD
* Save on matrix current relation
* @param $portal_id (Int id matrix from portal component)
* @param $portal_tipo (String tipo from portal
* @param $target_section_tipo (String tipo from section)
*/
if($mode=='new_portal_record') {

	# Verify vars
	if( empty($portal_tipo) ) {
		throw new Exception("Trigger Error: portal_tipo is empty ! ", 1); exit();
	}
	if( $portal_id<1 ) {
		throw new Exception("Trigger Error: portal_id is empty ! Is possible that this record is previous and don´t have portal record ", 1); exit();
	}	
	if( empty($target_section_tipo) ) {
		throw new Exception("Trigger Error: target_section_tipo is empty ! ", 1); exit();
	}

	
	#dump($section,'$section');
	$new_portal_record = component_portal::create_new_portal_record( $portal_id, $portal_tipo, $target_section_tipo );
	print $new_portal_record;
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
	if( empty($portal_id) ) {
		throw new Exception("Trigger Error: portal_id is empty ! ", 1); exit();
	}
	if( empty($portal_parent) ) {
		throw new Exception("Trigger Error: portal_parent is empty ! ", 1); exit();
	}
	if( empty($rel_locator) ) {
		throw new Exception("Trigger Error: rel_locator is empty ! ", 1); exit();
	}
	
	$component_portal = new component_portal($portal_id, $portal_tipo, 'edit', $portal_parent, DEDALO_DATA_NOLAN);
		#dump($component_portal,'$component_portal');

	$result = $component_portal->remove_locator_from_portal($rel_locator);
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
	if( empty($portal_id) ) {
		throw new Exception("Trigger Error: portal_id is empty ! ", 1); exit();
	}
	if( empty($portal_parent) ) {
		throw new Exception("Trigger Error: portal_parent is empty ! ", 1); exit();
	}
	if( empty($rel_locator) ) {
		throw new Exception("Trigger Error: rel_locator is empty ! ", 1); exit();
	}
	
	$component_portal = new component_portal($portal_id, $portal_tipo, 'edit', $portal_parent, DEDALO_DATA_NOLAN);
		#dump($component_portal,'$component_portal');

	# Todas las referencias a el recurso dado con el locator
	$all_resource_references = $component_portal->get_all_resource_references($rel_locator, $portal_tipo);
	
	# Remove self section reference
	$all_resource_references = array_diff($all_resource_references, array($portal_parent));	
		#dump($all_resource_references,"all_resource_references - ".count($all_resource_references)." - portal_parent:$portal_parent");
	
	if (count($all_resource_references)>0) {

		# CASE 1 . Hay otros registros que usan este recurso. Avisamos de que NO se puede eliminar el mismo y no hacemos nada.
		$msg_html='Sorry. You can not delete this resource because it is used in other records: <br>';
		foreach ($all_resource_references as $current_section_id) {

			$section_tipo 			= common::get_tipo_by_id($current_section_id, $table='matrix');
			$section 				= new section($current_section_id,$section_tipo);			
			$section_id_number 		= $section->get_section_id();
			$section_termino 		= RecordObj_ts::get_termino_by_tipo($section_tipo);
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

}#end delete_portal_record


?>