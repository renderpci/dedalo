<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','parent','dato','tipo','lang','source_lang','target_lang');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* LOAD TARGET COMPONENT (RIGHT SIDE)
* @param $tipo
* @param $lang
* @param $parent
*/
if($mode=='XXXX') { 	
	
	if (empty($tipo) || empty($lang) || empty($parent)) throw new Exception("Error Processing Request: Unable load_source_component ! (Few vars1)", 1);

	$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($tipo);
	$id 			= component_common::get_id_by_tipo_parent($tipo, $parent, $lang);
	$modo 			= 'tool_lang';
	
	# COMPONENT	
	$component_obj				= new $modelo_name($id, $tipo, $modo, $parent, $lang);		
		#dump($id,"id NOT resolved from $tipo, $parent, $lang");
	
	#dump($component_obj,'component_obj');

	# Set variant to configure 'identificador_unico' of current component
	$component_obj->set_variant( tool_lang::$target_variant );

	# Get component html
	$html = $component_obj->get_html();

	# Store last target component
	$_SESSION['tool_lang']['last_target_lang'] = $lang;
	
	print $html;
	exit();
}


?>