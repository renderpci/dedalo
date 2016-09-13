<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

ignore_user_abort(true);


# set vars
	$vars = array('mode',);
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



	
# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* GENERATE_VIRTUAL_SECTION
*/
function generate_virtual_section() {
	
	#dump($_REQUEST, ' _REQUEST ++ '.to_string());

	$section_id 	= $_REQUEST['component_parent'];
	if (empty($section_id)) {	exit('<div class="error">Error: Empty section_id</div>');	}

	$section_tipo 	= $_REQUEST['section_tipo'];	
	if (empty($section_tipo)) {	exit('<div class="error">Error: Empty section_tipo</div>');	}

	$options = new stdClass();
		$options->section_id   = $section_id;
		$options->section_tipo = $section_tipo;
		
	$result = (object)hierarchy::generate_virtual_section( $options );

	#echo json_encode($result);
	switch (true) {
		case isset($result->result) && $result->result===true:
			$class = 'ok';
			break;
		case isset($result->result) && $result->result===false:
			$class = 'warning';
			break;
		default:
			$class = 'warning';
			break;
	}
	if (isset($result->msg)) {
		echo '<div class="'.$class.'">'.$result->msg.'</div>';
	}
	exit();
}//end generate_virtual_section



?>