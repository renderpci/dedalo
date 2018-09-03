<?php
$start_time=microtime(1);
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


/**
* GET_RELATION_LIST_JSON
* @return object $response
*/
function load_image_from_url($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= null;
		$response->msg 		= 'Error. fail to parse request vars [get_relation_list_json]';

	$vars = array('image_id','quality','aditional_path','initial_media_path','source_quality','target_quality','tipo','parent','section_tipo', 'external_source');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
		}


	$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
	$component_image 	= component_common::get_instance($component_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);

	$component_image->set_quality($quality);
	$component_image->set_image_id($image_id);
	$component_image->set_target_dir($component_image->ImageObj->media_path_server);

	$imageurl 		= $component_image->get_external_source();
	$local_path 	= $component_image->ImageObj->media_path_server;
	$extension 		= $component_image->ImageObj->get_extension();
	$local_store 	= $local_path.$image_id.'.'.$extension; 


	#dump($component_image, '$component_image');

	$tool_upload 	= new tool_upload($component_image);
	

	$response = $tool_upload->load_image_from_url($imageurl, $local_store);

	$component_image->convert_quality( $source_quality, $target_quality );

	return (object)$response;



}//end load_image_from_url




/**
* GENERATE VERSION PROCESSING TO CHANGE HERE THE ORIGINAL TRIGGER
* Build a minor quality version of current file (from 404 to 'audio' for example)
* @param $source_quality
* @param $target_quality
* @param $image_id
*/
function generate_version($json_data) {

	global $start_time;

	$response = new stdClass();
		$response->result 	= null;
		$response->msg 		= 'Error. fail to parse request vars [get_relation_list_json]';

	$vars = array('image_id','quality','aditional_path','initial_media_path','source_quality','target_quality','tipo','parent','section_tipo', 'external_source');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);			
		}

	if (empty($source_quality)) {
		return "Error: source_quality is not defined!";
	}
	if (empty($target_quality)) {
		return "Error: target_quality is not defined!";
	}
	if (empty($image_id) || strlen($image_id)<1) {
		return "Error: image_id is not defined!";
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}

	#
	# NOTA: YA EXISTE en component_image un método de conversión. Actualizar esto cuando sea posible en algo corto de tipo:
	# $component_image->convert_quality( $source_quality, $target_quality );
	
	$component_image->convert_quality( $source_quality, $target_quality );

}#and generate_version


?>