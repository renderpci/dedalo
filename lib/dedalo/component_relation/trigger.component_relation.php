<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','section_tipo','id_matrix','parent','caller_id','rel_locator','terminoID','tipo');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");






/**
* REMOVE RELATION
* @param caller_id (id matrix from source component)
* @param $rel_locator String like '1235.0.0'
*/
if($mode=='remove_relation_from_section') {

	if(empty($tipo)) {
		if(SHOW_DEBUG)
			throw new Exception("Error Processing Request. tipo is empty", 1);			
		die("<span class='error'> Trigger: Error. Need tipo..</span>");
	}

	# CALLER ID
	$component_relation_id_matrix	= $caller_id;			
		if(empty($caller_id)) 	exit(" Error: caller_id is empty ! ");		
	
	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) exit(" Error: rel_locator is empty ! ");

	# SAVE TARGET DATA TO COMPONENT RELATION
		
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);	
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$component_relation_id_matrix);					#dump($RecordObj_matrix->get_dato(),'before');
		
		# get current dato in db
		$dato 				= $RecordObj_matrix->get_dato();

		# mix array current dato - target relation string like (1253.0.0)
		$new_ar_dato 		= component_relation::remove_relation_to_dato($rel_locator,$dato);		#dump($RecordObj_matrix->get_dato(),'after');
		
		# set new array dato and save record in matrix
		$RecordObj_matrix->set_dato($new_ar_dato);
		$RecordObj_matrix->Save();

	print 'ok';
	exit();
}






























?>