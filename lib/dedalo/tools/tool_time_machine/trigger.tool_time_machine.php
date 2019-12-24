<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php' );
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* render_component
* @param object $json_data
*/
function render_component($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent','modo','lang','section_tipo','role');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='dato') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$modo 			= 'tool_lang';
	#$modo 			= 'tool_structuration';

	# COMPONENT
	$component_obj	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);
	#dump($component_obj,"component_obj tipo:$tipo, parent:$parent, modo:$modo, lang: $lang");
	#$component_obj->set_variant( tool_lang::$source_variant );


	if ($role==="selector_source") {
		$component_obj->role = "source_lang";
	}

	# Get component html
	$html = $component_obj->get_html();

	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

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
}//end render_component


