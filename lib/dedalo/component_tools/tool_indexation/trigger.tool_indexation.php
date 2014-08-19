<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','id_matrix','parent','tagName');	#, 'top_id_matrix', 'top_tipo'
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* load_inspector_indexation_list
* @param $tipo (text area tipo)
* @param $parent (section id matrix)
* @param $tagName (like '[/index-n-1]')
*/
if ($mode=='load_inspector_indexation_list') {
	#die("load_inspector_indexation_list des");
	if (empty($tagName)) {
		throw new Exception("load_inspector_indexation_list->tagName is empty", 1);		
	}

	# Create new component_text_area obj
	$component_text_area = new component_text_area($id_matrix, $tipo, 'edit', $parent, DEDALO_DATA_LANG);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		#dump($component_text_area,'$component_text_area');

	# add some vars to component
	#$component_text_area->caller_id = '';

	# Create new tool_indexation
	$tool_indexation = new tool_indexation($component_text_area,'terminos_list');
		#dump($tool_indexation,'$tool_indexation');

	# Add som vars to tool object
	$tool_indexation->selected_tagName = $tagName;
		#dump($tool_indexation,'$tool_indexation en load_inspector_indexation_list');	

	$html = $tool_indexation->get_html();
	
	print $html;
	exit();
	
}#end load_inspector_indexation_list


/**
* fragment_info
* @param $tipo (text area tipo)
* @param $parent (section id matrix)
* @param $tagName (like '[/index-n-1]')
*/
if ($mode=='fragment_info') {
	#die("fragment_info des");
	if (empty($tagName)) {
		throw new Exception("fragment_info->tagName is empty", 1);		
	}
	if (empty($tipo)) {
		throw new Exception("fragment_info->tipo is empty", 1);		
	}
	if (empty($id_matrix)) {
		throw new Exception("fragment_info->id_matrix is empty", 1);		
	}

	# Create new component_text_area obj
	$component_text_area = new component_text_area($id_matrix, $tipo, 'edit', $parent=null, DEDALO_DATA_LANG);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
		#dump($component_text_area,'$component_text_area');

	# add some vars to component
	#$component_text_area->caller_id = '';

	# TOOL_INDEXATION : Create new tool_indexation
	$tool_indexation = new tool_indexation($component_text_area,'fragment_info');		

	# Add som vars to tool object
	$tool_indexation->selected_tagName = $tagName;		
		#dump($tool_indexation,'$tool_indexation en fragment_info');

	$html = $tool_indexation->get_html();
	
	print $html;
	exit();
	
}#end fragment_info


?>