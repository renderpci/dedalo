<?php
// JSON DOCUMENT
header('Content-Type: application/json');

require_once( dirname(dirname(__FILE__)).'/config/config4.php');

# Login verify os disabled
if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo (string)json_encode($result);
}


/**
* LOAD_TR 
*/
function load_tr() {

	# set vars
	$vars = array('tipo','parent','section_tipo','lang','top_tipo','top_id');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed load_tr';

	# DATA VERIFY
	if(empty($tipo) || empty($section_tipo) || empty($parent)) {
		$response->msg = "Error. Few vars for trigger";
		return $response;
	}

	$modelo_name 		 = 'component_text_area';
	$modo 				 = 'load_tr';
	$component_text_area = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);

	$html = $component_text_area->get_html();
	$response = new stdClass();
		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done successfully load_tr';
	
	return (object)$response;
}#end load_tr



/**
* LOAD_TAGS_PERSON
* @return object $response
*/
function load_tags_person() {
	
	# set vars
	$vars = array('tipo','parent','section_tipo','lang');
		foreach($vars as $name) $$name = common::setVar($name);	

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed load_tags_person';


	if (TOP_TIPO===false) {
		$response->msg .= ' top tipo is empty';
		return $response;
	}


	# Component text area build
	$modelo_name 		 = 'component_text_area';
	$modo 				 = 'load_tr';
	$component_text_area = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
	# TAGS_PERSON
	$ar_tags_person = $component_text_area->get_tags_person();
		#dump($ar_tags_person, ' ar_tags_person ++ '.to_string());

	/*
	ob_start();
	include ( dirname(__FILE__) .'/html/component_text_area_persons.phtml' );
	$html =  ob_get_clean();
	*/
	$response->result = $ar_tags_person;
	$response->msg 	  = 'Ok. Request done successfully load_tags_person';

	return $response;
}//end load_tags_person




/**
* SHOW_PERSON_INFO
* @return 
*/
function show_person_info() {

	# set vars
	$vars = array('locator');
		foreach($vars as $name) $$name = common::setVar($name);

	$locator = json_decode($locator);
	
	# Label
	$label = (object)component_text_area::get_tag_person_label($locator);


	return (object)$label;
}//end show_person_info



/**
* PERSON_USED
* @return array $ar_section_id
*/
function person_used() {

	# set vars
	$vars = array('locator');
		foreach($vars as $name) $$name = common::setVar($name);

	$locator = json_decode($locator);

	$ar_section_id = component_text_area::person_used($locator);
		#dump($ar_section_id, ' ar_section_id ++ '.to_string());
	
	return (array)$ar_section_id;
}//end person_used



/**
* CREATE_NEW_NOTE
* @return 
*/
function create_new_note() {
	
	# set vars
	$vars = array('note_number');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = component_text_area::create_new_note();

	return (object)$response;
}//end create_new_note



/**
* SHOW_NOTE_INFO
* @return 
*/
function show_note_info() {

	# set vars
	$vars = array('section_tipo','section_id','lang');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed show_note_info';

	// COMPONENT_TEXT_HTML
	$tipo 			= DEDALO_NOTES_TEXT_TIPO;
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_text = component_common::get_instance($modelo_name,
													 $tipo,
													 $section_id,
													 'edit_note',
													 $lang,
													 $section_tipo);
	$component_text_html = $component_text->get_html();

	// SECTION INFO
	$section = section::get_instance($section_id, $section_tipo);
	$modified_by_userID 	= $section->get_modified_by_userID();
	$modified_date 			= $section->get_modified_date();
	$created_by_userID 		= $section->get_created_by_userID();
	$created_by_user_name 	= $section->get_created_by_user_name();
	$created_date 			= $section->get_created_date();


	$response->result 				= true;
	$response->msg 					= 'Request done successfully [show_note_info]';
	$response->component_text_html 	= $component_text_html;
	$response->modified_by_userID 	= $modified_by_userID;
	$response->modified_date 		= $modified_date;
	$response->created_by_userID 	= $created_by_userID;
	$response->created_by_user_name = $created_by_user_name;
	$response->created_date 		= $created_date;
	

	return (object)$response;
}//end show_note_info



/**
* DELETE_NOTE
* @return object $response
*/
function delete_note() {
	
	# set vars
	$vars = array('section_tipo','section_id','lang');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request delete_note failed';

	$section = section::get_instance($section_id, $section_tipo);
	$result  = $section->Delete($delete_mode='delete_record');
	if ($result===true) {
		$response->result 	= true;
		$response->msg 		= 'Section '.$section_tipo.' - '.$section_id.' deleted successfully [delete_note]';
	}
	

	return (object)$response;
}//end delete_note




?>