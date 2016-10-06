<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');	
		foreach($vars as $name) $$name = common::setVar($name);

	# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	call_user_func($mode);
}



/**
* SAVE 
*/
function Save() {

	$vars = array('parent','tipo','lang','modo','section_tipo','dato');
		foreach($vars as $name) $$name = common::setVar($name);

	# DATA VERIFY
	if(empty($parent)) exit("Trigger Error: Nothing to save.. (parent:$parent)");
	if(empty($tipo) || strlen($tipo)<3) exit("Trigger Error: tipo is mandatory (tipo:$tipo)");
	if(empty($lang)) exit("Trigger Error: Nothing to save.. (lang:$lang)");
	if(empty($modo)) exit("Trigger Error: Nothing to save.. (modo:$modo)");
	if(empty($section_tipo) || strlen($section_tipo)<3) exit("Trigger Error: section_tipo is mandatory $tipo");
	
	
	# DATO . JSON DECODE TRY
	# dump($dato, ' dato ++ '.to_string());
	if (!$dato_clean = json_decode($dato)) {
		exit("Trigger Error: dato is not valid");
	}
	//dump($dato_clean, ' dato_clean ++ lang: '.to_string($lang)); die();
	
	
	# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL) 
	$modelo_name   = 'component_security_access';
	$component_obj = component_common::get_instance($modelo_name,
													$tipo,
													$parent,
													$modo,
													$lang,
													$section_tipo);



	# Get curren dato in DB
	$current_dato = $component_obj->get_dato();

	$new_dato = component_security_access::merge_dato((array)$current_dato, (array)$dato_clean);
		#dump($current_dato, ' current_dato ++ '.to_string());
		#dump($dato_clean, ' dato_clean ++ '.to_string());
		#dump($new_dato, ' new_dato ++ '.to_string());
		#return false;
	
	# Assign dato
	$component_obj->set_dato( $new_dato ); 
	
	# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
	$id = $component_obj->Save();
		#dump($component_obj, ' component_obj');	

	# Return id
	echo $id;

	# Write session to unlock session file
	session_write_close();	
	
	exit();

}#end Save





?>