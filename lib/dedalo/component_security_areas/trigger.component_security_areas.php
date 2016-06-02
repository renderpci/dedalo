<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode',);	
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* LOAD_ACCESS_ELEMENTS
*/
if($mode=='load_access_elements') {

	$vars = array('tipo','parent');	
		foreach($vars as $name) $$name = common::setVar($name);

	if (!$tipo) {
		echo "Opss. Error tipo is mandatory"; exit();
	}
	if (!$parent) {
		echo "Opss. Error parent is mandatory"; exit();
	}	
	
	#
	# SECTION ELEMENTS CHILDREN
	$ar_ts_childrens = component_security_access::get_ar_ts_childrens_recursive($tipo);	
		#dump($ar_ts_childrens, ' ar_ts_childrens ++ '.to_string());
		

	#
	# DATO_ACCESS	
	$component_security_access = component_common::get_instance('component_security_access',
																 DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																 $parent,
																 'list',
																 DEDALO_DATA_NOLAN,
																 DEDALO_SECTION_PROFILES_TIPO);
	$dato_access = $component_security_access->get_dato();
		#dump($dato_access, ' dato_access ++ '.to_string());

	$access_arguments=array();
		$access_arguments['dato'] 				= $dato_access;
		$access_arguments['parent'] 			= $parent;
		$access_arguments['dato_section_tipo'] 	= $tipo;
	
	$li_elements_html = component_security_access::walk_ar_elements_recursive($ar_ts_childrens, $access_arguments);
	
	$html  ='';
	$html .= "<ul>";
	$html .= $li_elements_html;
	$html .= "</ul>";

	echo $html;
	exit();

}//end load_access_elements

