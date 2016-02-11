<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','tipo','parent','tagName','terminoID','rel_locator','tag','section_tipo');
		foreach($vars as $name) $$name = common::setVar($name);
	

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* ADD INDEX
* Save on MATRIX DESCRIPORS current index
* @param $teminoID (teminoID from tesauro)
* @param $rel_locator String like '1235.dd12.3'
*/
if($mode=='add_index') {

	# TERMINO ID 			
		if(empty($terminoID)) 	exit(" Error: terminoID is empty ! ");	

	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator)) exit(" Error: rel_locator is empty ! ");
		$rel_locator = json_handler::decode($rel_locator);
		if (!is_object($rel_locator)) exit(" Error: rel_locator no is object ! ");
			#dump($rel_locator,"rel_locator");die();

		$rel_locator_formatted=new stdClass();
		foreach ($rel_locator as $key => $value) {
			$rel_locator_formatted->$key = (string)$value;
		}

	# SAVE rel_locator DATA TO tesauro index (in table matrix descriptors)
		$matrix_table			= 'matrix_descriptors';
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $terminoID, DEDALO_DATA_NOLAN, 'index');		#dump($RecordObj_descriptors->get_dato(),'before'); __construct($id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false)

		
		# get current dato in db
		$dato	= $RecordObj_descriptors->get_dato();

		# Decode matrix_descriptors json string dato to array
		$dato	= json_handler::decode($dato);
			#dump($dato,"dato en db matrix_descriptors 2");#die();

		# mix array current dato + rel_locator relation string like (1253.0.0)
		#$new_ar_dato 			= component_common::add_locator_to_dato($rel_locator, $dato);
		$new_ar_dato 			= component_common::add_object_to_dato((object)$rel_locator_formatted, (array)$dato);
			#dump($new_ar_dato,"new_ar_dato 3");die();

		#$new_ar_dato = json_handler::encode($new_ar_dato);
			#dump($new_ar_dato,"new_ar_dato 4");die();

		# set new array dato and save record in matrix
		$RecordObj_descriptors->set_dato($new_ar_dato);
			#dump($RecordObj_descriptors->get_dato(),'after');

		$RecordObj_descriptors->Save();

		
		if(SHOW_DEBUG) {
			#error_log("Added rel_locator ". json_encode($rel_locator_formatted) ." from matrix_descriptors parent $terminoID");
		}		

	print 'ok';
	exit();
}

/**
* REMOVE INDEX
*/
if($mode=='remove_index') {
		
	# REL LOCATOR . Verify isset rel_locator
		if(empty($rel_locator) || !isset($rel_locator['section_top_tipo'])) exit(" Error: rel_locator is empty ! ");
			#dump($rel_locator,"rel_locator");die();

	# TERMINO ID : Necesario para despejar la tabla			
		if(empty($terminoID)) 	exit(" Error: terminoID is empty ! ");

	# SAVE rel_locator DATA TO tesauro index
		$matrix_table			= 'matrix_descriptors';
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, null, $parent=$terminoID, $lang=DEDALO_DATA_NOLAN, 'index');

		#$id = $RecordObj_descriptors->get_id();
			#dump($RecordObj_descriptors,"RecordObj_descriptors");
		#$RecordObj_descriptors->remove_index($rel_locator);

		$dato			= $RecordObj_descriptors->get_dato();
		# Dato is string in matrix descriptors. Convert to object from something like [{"section_top_tipo":"dd12","section_top_id":"474116","section_id_matrix":"474116","component_tipo":"dd22","tag_id":"1"},{"section_top_tipo":"dd12","section_top_id_matrix":"474116","section_id_matrix":"474116","component_tipo":"dd22","tag_id":"2"}]
		$dato			= json_handler::decode($dato);
		$new_ar_dato	= component_common::remove_object_in_dato((object)$rel_locator, (array)$dato);
		$RecordObj_descriptors->set_dato($new_ar_dato);

		$RecordObj_descriptors->Save();

		debug_log(" Removed rel_locator ". json_encode($rel_locator) ." from matrix_descriptors parent $terminoID");

	print 'ok';
	exit();
}



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
	#$component_text_area = new component_text_area($tipo, $parent, 'edit', DEDALO_DATA_LANG);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
	$component_text_area = component_common::get_instance('component_text_area', $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
		#dump($component_text_area,'$component_text_area');

	# add some vars to component
	#$component_text_area->caller_id = '';

	# Create new tool_indexation
	$tool_indexation = new tool_indexation($component_text_area,'terminos_list');
		#dump($tool_indexation,'$tool_indexation');die();

	# Add som vars to tool object
	$tool_indexation->selected_tagName = $tagName;
		#dump($tool_indexation,'$tool_indexation en load_inspector_indexation_list');	

	$html = $tool_indexation->get_html();
		#dump($html,"html");
	
	print $html;
	exit();
	
}#end load_inspector_indexation_list



/**
* FRAGMENT_INFO
* @param string $tipo (text area tipo)
* @param string $parent (section id matrix)
* @param string $tagName (like '[/index-n-1]')
*/
if ($mode=='fragment_info') {
	#die("fragment_info des");
	if (empty($tagName)) {
		throw new Exception("fragment_info->tagName is empty", 1);		
	}
	if (empty($tipo)) {
		throw new Exception("fragment_info->tipo is empty", 1);		
	}
	if (empty($parent)) {		
		throw new Exception("fragment_info->parent is empty", 1);		
	}
	if (empty($section_tipo)) {		
		throw new Exception("fragment_info->section_tipo is empty", 1);		
	}

	# Create new component_text_area obj
	#$component_text_area = new component_text_area($tipo, $parent, 'edit', DEDALO_DATA_LANG);	#($id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
	$component_text_area = component_common::get_instance('component_text_area', $tipo, $parent, 'edit', DEDALO_DATA_LANG, $section_tipo);
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




/**
* DELETE_TAG
* Delete / remove current tag in all compoenent langs, all references in portals / relations and index term row locator
* @param string $tag like '[index-n-2]'
* @param string $rel_locator (locator object encoded in json)
* @param int parent like '63' (id matrix)
* @param string $tipo like 'rsc36'
*/
if($mode=='delete_tag') {
	
	# Verify
	if(empty($tag)) { // like '[index-n-1]'
		trigger_error("Empty tag");
		exit();
	}	
	if(empty($section_tipo)) {
		trigger_error("Empty section_tipo");
		exit();
	}
	if(empty($parent)) {
		trigger_error("Empty parent");
		exit();
	}
	if(empty($tipo)) {
		trigger_error("Empty tipo");
		exit();
	}
	if(empty($rel_locator)) {
		trigger_error("Empty rel_locator");
		exit();
	}
	$rel_locator = json_handler::decode($rel_locator); // Convert string to object
	if (!is_object($rel_locator)) {
		trigger_error("Empty rel_locator");
		exit();
	}
	#dump($tag, ' tag');die();

	#
	# 1 INDEX . Remove all references in descriptors->index 
	# Remove current locator from array data of all rows in matrix_descriptors
	$ar_deleted = RecordObj_descriptors::delete_rel_locator_from_all_indexes($rel_locator);
	if(SHOW_DEBUG) {
		debug_log(" INFO: Deleted rel_locator_from_all_indexes (RecordObj_descriptors): ".to_string($ar_deleted));
	}
		#dump($ar_deleted, ' ar_deleted');die();

	#
	# 2 PORTALS . Remove all references in all portals
	/*
		WORK IN PROGRESS..
		Por acabar.. (de momento no se usa en los sistemas instalados, por lo que se obvia hasta otra fase)
		$tag_id 	= TR::tag2value($tag);
		$ar_deleted = component_portal::remove_references_to_tag( $tag_id, $section_tipo );	
	*/


	# 
	# 3 RELATIONS . Remove all references in all relations
	# UNDER CONSTRUCTION..


	#
	# 4 COMPONENT_TEXT_AREA (ALL LANGS)
	# Remove current tag in current component all langs
	$component_text_area = component_common::get_instance('component_text_area',$tipo,$parent,'edit',DEDALO_DATA_LANG,$section_tipo);		
	$ar_deleted 		 = $component_text_area->delete_tag_from_all_langs($tag);
	if(SHOW_DEBUG) {
		debug_log(" INFO: Deleted tag $tag from component text area langs: ".to_string($ar_deleted));
	}


	print 'ok';	// Expected response is string 'ok'
	exit();
}



?>