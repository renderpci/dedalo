<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','id_matrix','parent','tagName','caller_id','rel_locator');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* ADD RESOURCE
* Save on matrix current resource
* @param $caller_id (id matrix from source component_resource)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='add_resource') {

	# SOURCE
	$component_resource_id_matrix	= $caller_id;			
		if(empty($caller_id)) {
			throw new Exception("Error: caller_id is empty ! ", 1);
		 	exit();
		 }

	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) {
			throw new Exception("Error: rel_locator is empty ! ", 1);
			exit();
		}

	if(empty($tipo)) {
		if(SHOW_DEBUG)
			throw new Exception("Error Processing Request. tipo is empty", 1);			
		die("<span class='error'> Trigger: Error. Need tipo..</span>");
	}

	# SAVE rel_locator DATA TO COMPONENT resource
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$component_resource_id_matrix);
			#dump($RecordObj_matrix->get_dato(),'before',"for id: $component_resource_id_matrix");
		
		# get current dato in db
		$dato 				= $RecordObj_matrix->get_dato();

		# mix array current dato + rel_locator resource string like (1253.0.0)
		$new_ar_dato 		= component_common::add_locator_to_dato($rel_locator, $dato);
			#dump($RecordObj_matrix->get_dato(),'after',"for id: $component_relation_id_matrix");
		
		# set new array dato and save record in matrix
		$RecordObj_matrix->set_dato($new_ar_dato);
		$RecordObj_matrix->Save();

	print 'ok';
	exit();
}







?>