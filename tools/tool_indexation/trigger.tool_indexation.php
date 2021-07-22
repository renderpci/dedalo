<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* DELETE_TAG
* Deletes all tag relations (index and portal) and finally removes the tag in all langs
* @return object $response
*/
function delete_tag($json_data) {
	global $start_time;

	$vars = array('section_tipo', 'section_id', 'component_tipo', 'tag_id', 'lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	$options = new stdClass();
		$options->section_tipo 	= $section_tipo;
		$options->section_id 	= $section_id;
		$options->component_tipo= $component_tipo;		
		$options->tag_id 		= $tag_id;
		$options->lang 			= $lang;

	$response = tool_indexation::delete_tag($options);

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end delete_tag
